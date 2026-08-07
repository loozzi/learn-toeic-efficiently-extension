# IMEN — Chrome Extension luyện đề TOEIC bằng AI

**Ngày:** 2026-08-07
**Trạng thái:** Design đã duyệt, chờ lập implementation plan
**Người implement:** Codex · **Người review:** chủ dự án

---

## 1. Mục tiêu

Extension giúp người học TOEIC hiểu nhanh vì sao một đáp án đúng, vì sao mình chọn sai, và tích luỹ dữ liệu để biết mình yếu chỗ nào.

Phạm vi cố ý hẹp: **trắc nghiệm TOEIC dạng chữ và hình**. Không phải một nền tảng học tiếng Anh tổng quát.

### Tiêu chí thành công

1. Bôi đen một cụm câu hỏi trên trang luyện đề bất kỳ → nhận được giải thích trong dưới 15 giây.
2. Người dùng khai báo được đáp án mình đã chọn **trước khi** biết đáp án đúng.
3. Sau ~50 câu, trang Thống kê chỉ ra được 3 chủ điểm ngữ pháp/từ vựng yếu nhất.

---

## 2. Quyết định đã chốt

| Trục | Lựa chọn | Lý do |
|---|---|---|
| Bối cảnh | TOEIC là chính | Prompt và phân loại `topic` tối ưu cho Part 5/6/7 |
| Lịch sử | Dashboard thống kê điểm yếu (không SRS) | Đủ để biết yếu gì mà không đội scope |
| Stack | Vite + React + TypeScript + Tailwind, `@crxjs/vite-plugin` | TS giúp review code sinh tự động dễ bắt lỗi |
| UI chính | Chrome Side Panel (Chrome 116+) | Không đụng DOM trang, không bị CSS/CSP site phá, giữ nguyên khi scroll |
| Ảnh | DOM → screenshot fallback → snip thủ công | Phủ được cả site HTML thường lẫn canvas/PDF |
| Ngôn ngữ giải thích | Dropdown trong Settings: Việt / Anh / Song ngữ, mặc định **Việt** | |
| Pipeline AI | Tách 3 bước: parse → analyze → error-psych | Đo lường trung thực; mỗi prompt đơn nhiệm, dễ tune và dễ review |

---

## 3. Kiến trúc

### 3.1 Nguyên tắc bất biến

**API key chỉ tồn tại trong service worker.** Content script không bao giờ thấy nó; side panel cũng không. Mọi lời gọi tới provider AI đi qua background. Đây là điểm review số một.

### 3.2 Ranh giới thành phần

| Thành phần | Trách nhiệm | Cấm |
|---|---|---|
| `content/` | Theo dõi bôi đen, vẽ nút nổi trong Shadow DOM, quét ảnh giao vùng chọn, overlay snip | Gọi AI, đọc API key, đọc IndexedDB |
| `background/` | Router message, gọi AI, fetch ảnh cross-origin, capture + crop, ghi history | Render UI |
| `sidepanel/` | Luồng chính Parse → Review → Result → Error | Gọi provider AI trực tiếp |
| `app/` (tab riêng) | Lịch sử, Thống kê, Cài đặt | — |

**Không có action popup.** Bấm icon extension = mở side panel (`chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`). Luồng dán thủ công nằm trong tab "Dán đề" của side panel. Bớt được một bề mặt UI phải bảo trì.

### 3.3 Cây thư mục

```
src/
  manifest.config.ts
  shared/
    types.ts              # entity dùng chung
    messages.ts           # discriminated union mọi message + helper send/on có kiểu
    storage/
      settings.ts         # wrapper chrome.storage.local
      history.ts          # CRUD IndexedDB qua idb
      stats.ts            # truy vấn tổng hợp cho dashboard
  ai/
    types.ts              # AIProvider, ChatRequest
    openai.ts             # adapter OpenAI-compatible
    gemini.ts             # adapter Gemini
    index.ts              # factory theo Settings
    schema.ts             # zod schema + repair/retry
    prompts/
      parse.ts  analyze.ts  errorPsych.ts  weakness.ts
  background/
    index.ts              # message router
    aiRunner.ts           # điều phối 3 bước, relay stream qua port
    capture.ts            # fetch ảnh → Blob, captureVisibleTab + crop
  content/
    index.ts  selection.ts  trigger.tsx  imageScan.ts  snip.tsx
  sidepanel/
    App.tsx  views/{Paste,Review,Result}.tsx  components/
  app/
    App.tsx  views/{History,Stats,Settings}.tsx
```

`shared/messages.ts` là nơi duy nhất định nghĩa message. Không có chỗ nào trong codebase gửi message bằng string tự do.

### 3.4 Permissions

```jsonc
{
  "permissions": ["storage", "sidePanel", "activeTab", "scripting", "unlimitedStorage"],
  "host_permissions": ["<all_urls>"]
}
```

`<all_urls>` cần cho hai việc: chạy content script trên mọi site luyện đề, và fetch ảnh cross-origin từ service worker (né CORS).

---

## 4. Mô hình dữ liệu

### 4.1 Hai kho, tách có chủ đích

**`chrome.storage.local`** → `Settings`.
Cố ý **không** dùng `storage.sync`: sync sẽ đẩy API key lên cloud Google.
Đánh đổi phải nêu rõ: `storage.local` **không mã hoá** — ai truy cập được profile Chrome đều đọc được key. Trang Settings phải hiển thị cảnh báo này.

**IndexedDB** (qua thư viện `idb`) → history. Lý do: `storage.local` giới hạn ~10MB, ảnh sẽ ăn sạch.
Object stores: `sessions`, `questions`, `analyses`, `attempts`, `errorAnalyses`, `images` (lưu `Blob`, **không** lưu base64).

`attempts` là **nguồn sự thật duy nhất** cho "người dùng đã trả lời gì, lúc nào". Lần trả lời đầu và mọi lần "Làm lại câu này" đều ghi thành bản ghi `Attempt` mới. Trang Thống kê đọc từ store này. `QuestionAnalysis` **không** chứa `userAnswer` — giải thích đáp án đúng không đổi giữa các lần làm lại.

### 4.2 Kiểu dữ liệu

```ts
type Provider = 'openai' | 'gemini';
type ExplanationLanguage = 'vi' | 'en' | 'bilingual';

interface ProviderConfig {
  provider: Provider;
  baseUrl?: string;         // trống = endpoint mặc định của provider
  apiKey: string;           // bắt buộc
  model: string;            // bắt buộc
  supportsVision: boolean;  // checkbox trong Settings, mặc định true
}

interface Settings {
  ai: ProviderConfig;
  explanationLanguage: ExplanationLanguage;  // mặc định 'vi'
  captureImages: boolean;                    // mặc định true
  minSelectionChars: number;                 // mặc định 15
}

interface Choice { label: string; text: string; }   // label: 'A' | 'B' | 'C' | 'D'

interface Question {
  id: string;
  sessionId: string;
  order: number;
  stem: string;
  passage?: string;          // đoạn văn dùng chung cho Part 6/7
  choices: Choice[];
  imageIds: string[];
  toeicPart?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

interface Attempt {
  id: string;
  questionId: string;
  userAnswer?: string;     // undefined = "Chưa làm"
  isCorrect: boolean;      // false khi userAnswer undefined
  createdAt: number;
  isRetry: boolean;        // false cho lần đầu, true cho "Làm lại câu này"
}

interface QuestionAnalysis {
  questionId: string;
  correctAnswer: string;                    // 'B'
  explanation: string;                      // ngắn gọn, 3–4 dòng
  strategy: string;                         // dấu hiệu nhận biết, 1–2 dòng
  distractorNotes?: Record<string, string>; // vì sao từng đáp án nhiễu sai
  topic: string;                            // "subject-verb agreement"
  topicCategory: 'grammar' | 'vocabulary' | 'reading' | 'other';
}

type ErrorTag =
  | 'no_grammar' | 'no_structure' | 'no_vocab' | 'misclick'   // 4 tag hiển thị trước
  | 'misread' | 'time_pressure' | 'trap_similar';             // 3 tag xếp sau

interface ErrorAnalysis {
  questionId: string;
  attemptId: string;       // gắn với lần trả lời sai cụ thể
  userTags: ErrorTag[];
  userNote?: string;
  aiDiagnosis: string;   // phân tích tâm lý vì sao chọn sai
  fixAdvice: string;
}

interface Session {
  id: string;
  createdAt: number;
  origin: 'selection' | 'paste';
  sourceUrl?: string;      // chỉ có với origin 'selection'
  sourceTitle?: string;    // chỉ có với origin 'selection'
  rawText: string;
  questionIds: string[];
}
```

`topic` và `topicCategory` do AI gán ở bước 2. Đây là thứ nuôi trang Thống kê — không có chúng thì dashboard chỉ đếm được đúng/sai.

---

## 5. Tầng AI

### 5.1 Interface chung

```ts
interface ChatRequest {
  system: string;
  userParts: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; mime: string; dataBase64: string }
  >;
  jsonSchema?: object;
  temperature?: number;
}

interface AIProvider {
  complete(req: ChatRequest, signal: AbortSignal): Promise<string>;
  stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<{ delta: string }>;
}
```

### 5.2 Hai adapter

**OpenAI** → `POST {baseUrl ?? 'https://api.openai.com/v1'}/chat/completions`, dùng `response_format: { type: 'json_schema' }`.
Vì `baseUrl` mở, cấu hình này chạy luôn với OpenRouter / Groq / LM Studio — tính năng miễn phí, không cần code thêm.

**Gemini** → `POST {baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta'}/models/{model}:generateContent`, dùng `generationConfig.responseMimeType = 'application/json'` + `responseSchema`.

### 5.3 Bước nào stream

| Bước | Kiểu output | Stream | Lý do |
|---|---|---|---|
| 1. Parse | JSON | Không | Cần cấu trúc đủ mới render form chọn đáp án. Hiện skeleton loader. |
| 2. Analyze (batch cả cụm) | JSON | Không | Cần `correctAnswer` / `topic` có cấu trúc để lưu thống kê. |
| 3. Phân tích lỗi sai | Văn xuôi | **Có** | Đây là chỗ người dùng ngồi đọc — chữ chạy ra là đáng giá. |
| 4. Tổng kết điểm yếu (dashboard) | Văn xuôi | **Có** | Như trên. |

Stream JSON từng phần phải parse partial — phức tạp, lợi ích nhỏ. Bỏ.

Bước 3 và 4 relay chunk từ service worker về UI qua `chrome.runtime.connect` port dài hạn.

### 5.4 Ràng buộc output

Mọi output JSON đi qua **zod**. Sai schema → retry đúng **1 lần** với prompt yêu cầu sửa lại theo schema. Fail lần hai → hiện lỗi kèm raw output và nút "Thử lại". **Không nuốt lỗi âm thầm.**

Giới hạn **20 câu / lần capture**. Vượt thì cảnh báo và cho người dùng cắt bớt trước khi gọi AI.

### 5.5 Prompt

Cả bốn prompt nhận `explanationLanguage` từ Settings và tuân theo nó.

- **`parse.ts`** — tách text (và ảnh nếu có) thành mảng `Question`. **Tuyệt đối không trả về đáp án đúng.** Nhận diện `toeicPart` khi suy được. Gộp đoạn văn dùng chung vào `passage` cho Part 6/7.
- **`analyze.ts`** — nhận mảng `Question` + `userAnswer` mỗi câu, trả mảng `QuestionAnalysis`. Yêu cầu rõ: `explanation` 3–4 dòng, `strategy` 1–2 dòng, giữ nguyên thuật ngữ ngữ pháp tiếng Anh và từ vựng gốc kể cả khi giải thích bằng tiếng Việt.
- **`errorPsych.ts`** — nhận một câu + đáp án sai người dùng chọn + `userTags` + `userNote`, trả văn xuôi phân tích tâm lý và cách sửa.
- **`weakness.ts`** — nhận **số liệu tổng hợp** (không gửi lại toàn bộ đề), trả 3–5 gạch đầu dòng nên ôn gì trước.

---

## 6. Bắt ảnh

Thang bốn nấc, dừng ở nấc nào thành công thì thôi.

1. Tính union `range.getClientRects()`, **nới lên trên 200px** — ảnh TOEIC Part 1 thường nằm phía trên phần chữ.
2. Quét `img, canvas, svg, [style*="background-image"]` giao vùng đó, diện tích ≥ 40×40 px. Với `<img>`: gửi `src` cho service worker fetch (nhờ `host_permissions`, né CORS) → `Blob`. Nếu `src` là `data:` thì dùng luôn.
3. Với `<canvas>`: thử `toDataURL()` trong content script; hỏng nếu canvas bị tainted → xuống nấc 4.
4. Fallback: `chrome.tabs.captureVisibleTab({ format: 'png' })` → `createImageBitmap` → crop theo rect nhân `devicePixelRatio` trong `OffscreenCanvas` (service worker không có DOM nhưng có sẵn hai API này).

**Escape hatch thủ công:** nút "📷 Chụp vùng" trong side panel bật overlay kéo chuột trong content script; người dùng khoanh vùng → gửi rect → service worker capture + crop. Đây là đường cứu ở PDF viewer và site vẽ canvas.

**Chuẩn hoá trước khi gửi AI:** tối đa 3 ảnh/session, cạnh dài ≤ 1024px, JPEG chất lượng 0.8.

Nếu `supportsVision === false` → bỏ ảnh và hiện banner "Model hiện tại không nhận ảnh", **không** gửi rồi mới lỗi.

---

## 7. Luồng người dùng

### 7.1 Luồng A — bôi đen (luồng chính)

```
① Bôi đen ≥ minSelectionChars ký tự
   └─ nút nổi "✨" hiện ngay dưới rect CUỐI của vùng chọn
      (Shadow DOM, host div position:fixed, z-index 2147483647)
      ẩn khi: selection rỗng · scroll · click ra ngoài · Esc

② Click → side panel mở → "Đang tách câu hỏi…" + preview text đã bắt
   song song: quét ảnh theo thang bốn nấc ở mục 6

③ [AI call 1 — parse] → view REVIEW
   Câu 101  The manager ___ the report before Friday.
            ( A ) ( B ) ( C ) ( D )   [Chưa làm]
   Câu 102  …
   → người dùng tích ĐÁP ÁN MÌNH ĐÃ CHỌN.
     Client chưa hề có đáp án đúng ở thời điểm này.
   → mỗi câu có [Bỏ qua câu này] để loại câu AI tách nhầm
   → nút [Phân tích] LUÔN bật. Câu không tích được gửi với
     userAnswer = undefined và ghi Attempt với isCorrect = false.

④ [AI call 2 — analyze batch] → view RESULT
   ┌ 101  ✓ B ──────────────────────────┐
   │ Giải thích (3–4 dòng)              │
   │ Mẹo nhận biết (1–2 dòng)           │
   └────────────────────────────────────┘
   ┌ 102  ✗ bạn chọn C · đúng A ────────┐
   │ Giải thích · Mẹo · Vì sao C sai    │
   │ [🧠 Phân tích lỗi sai]             │
   └────────────────────────────────────┘

⑤ Click [🧠] → chips chọn lý do (multi-select) + ô ghi chú
   Hàng trước: Không biết ngữ pháp · Không biết cấu trúc ·
               Không biết từ vựng · Bấm nhầm
   Hàng sau:   Đọc lướt hiểu sai · Hết giờ đoán bừa ·
               Bị bẫy đáp án gần giống
   → [Gửi] → [AI call 3 — stream] phân tích tâm lý + cách sửa
```

Ghi IndexedDB ở **từng mốc** (sau ③, sau ④, sau ⑤). Đóng panel giữa chừng không mất dữ liệu.

### 7.2 Luồng B — dán thủ công

Bấm icon extension → side panel → tab **"Dán đề"** → textarea + dán ảnh từ clipboard (`paste` event, đọc `clipboardData.files`) → **[Tách câu hỏi]** → vào thẳng bước ③.

Dùng lại đúng component `Review`, không nhân đôi code.

Đây cũng là đường thoát khi content script không chạy được: `chrome://`, Chrome Web Store, PDF viewer nội bộ.

### 7.3 Luồng C — dashboard

Mở tab riêng `app.html` từ nút trong side panel.

**Lịch sử** — danh sách theo **câu hỏi** (không phải theo session, vì người dùng ôn theo câu).
Filter: đúng/sai · TOEIC part · `topic` · `ErrorTag` · khoảng thời gian. Search full-text trên đề.
Click mở chi tiết kèm ảnh gốc.
Nút **"Làm lại câu này"** → ẩn đáp án, chọn lại, so với lần trước. Cách rẻ nhất để biết mình đã thật sự sửa được lỗi hay chưa. Ghi một `Attempt` mới với `isRetry = true`; **không** gọi lại AI (đã có sẵn `QuestionAnalysis`), nên thao tác này miễn phí token.

**Thống kê**
Mọi số liệu tính từ store `attempts`. Mặc định **chỉ tính lần làm đầu** (`isRetry = false`) để tránh làm đẹp số liệu bằng cách làm lại; có toggle "Tính cả lần làm lại".

- % đúng tổng, và theo tuần
- **Top chủ điểm sai nhiều nhất** (theo `topic`), bảng sắp theo số câu sai
- Phân bố lý do sai (theo `ErrorTag`) — cho biết hỏng *kiến thức* hay hỏng *kỹ năng làm bài*
- % đúng theo TOEIC part
- Nút **"AI tổng kết điểm yếu"** → prompt `weakness.ts`

**Cài đặt**
provider · baseUrl (trống = mặc định) · apiKey · model · `supportsVision` · **[Kiểm tra kết nối]** (gọi thử một request rẻ, báo OK hoặc lỗi cụ thể) · ngôn ngữ giải thích · bật/tắt ảnh · `minSelectionChars` · export/import JSON · xoá toàn bộ dữ liệu.

Kèm cảnh báo API key lưu không mã hoá.

**Export/import JSON:** file chứa `sessions`, `questions`, `analyses`, `attempts`, `errorAnalyses`. Có checkbox "Kèm ảnh" (**mặc định tắt** — bật sẽ nhúng base64 và file phình rất nhanh). **Không bao giờ** export `Settings` — tránh rò API key qua file chia sẻ. Import là **thêm vào**, không đè: trùng `id` thì bỏ qua bản ghi mới.

---

## 8. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Chưa cấu hình API key | Side panel hiện onboarding + nút mở Settings. Không gọi AI. |
| 401 / 429 / lỗi mạng | Thông báo tiếng Việt cụ thể theo mã lỗi + [Thử lại]. Dữ liệu đã parse **không mất**. |
| JSON sai schema | Retry 1 lần; vẫn sai thì hiện raw output + [Thử lại]. |
| `sidePanel.open()` ném lỗi | Toast trong trang "Bấm icon IMEN để mở panel" + badge chấm đỏ trên icon. |
| Đổi selection / đóng panel | `AbortController` huỷ request đang chạy. |
| Model không hỗ trợ vision | Bỏ ảnh, hiện banner giải thích. |
| Parse ra 0 câu | Hiện raw text + gợi ý chuyển sang tab "Dán đề" để sửa tay. |
| Content script không inject được | Chỉ dùng được luồng B. Side panel nêu rõ lý do. |

---

## 9. Rủi ro kỹ thuật cần xác minh sớm

**`chrome.sidePanel.open()` đòi user gesture.** Gọi nó từ service worker khi nhận message do content script phát ra sau một cú click — theo tài liệu là hợp lệ, nhưng hành vi thực tế có thay đổi giữa các bản Chrome.

→ Đưa thành **spike ở task đầu tiên** của implementation plan. Fallback đã thiết kế sẵn (xem bảng mục 8) nên rủi ro này không chặn tiến độ, nhưng cần biết kết quả trước khi xây UI.

---

## 10. Test

**Tự động (Vitest)**
- `shared/storage/*` với `fake-indexeddb` — CRUD, migration version schema, aggregation của Stats
- `ai/schema.ts` — zod validate và đường retry/repair
- `ai/openai.ts`, `ai/gemini.ts` với `msw` — dựng request đúng, parse SSE, map lỗi 401/429
- `content/imageScan.ts`, `content/selection.ts` với jsdom — logic giao rect là hàm thuần
- React Testing Library cho luồng `Review → Result` với port background giả

**Thủ công (checklist, vì cần browser thật)**
- Side panel mở được từ click nút nổi
- Snip kéo vùng cho ra ảnh đúng vị trí
- `captureVisibleTab` + crop đúng tỉ lệ `devicePixelRatio` trên màn hình HiDPI
- Nút nổi hiển thị đúng trên 3 site luyện đề TOEIC thật

---

## 11. Thứ tự triển khai gợi ý

Spec này đủ cho một implementation plan, nhưng khối lượng lớn. Chia bốn chặng, mỗi chặng chạy được và review được độc lập:

| Chặng | Nội dung | Nghiệm thu |
|---|---|---|
| 0 | Scaffold Vite + CRXJS + TS + Tailwind, `manifest.config.ts`, `shared/types.ts`, `shared/messages.ts`. **Spike `sidePanel.open()` từ content-script click** (mục 9). | Extension load được, click icon mở side panel rỗng; biết chắc spike đậu hay rớt |
| 1 | `shared/storage/*` + `ai/*` (2 adapter, zod, 3 prompt) + `background/aiRunner.ts`. Chưa có UI thật. | Toàn bộ test Vitest ở mục 10 xanh |
| 2 | Luồng B trước (dán thủ công → Review → Result → Error). Settings page. | Dán một cụm câu TOEIC vào là chạy hết luồng, có lưu lịch sử |
| 3 | Luồng A (content script: selection, nút nổi, `imageScan`, `snip`) + `background/capture.ts` | Bôi đen trên site luyện đề thật là chạy |
| 4 | Dashboard Lịch sử + Thống kê + `weakness.ts` + export/import | Sau ~50 câu chỉ ra được 3 chủ điểm yếu nhất |

Làm luồng B (chặng 2) **trước** luồng A là có chủ đích: nó không phụ thuộc content script hay quyền chụp màn hình, nên toàn bộ pipeline AI và UI được kiểm chứng trước khi đụng phần dễ vỡ nhất.

---

## 12. Ngoài phạm vi v1

SRS / Anki · đồng bộ cloud, multi-device · Part 1–4 audio · tự động dò đáp án người dùng đã tích trên trang · tài khoản đăng nhập · hỗ trợ Firefox.
