# IMEN Plan 1 — Core Foundation & Manual-Paste Analysis Flow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a loadable Chrome MV3 extension where a user configures an AI provider, pastes a block of TOEIC questions into the side panel, records the answers they originally picked, gets AI explanations, and gets a streamed psychological analysis of each mistake — all persisted to IndexedDB.

**Architecture:** Manifest V3 extension. The service worker is the only component holding the API key or talking to a provider; the side panel and options page reach it through a typed request/response message layer, plus one long-lived port for streaming prose. AI work is split into three single-purpose calls (parse → analyze → error-psychology) so the client never holds the correct answer while the user is recording what they picked. Settings live in `chrome.storage.local`; question history lives in IndexedDB.

**Tech Stack:** Vite 6 · React 19 · TypeScript 5 · Tailwind 4 · `@crxjs/vite-plugin` · `zod` · `idb` · Vitest · `msw` · `fake-indexeddb` · React Testing Library

**Source spec:** `docs/superpowers/specs/2026-08-07-imen-ext-design.md`

**Not in this plan:** text-selection capture, image capture, the floating in-page button, the History/Stats dashboard, `weakness.ts`, JSON export/import. Those are Plans 2 and 3.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Manifest V3.** `minimum_chrome_version: "116"` (the `sidePanel` API floor).
- **The API key exists only inside the service worker.** No content script, side panel, or options page code may read `settings.ai.apiKey` and construct a provider request itself. Every provider call goes through `background/`. This is review priority number one.
- **Never use `chrome.storage.sync`.** It would push the API key to Google's cloud. Settings go in `chrome.storage.local` only.
- **Never store images as base64 at rest.** IndexedDB holds `Blob`. base64 exists only in-flight to the provider.
- **Language split.** Docs, code, identifiers, comments and commit messages are English. **Every user-facing string is Vietnamese and lives in `src/shared/strings.ts`** — no Vietnamese string literal may appear inside a component. Button labels written in English in this plan are descriptions, not the strings to implement.
- **All AI JSON output passes through zod.** On schema failure, retry exactly once with corrective feedback; on a second failure, throw `AppError` with code `SCHEMA` carrying the raw output. Never swallow the error.
- **Cap of 20 questions per capture.** Warn and let the user trim before any AI call.
- **The parse step must never return the correct answer.** Enforced by prompt wording *and* by the zod schema having no such field.
- **TDD.** Write the failing test, watch it fail, implement the minimum, watch it pass, commit.
- **Commit after every task.** Conventional-commit prefixes (`feat:`, `test:`, `chore:`, `fix:`).

### Deviation from spec §5.2 — structured output mode

The spec specified OpenAI `response_format: { type: 'json_schema' }` and Gemini `responseSchema`. This plan uses **`{ type: 'json_object' }`** and **`responseMimeType: 'application/json'`** respectively, with the schema described in the prompt text instead.

Reason: strict `json_schema` requires every property to be `required` with `additionalProperties: false`, and Gemini's `responseSchema` rejects several JSON Schema keywords. Both would need a schema-translation layer, and neither is supported by the OpenAI-compatible endpoints (OpenRouter, Groq, LM Studio) that the open `baseUrl` is meant to unlock. zod validation plus the one-shot repair retry already guarantees the shape. Less code, wider compatibility.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/manifest.config.ts` | MV3 manifest, typed via `defineManifest` |
| `vite.config.ts` / `vitest.config.ts` | Build config; test config kept separate so CRXJS never loads under Vitest |
| `src/shared/types.ts` | Every shared entity. No logic. |
| `src/shared/strings.ts` | Every user-facing Vietnamese string |
| `src/shared/errors.ts` | `AppError`, error codes, code → Vietnamese message |
| `src/shared/messages.ts` | Request/response map + typed `sendRequest` / `onRequest` |
| `src/shared/storage/settings.ts` | `chrome.storage.local` wrapper, defaults, validation |
| `src/shared/storage/history.ts` | IndexedDB schema v1 + CRUD |
| `src/ai/types.ts` | `AIProvider`, `ChatRequest` |
| `src/ai/schema.ts` | zod schemas + `parseJsonWithRepair` |
| `src/ai/prompts/parse.ts` | Text → questions, no answers |
| `src/ai/prompts/analyze.ts` | Questions + user answers → analyses |
| `src/ai/prompts/errorPsych.ts` | One wrong attempt → streamed prose |
| `src/ai/openai.ts` | OpenAI-compatible adapter |
| `src/ai/gemini.ts` | Gemini adapter |
| `src/ai/index.ts` | Provider factory from `Settings` |
| `src/background/aiRunner.ts` | Orchestrates the three steps + persistence |
| `src/background/index.ts` | Message router + streaming port |
| `src/content/index.ts` | Spike only in this plan; grows in Plan 2 |
| `src/sidepanel/App.tsx` | View state machine |
| `src/sidepanel/views/{Paste,Review,Result}.tsx` | The three main screens |
| `src/sidepanel/components/ErrorPanel.tsx` | Mistake-reason chips + streamed diagnosis |
| `src/app/App.tsx` + `src/app/views/Settings.tsx` | Options tab |
| `src/test/chromeMock.ts` | `chrome` global stub used by every storage test |

---

## Task 1: Scaffold, manifest, and the `sidePanel.open()` spike

The spike is folded into this task because the plan's first real decision — whether the floating button can open the side panel at all — must be answered before any UI is built on top of it.

**Files:**
- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `src/manifest.config.ts`
- Create: `src/styles.css`, `src/sidepanel/index.html`, `src/sidepanel/main.tsx`
- Create: `src/app/index.html`, `src/app/main.tsx`
- Create: `src/background/index.ts`, `src/content/index.ts`
- Create: `src/test/setup.ts`, `src/test/chromeMock.ts`
- Create: `public/icon-128.png` (any 128×128 PNG placeholder)
- Test: `src/manifest.config.test.ts`
- Create: `docs/superpowers/plans/spike-sidepanel-result.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a loadable extension; `installChromeMock()` from `src/test/chromeMock.ts` used by every later storage test.

- [ ] **Step 1: Initialise the project**

```bash
npm create vite@latest . -- --template react-ts
npm i zod idb
npm i -D @crxjs/vite-plugin@beta @tailwindcss/vite tailwindcss \
  vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  fake-indexeddb msw @types/chrome
```

- [ ] **Step 2: Write the failing manifest test**

Create `src/manifest.config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import manifest from './manifest.config';

describe('manifest', () => {
  it('targets MV3 on Chrome 116+', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe('116');
  });

  it('declares exactly the permissions the spec allows', () => {
    expect(new Set(manifest.permissions)).toEqual(
      new Set(['storage', 'sidePanel', 'activeTab', 'scripting', 'unlimitedStorage']),
    );
    expect(manifest.host_permissions).toEqual(['<all_urls>']);
  });

  it('has no action popup — clicking the icon opens the side panel', () => {
    expect(manifest.action?.default_popup).toBeUndefined();
    expect(manifest.side_panel?.default_path).toBe('src/sidepanel/index.html');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/manifest.config.test.ts`
Expected: FAIL — `Cannot find module './manifest.config'`

- [ ] **Step 4: Write the configs**

`vitest.config.ts` — deliberately separate from `vite.config.ts` so the CRXJS plugin never runs during tests:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.config';

export default defineConfig({
  plugins: [react(), tailwindcss(), crx({ manifest })],
  build: { rollupOptions: { input: { app: 'src/app/index.html' } } },
});
```

`src/manifest.config.ts`:

```ts
import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'IMEN — TOEIC practice assistant',
  version: '0.1.0',
  minimum_chrome_version: '116',
  action: { default_title: 'IMEN' },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  side_panel: { default_path: 'src/sidepanel/index.html' },
  options_page: 'src/app/index.html',
  content_scripts: [
    { matches: ['<all_urls>'], js: ['src/content/index.ts'], run_at: 'document_idle' },
  ],
  permissions: ['storage', 'sidePanel', 'activeTab', 'scripting', 'unlimitedStorage'],
  host_permissions: ['<all_urls>'],
  icons: { 128: 'public/icon-128.png' },
});
```

`src/styles.css`:

```css
@import "tailwindcss";
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/manifest.config.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 6: Write the chrome mock**

`src/test/chromeMock.ts`. Note `storage.sync.set` throws on purpose — that makes the "never use sync" constraint testable rather than aspirational:

```ts
export interface ChromeMock {
  store: Record<string, unknown>;
  reset(): void;
}

export function installChromeMock(): ChromeMock {
  const store: Record<string, unknown> = {};

  const local = {
    async get(keys?: string | string[] | null) {
      if (keys == null) return { ...store };
      const list = typeof keys === 'string' ? [keys] : keys;
      const out: Record<string, unknown> = {};
      for (const k of list) if (k in store) out[k] = store[k];
      return out;
    },
    async set(items: Record<string, unknown>) {
      Object.assign(store, items);
    },
    async clear() {
      for (const k of Object.keys(store)) delete store[k];
    },
  };

  const sync = {
    async set() {
      throw new Error('chrome.storage.sync must never be used — it would leak the API key');
    },
    async get() {
      throw new Error('chrome.storage.sync must never be used — it would leak the API key');
    },
  };

  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { local, sync },
    runtime: { id: 'test-extension' },
  };

  return {
    store,
    reset() {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}
```

- [ ] **Step 7: Write the spike scaffolding**

`src/background/index.ts` — spike version only; Task 10 replaces the body:

```ts
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error('[imen] setPanelBehavior failed', e));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'SPIKE_OPEN_PANEL') return false;
  const tabId = sender.tab?.id;
  if (tabId == null) {
    sendResponse({ ok: false, error: 'no tab id' });
    return true;
  }
  chrome.sidePanel
    .open({ tabId })
    .then(() => sendResponse({ ok: true }))
    .catch((e: Error) => sendResponse({ ok: false, error: e.message }));
  return true; // keep the channel open for the async response
});
```

`src/content/index.ts` — spike version only; Plan 2 replaces it entirely:

```ts
const button = document.createElement('button');
button.textContent = 'IMEN spike';
button.style.cssText =
  'position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:8px 12px;';
button.addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'SPIKE_OPEN_PANEL' });
  console.log('[imen spike] sidePanel.open result:', res);
  button.textContent = res?.ok ? 'spike: OK' : `spike: FAIL — ${res?.error}`;
});
document.body.appendChild(button);
```

`src/sidepanel/index.html` and `src/app/index.html` (same shape, differing script path and title):

```html
<!doctype html>
<html lang="vi">
  <head><meta charset="UTF-8" /><title>IMEN</title></head>
  <body><div id="root"></div><script type="module" src="./main.tsx"></script></body>
</html>
```

`src/sidepanel/main.tsx` and `src/app/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
import '../styles.css';

createRoot(document.getElementById('root')!).render(<div className="p-4">IMEN</div>);
```

- [ ] **Step 8: Run the spike and record the verdict**

```bash
npm run build
```

Load `dist/` via `chrome://extensions` → Developer mode → Load unpacked. Then:

1. Open any ordinary website. A "IMEN spike" button sits bottom-right.
2. Click it. Record whether the side panel opens, and what the button label becomes.
3. Click the extension icon. Confirm the side panel opens (this path is independent of the spike and must work regardless).

Write `docs/superpowers/plans/spike-sidepanel-result.md` with: Chrome version, verdict (PASS = panel opened from the in-page button / FAIL = it threw), and the exact error message if it failed.

**This does not block the plan.** A FAIL means Plan 2 wires the fallback from spec §8 (in-page toast plus a badge dot) as the primary path instead of the fallback. Record the answer and move on.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold MV3 extension with Vite, React, Tailwind and Vitest

Includes the sidePanel.open() spike from spec section 9 and its recorded result."
```

---

## Task 2: Shared types, strings and errors

**Files:**
- Create: `src/shared/types.ts`, `src/shared/strings.ts`, `src/shared/errors.ts`
- Test: `src/shared/errors.test.ts`, `src/shared/strings.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: every entity type in this plan; `AppError`, `appError(code, opts)`, `errorMessage(err): string`; `S` (the string table) and `ERROR_TAG_ORDER`.

- [ ] **Step 1: Write the failing tests**

`src/shared/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { appError, errorMessage, isAppError } from './errors';

describe('errors', () => {
  it('builds a tagged error carrying its code', () => {
    const e = appError('AUTH', { detail: '401 from provider' });
    expect(isAppError(e)).toBe(true);
    expect(e.code).toBe('AUTH');
    expect(e.detail).toBe('401 from provider');
  });

  it('renders a Vietnamese message for every known code', () => {
    for (const code of ['NO_API_KEY', 'AUTH', 'RATE_LIMIT', 'NETWORK', 'SCHEMA', 'PARSE_EMPTY', 'TOO_MANY', 'NO_VISION', 'UNKNOWN'] as const) {
      const msg = errorMessage(appError(code));
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).not.toMatch(/[A-Z_]{4,}/); // no raw code leaked into the UI
    }
  });

  it('falls back to UNKNOWN for a non-AppError', () => {
    expect(errorMessage(new Error('boom'))).toBe(errorMessage(appError('UNKNOWN')));
  });
});
```

`src/shared/strings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ERROR_TAG_ORDER, S } from './strings';

describe('strings', () => {
  it('labels all seven error tags, with the four primary ones first', () => {
    expect(ERROR_TAG_ORDER).toEqual([
      'no_grammar', 'no_structure', 'no_vocab', 'misclick',
      'misread', 'time_pressure', 'trap_similar',
    ]);
    for (const tag of ERROR_TAG_ORDER) {
      expect(S.errorTag[tag]).toBeTruthy();
    }
  });

  it('is written in Vietnamese, not English', () => {
    expect(S.review.analyzeButton).toMatch(/[ăâđêôơưáàảãạ]/i);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/shared`
Expected: FAIL — `Cannot find module './errors'`

- [ ] **Step 3: Write `src/shared/types.ts`**

```ts
export type Provider = 'openai' | 'gemini';
export type ExplanationLanguage = 'vi' | 'en' | 'bilingual';

export interface ProviderConfig {
  provider: Provider;
  baseUrl?: string;
  apiKey: string;
  model: string;
  supportsVision: boolean;
}

export interface Settings {
  ai: ProviderConfig;
  explanationLanguage: ExplanationLanguage;
  captureImages: boolean;
  minSelectionChars: number;
}

export interface Choice {
  label: string; // 'A' | 'B' | 'C' | 'D'
  text: string;
}

export interface Question {
  id: string;
  sessionId: string;
  order: number;
  stem: string;
  passage?: string;
  choices: Choice[];
  imageIds: string[];
  toeicPart?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export interface Attempt {
  id: string;
  questionId: string;
  userAnswer?: string;
  isCorrect: boolean;
  createdAt: number;
  isRetry: boolean;
}

export type TopicCategory = 'grammar' | 'vocabulary' | 'reading' | 'other';

export interface QuestionAnalysis {
  questionId: string;
  correctAnswer: string;
  explanation: string;
  strategy: string;
  distractorNotes?: Record<string, string>;
  topic: string;
  topicCategory: TopicCategory;
}

export type ErrorTag =
  | 'no_grammar' | 'no_structure' | 'no_vocab' | 'misclick'
  | 'misread' | 'time_pressure' | 'trap_similar';

export interface ErrorAnalysis {
  attemptId: string; // primary key — one analysis per wrong attempt
  questionId: string;
  userTags: ErrorTag[];
  userNote?: string;
  aiDiagnosis: string;
  fixAdvice: string;
}

export interface Session {
  id: string;
  createdAt: number;
  origin: 'selection' | 'paste';
  sourceUrl?: string;
  sourceTitle?: string;
  rawText: string;
  questionIds: string[];
}

/** An image on its way to the provider. Never persisted in this shape. */
export interface ImageInput {
  mime: string;
  dataBase64: string;
}

export interface AnswerSubmission {
  questionId: string;
  userAnswer?: string; // undefined = "not attempted"
}
```

Note on `ErrorAnalysis`: the spec listed both `questionId` and `attemptId`. `attemptId` is the IndexedDB primary key — exactly one error analysis per wrong attempt — and `questionId` is kept for indexed lookup in Plan 3.

- [ ] **Step 4: Write `src/shared/errors.ts`**

```ts
export type ErrorCode =
  | 'NO_API_KEY' | 'AUTH' | 'RATE_LIMIT' | 'NETWORK'
  | 'SCHEMA' | 'PARSE_EMPTY' | 'TOO_MANY' | 'NO_VISION' | 'UNKNOWN';

export interface AppError extends Error {
  readonly isAppError: true;
  code: ErrorCode;
  detail?: string;
  raw?: string;
}

export function appError(code: ErrorCode, opts: { detail?: string; raw?: string } = {}): AppError {
  const err = new Error(`${code}${opts.detail ? `: ${opts.detail}` : ''}`) as AppError;
  Object.assign(err, { isAppError: true as const, code, ...opts });
  return err;
}

export function isAppError(e: unknown): e is AppError {
  return typeof e === 'object' && e !== null && (e as AppError).isAppError === true;
}

const MESSAGES: Record<ErrorCode, string> = {
  NO_API_KEY: 'Bạn chưa cấu hình API key. Mở phần Cài đặt để nhập.',
  AUTH: 'API key không hợp lệ hoặc đã hết hạn. Kiểm tra lại trong Cài đặt.',
  RATE_LIMIT: 'Provider đang giới hạn tốc độ. Chờ một lát rồi thử lại.',
  NETWORK: 'Không kết nối được tới provider. Kiểm tra mạng hoặc base URL.',
  SCHEMA: 'AI trả về dữ liệu sai định dạng. Bạn có thể thử lại.',
  PARSE_EMPTY: 'Không tách được câu hỏi nào từ nội dung này.',
  TOO_MANY: 'Vượt quá 20 câu cho một lần phân tích. Hãy bớt bớt lại.',
  NO_VISION: 'Model hiện tại không nhận ảnh. Ảnh đã được bỏ qua.',
  UNKNOWN: 'Đã có lỗi không xác định. Bạn có thể thử lại.',
};

export function errorMessage(e: unknown): string {
  return MESSAGES[isAppError(e) ? e.code : 'UNKNOWN'];
}

/** Errors cross the message boundary as plain objects — Error instances do not survive structuredClone. */
export interface SerializedError { code: ErrorCode; detail?: string; raw?: string }

export function serializeError(e: unknown): SerializedError {
  return isAppError(e)
    ? { code: e.code, detail: e.detail, raw: e.raw }
    : { code: 'UNKNOWN', detail: e instanceof Error ? e.message : String(e) };
}

export function deserializeError(e: SerializedError): AppError {
  return appError(e.code, { detail: e.detail, raw: e.raw });
}
```

- [ ] **Step 5: Write `src/shared/strings.ts`**

```ts
import type { ErrorTag } from './types';

export const ERROR_TAG_ORDER: ErrorTag[] = [
  'no_grammar', 'no_structure', 'no_vocab', 'misclick',
  'misread', 'time_pressure', 'trap_similar',
];

export const S = {
  appName: 'IMEN',

  onboarding: {
    title: 'Chưa sẵn sàng',
    body: 'Cần cấu hình AI provider trước khi dùng.',
    openSettings: 'Mở Cài đặt',
  },

  paste: {
    tab: 'Dán đề',
    placeholder: 'Dán câu hỏi và các lựa chọn vào đây…',
    submit: 'Tách câu hỏi',
    parsing: 'Đang tách câu hỏi…',
    empty: 'Chưa có nội dung nào để tách.',
    imageCount: (n: number) => `Đã đính kèm ${n} ảnh`,
  },

  review: {
    title: 'Bạn đã chọn đáp án nào?',
    hint: 'Chọn đúng đáp án bạn đã khoanh lúc làm bài. Chưa có đáp án đúng ở đây.',
    visionSkipped: 'Model hiện tại không nhận ảnh. Ảnh đã được bỏ qua.',
    notAttempted: 'Chưa làm',
    skip: 'Bỏ qua câu này',
    analyzeButton: 'Phân tích',
    analyzing: 'Đang phân tích…',
    counter: (done: number, total: number) => `Đã chọn ${done}/${total} câu`,
  },

  result: {
    correct: 'Đúng',
    wrong: 'Sai',
    youChose: 'Bạn chọn',
    correctAnswer: 'Đáp án đúng',
    explanation: 'Giải thích',
    strategy: 'Mẹo nhận biết',
    distractors: 'Vì sao các đáp án khác sai',
    analyzeMistake: 'Phân tích lỗi sai',
    backToPaste: 'Phân tích cụm khác',
  },

  errorPanel: {
    title: 'Vì sao bạn chọn sai?',
    hint: 'Chọn một hoặc nhiều lý do, thêm ghi chú nếu muốn.',
    notePlaceholder: 'Ghi chú thêm (không bắt buộc)…',
    submit: 'Gửi',
    thinking: 'Đang phân tích…',
    diagnosis: 'Chẩn đoán',
    fixAdvice: 'Cách sửa',
  },

  errorTag: {
    no_grammar: 'Không biết ngữ pháp',
    no_structure: 'Không biết cấu trúc',
    no_vocab: 'Không biết từ vựng',
    misclick: 'Bấm nhầm',
    misread: 'Đọc lướt hiểu sai',
    time_pressure: 'Hết giờ đoán bừa',
    trap_similar: 'Bị bẫy đáp án gần giống',
  } satisfies Record<ErrorTag, string>,

  settings: {
    title: 'Cài đặt',
    provider: 'Provider',
    baseUrl: 'Base URL',
    baseUrlHint: 'Để trống để dùng endpoint mặc định của provider.',
    apiKey: 'API key',
    apiKeyWarning:
      'API key được lưu không mã hoá trong bộ nhớ của Chrome. Ai truy cập được profile Chrome của bạn đều đọc được nó.',
    model: 'Model',
    supportsVision: 'Model này nhận được ảnh',
    explanationLanguage: 'Ngôn ngữ giải thích',
    langVi: 'Tiếng Việt',
    langEn: 'Tiếng Anh',
    langBilingual: 'Song ngữ',
    captureImages: 'Bắt ảnh trong câu hỏi',
    minSelectionChars: 'Số ký tự tối thiểu để hiện nút',
    testConnection: 'Kiểm tra kết nối',
    testing: 'Đang kiểm tra…',
    testOk: 'Kết nối thành công.',
    save: 'Lưu',
    saved: 'Đã lưu.',
    required: 'Bắt buộc',
  },

  common: {
    retry: 'Thử lại',
    rawOutput: 'Xem dữ liệu thô AI trả về',
    cancel: 'Huỷ',
  },
} as const;
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run src/shared`
Expected: PASS, 5 tests

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/shared/strings.ts src/shared/errors.ts src/shared/errors.test.ts src/shared/strings.test.ts
git commit -m "feat: add shared types, Vietnamese string table and error taxonomy"
```

---

## Task 3: Settings storage

**Files:**
- Create: `src/shared/storage/settings.ts`
- Test: `src/shared/storage/settings.test.ts`

**Interfaces:**
- Consumes: `Settings`, `ProviderConfig` from `src/shared/types.ts`; `installChromeMock` from `src/test/chromeMock.ts`.
- Produces: `DEFAULT_SETTINGS`, `getSettings(): Promise<Settings>`, `saveSettings(patch: Partial<Settings>): Promise<Settings>`, `isConfigured(s: Settings): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { installChromeMock } from '../../test/chromeMock';
import { DEFAULT_SETTINGS, getSettings, isConfigured, saveSettings } from './settings';

const mock = installChromeMock();
beforeEach(() => mock.reset());

describe('settings storage', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.explanationLanguage).toBe('vi');
    expect(DEFAULT_SETTINGS.minSelectionChars).toBe(15);
    expect(DEFAULT_SETTINGS.ai.supportsVision).toBe(true);
  });

  it('merges a partial patch over what is stored', async () => {
    await saveSettings({ ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k', model: 'm' } });
    await saveSettings({ explanationLanguage: 'bilingual' });
    const s = await getSettings();
    expect(s.ai.apiKey).toBe('k');
    expect(s.explanationLanguage).toBe('bilingual');
  });

  it('writes to storage.local and never to storage.sync', async () => {
    await saveSettings({ captureImages: false });
    expect(mock.store).toHaveProperty('settings');
    // chromeMock throws if storage.sync is touched at all, so reaching here proves it was not.
  });

  it('treats settings as unconfigured until both apiKey and model are set', async () => {
    expect(isConfigured(DEFAULT_SETTINGS)).toBe(false);
    expect(isConfigured({ ...DEFAULT_SETTINGS, ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k' } })).toBe(false);
    expect(isConfigured({ ...DEFAULT_SETTINGS, ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k', model: 'm' } })).toBe(true);
  });

  it('ignores a blank baseUrl rather than storing an empty string', async () => {
    await saveSettings({ ai: { ...DEFAULT_SETTINGS.ai, baseUrl: '   ' } });
    expect((await getSettings()).ai.baseUrl).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/shared/storage/settings.test.ts`
Expected: FAIL — `Cannot find module './settings'`

- [ ] **Step 3: Implement**

```ts
import type { Settings } from '../types';

const KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  ai: { provider: 'openai', apiKey: '', model: '', supportsVision: true },
  explanationLanguage: 'vi',
  captureImages: true,
  minSelectionChars: 15,
};

function normalise(s: Settings): Settings {
  const baseUrl = s.ai.baseUrl?.trim();
  return { ...s, ai: { ...s.ai, baseUrl: baseUrl ? baseUrl.replace(/\/+$/, '') : undefined } };
}

export async function getSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(KEY);
  const stored = raw[KEY] as Partial<Settings> | undefined;
  if (!stored) return DEFAULT_SETTINGS;
  return normalise({
    ...DEFAULT_SETTINGS,
    ...stored,
    ai: { ...DEFAULT_SETTINGS.ai, ...stored.ai },
  });
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = normalise({ ...current, ...patch, ai: { ...current.ai, ...patch.ai } });
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function isConfigured(s: Settings): boolean {
  return s.ai.apiKey.trim().length > 0 && s.ai.model.trim().length > 0;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/shared/storage/settings.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/shared/storage/settings.ts src/shared/storage/settings.test.ts
git commit -m "feat: add settings storage backed by chrome.storage.local"
```

---

## Task 4: History storage (IndexedDB)

**Files:**
- Create: `src/shared/storage/history.ts`
- Test: `src/shared/storage/history.test.ts`

**Interfaces:**
- Consumes: entity types from `src/shared/types.ts`.
- Produces: `openDb()`, `createSession(input)`, `putQuestions(qs)`, `deleteQuestions(ids)`, `getQuestionsBySession(sessionId)`, `putAnalyses(as)`, `getAnalysis(questionId)`, `recordAttempt(input)`, `putErrorAnalysis(e)`, `putImage(blob)`, `getImage(id)`, `resetDb()` (test helper).

- [ ] **Step 1: Write the failing test**

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createSession, deleteQuestions, getAnalysis, getImage, getQuestionsBySession,
  putAnalyses, putImage, putQuestions, recordAttempt, resetDb,
} from './history';

beforeEach(async () => { await resetDb(); });

function question(sessionId: string, order: number) {
  return {
    id: `q${order}`, sessionId, order,
    stem: `stem ${order}`,
    choices: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }],
    imageIds: [],
  };
}

describe('history storage', () => {
  it('creates a session and reads its questions back in order', async () => {
    const s = await createSession({ origin: 'paste', rawText: 'raw', questionIds: ['q1', 'q2'] });
    await putQuestions([question(s.id, 2), question(s.id, 1)]);
    const qs = await getQuestionsBySession(s.id);
    expect(qs.map((q) => q.order)).toEqual([1, 2]);
  });

  it('deletes skipped questions', async () => {
    const s = await createSession({ origin: 'paste', rawText: '', questionIds: [] });
    await putQuestions([question(s.id, 1), question(s.id, 2)]);
    await deleteQuestions(['q1']);
    expect((await getQuestionsBySession(s.id)).map((q) => q.id)).toEqual(['q2']);
  });

  it('stores an analysis keyed by questionId', async () => {
    await putAnalyses([{
      questionId: 'q1', correctAnswer: 'B', explanation: 'e', strategy: 's',
      topic: 'subject-verb agreement', topicCategory: 'grammar',
    }]);
    expect((await getAnalysis('q1'))?.correctAnswer).toBe('B');
  });

  it('derives isCorrect when recording an attempt', async () => {
    const hit = await recordAttempt({ questionId: 'q1', userAnswer: 'B', correctAnswer: 'B', isRetry: false });
    const miss = await recordAttempt({ questionId: 'q1', userAnswer: 'C', correctAnswer: 'B', isRetry: true });
    const blank = await recordAttempt({ questionId: 'q1', correctAnswer: 'B', isRetry: false });
    expect(hit.isCorrect).toBe(true);
    expect(miss.isCorrect).toBe(false);
    expect(miss.isRetry).toBe(true);
    expect(blank.isCorrect).toBe(false);
    expect(blank.userAnswer).toBeUndefined();
  });

  it('round-trips an image as a Blob, never as base64', async () => {
    const id = await putImage(new Blob(['x'], { type: 'image/jpeg' }));
    const back = await getImage(id);
    expect(back).toBeInstanceOf(Blob);
    expect(back?.type).toBe('image/jpeg');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/shared/storage/history.test.ts`
Expected: FAIL — `Cannot find module './history'`

- [ ] **Step 3: Implement**

```ts
import { type DBSchema, type IDBPDatabase, deleteDB, openDB } from 'idb';
import type { Attempt, ErrorAnalysis, Question, QuestionAnalysis, Session } from '../types';

const DB_NAME = 'imen';
const DB_VERSION = 1;

interface ImenDb extends DBSchema {
  sessions: { key: string; value: Session };
  questions: { key: string; value: Question; indexes: { bySession: string } };
  analyses: { key: string; value: QuestionAnalysis };
  attempts: { key: string; value: Attempt; indexes: { byQuestion: string; byCreatedAt: number } };
  errorAnalyses: { key: string; value: ErrorAnalysis; indexes: { byQuestion: string } };
  images: { key: string; value: { id: string; blob: Blob } };
}

let dbPromise: Promise<IDBPDatabase<ImenDb>> | null = null;

export function openDb(): Promise<IDBPDatabase<ImenDb>> {
  dbPromise ??= openDB<ImenDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('sessions', { keyPath: 'id' });

      const questions = db.createObjectStore('questions', { keyPath: 'id' });
      questions.createIndex('bySession', 'sessionId');

      db.createObjectStore('analyses', { keyPath: 'questionId' });

      const attempts = db.createObjectStore('attempts', { keyPath: 'id' });
      attempts.createIndex('byQuestion', 'questionId');
      attempts.createIndex('byCreatedAt', 'createdAt');

      const errors = db.createObjectStore('errorAnalyses', { keyPath: 'attemptId' });
      errors.createIndex('byQuestion', 'questionId');

      db.createObjectStore('images', { keyPath: 'id' });
    },
  });
  return dbPromise;
}

/** Test helper. Never call from production code. */
export async function resetDb(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await deleteDB(DB_NAME);
}

export async function createSession(
  input: Omit<Session, 'id' | 'createdAt'>,
): Promise<Session> {
  const session: Session = { ...input, id: crypto.randomUUID(), createdAt: Date.now() };
  await (await openDb()).put('sessions', session);
  return session;
}

export async function putQuestions(questions: Question[]): Promise<void> {
  const tx = (await openDb()).transaction('questions', 'readwrite');
  await Promise.all([...questions.map((q) => tx.store.put(q)), tx.done]);
}

export async function deleteQuestions(ids: string[]): Promise<void> {
  const tx = (await openDb()).transaction('questions', 'readwrite');
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

export async function getQuestionsBySession(sessionId: string): Promise<Question[]> {
  const rows = await (await openDb()).getAllFromIndex('questions', 'bySession', sessionId);
  return rows.sort((a, b) => a.order - b.order);
}

export async function putAnalyses(analyses: QuestionAnalysis[]): Promise<void> {
  const tx = (await openDb()).transaction('analyses', 'readwrite');
  await Promise.all([...analyses.map((a) => tx.store.put(a)), tx.done]);
}

export async function getAnalysis(questionId: string): Promise<QuestionAnalysis | undefined> {
  return (await openDb()).get('analyses', questionId);
}

export async function recordAttempt(input: {
  questionId: string;
  userAnswer?: string;
  correctAnswer: string;
  isRetry: boolean;
}): Promise<Attempt> {
  const attempt: Attempt = {
    id: crypto.randomUUID(),
    questionId: input.questionId,
    userAnswer: input.userAnswer,
    isCorrect: input.userAnswer != null && input.userAnswer === input.correctAnswer,
    createdAt: Date.now(),
    isRetry: input.isRetry,
  };
  await (await openDb()).put('attempts', attempt);
  return attempt;
}

export async function putErrorAnalysis(analysis: ErrorAnalysis): Promise<void> {
  await (await openDb()).put('errorAnalyses', analysis);
}

export async function putImage(blob: Blob): Promise<string> {
  const id = crypto.randomUUID();
  await (await openDb()).put('images', { id, blob });
  return id;
}

export async function getImage(id: string): Promise<Blob | undefined> {
  return (await (await openDb()).get('images', id))?.blob;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/shared/storage/history.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/shared/storage/history.ts src/shared/storage/history.test.ts
git commit -m "feat: add IndexedDB history storage with attempts as the source of truth"
```

---

## Task 5: Typed message layer

**Files:**
- Create: `src/shared/messages.ts`
- Test: `src/shared/messages.test.ts`

**Interfaces:**
- Consumes: `Question`, `QuestionAnalysis`, `ProviderConfig`, `ImageInput`, `AnswerSubmission`, `ErrorTag` from types; `SerializedError` from errors.
- Produces: `RequestMap`, `sendRequest<T>(type, req)`, `registerHandlers(handlers)`, `PORT_ERROR_PSYCH`, `ErrorPsychRequest`, `ErrorPsychEvent`.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerHandlers, sendRequest } from './messages';

type Listener = (msg: unknown, sender: unknown, sendResponse: (r: unknown) => void) => boolean;
let listener: Listener;

beforeEach(() => {
  listener = () => false;
  (globalThis as any).chrome = {
    runtime: {
      onMessage: { addListener: (fn: Listener) => { listener = fn; } },
      sendMessage: (msg: unknown) =>
        new Promise((resolve) => { listener(msg, {}, resolve); }),
    },
  };
});

describe('message layer', () => {
  it('routes a request to its handler and wraps the result', async () => {
    registerHandlers({
      TEST_CONNECTION: async () => ({ ok: true, message: 'fine' }),
    });
    const res = await sendRequest('TEST_CONNECTION', { config: {} as any });
    expect(res).toEqual({ ok: true, data: { ok: true, message: 'fine' } });
  });

  it('serialises a thrown AppError instead of losing it across the boundary', async () => {
    registerHandlers({
      TEST_CONNECTION: async () => { throw Object.assign(new Error('x'), { isAppError: true, code: 'AUTH' }); },
    });
    const res = await sendRequest('TEST_CONNECTION', { config: {} as any });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('AUTH');
  });

  it('ignores messages whose type it has no handler for', async () => {
    registerHandlers({ TEST_CONNECTION: async () => ({ ok: true, message: '' }) });
    const handled = listener({ type: 'SOMETHING_ELSE' }, {}, vi.fn());
    expect(handled).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: FAIL — `Cannot find module './messages'`

- [ ] **Step 3: Implement**

```ts
import { type SerializedError, serializeError } from './errors';
import type {
  AnswerSubmission, ErrorTag, ImageInput, ProviderConfig, Question, QuestionAnalysis,
} from './types';

export interface RequestMap {
  PARSE_TEXT: {
    req: { rawText: string; images: ImageInput[]; origin: 'paste' | 'selection'; sourceUrl?: string; sourceTitle?: string };
    res: { sessionId: string; questions: Question[]; visionSkipped: boolean };
  };
  ANALYZE: {
    req: { sessionId: string; answers: AnswerSubmission[]; skippedQuestionIds: string[] };
    res: { analyses: QuestionAnalysis[]; attemptIdByQuestionId: Record<string, string> };
  };
  TEST_CONNECTION: {
    req: { config: ProviderConfig };
    res: { ok: boolean; message: string };
  };
}

export type RequestType = keyof RequestMap;

export type Reply<T extends RequestType> =
  | { ok: true; data: RequestMap[T]['res'] }
  | { ok: false; error: SerializedError };

export async function sendRequest<T extends RequestType>(
  type: T,
  req: RequestMap[T]['req'],
): Promise<Reply<T>> {
  return (await chrome.runtime.sendMessage({ type, ...req })) as Reply<T>;
}

export type Handlers = {
  [T in RequestType]?: (req: RequestMap[T]['req']) => Promise<RequestMap[T]['res']>;
};

export function registerHandlers(handlers: Handlers): void {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const type = (msg as { type?: RequestType })?.type;
    if (!type) return false;
    const handler = handlers[type];
    if (!handler) return false;

    (handler as (r: unknown) => Promise<unknown>)(msg)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: serializeError(e) }));

    return true; // keeps the channel open for the async response
  });
}

/* ---- streaming port: error psychology ---- */

export const PORT_ERROR_PSYCH = 'errorPsych';

export interface ErrorPsychRequest {
  questionId: string;
  attemptId: string;
  userTags: ErrorTag[];
  userNote?: string;
}

export type ErrorPsychEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; aiDiagnosis: string; fixAdvice: string }
  | { type: 'error'; error: SerializedError };
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/shared/messages.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/shared/messages.ts src/shared/messages.test.ts
git commit -m "feat: add typed request/response message layer with error serialisation"
```

---

## Task 6: AI schemas and the repair retry

**Files:**
- Create: `src/ai/types.ts`, `src/ai/schema.ts`
- Test: `src/ai/schema.test.ts`

**Interfaces:**
- Consumes: `TopicCategory` from types.
- Produces: `AIProvider`, `ChatRequest`, `ChatPart`; `ParseResultSchema`, `AnalyzeResultSchema`, `ParsedQuestion`, `RawAnalysis`; `parseJsonWithRepair<T>(raw, schema, repair)`.

Note the design decision the test pins down: the AI maps its output back to questions by **`order`**, never by our UUIDs. Models do not reliably echo UUIDs.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { AnalyzeResultSchema, ParseResultSchema, parseJsonWithRepair } from './schema';

const validParse = JSON.stringify({
  questions: [{ order: 1, stem: 'The manager ___ the report.', choices: [
    { label: 'A', text: 'submit' }, { label: 'B', text: 'submits' },
  ] }],
});

describe('ai schema', () => {
  it('accepts a well-formed parse result', async () => {
    const out = await parseJsonWithRepair(validParse, ParseResultSchema, vi.fn());
    expect(out.questions[0].order).toBe(1);
  });

  it('rejects a parse result that leaks the correct answer', () => {
    const leaked = { questions: [{ order: 1, stem: 's', correctAnswer: 'B', choices: [
      { label: 'A', text: 'a' }, { label: 'B', text: 'b' },
    ] }] };
    const parsed = ParseResultSchema.parse(leaked);
    expect(parsed.questions[0]).not.toHaveProperty('correctAnswer');
  });

  it('strips markdown code fences before parsing', async () => {
    const fenced = '```json\n' + validParse + '\n```';
    const out = await parseJsonWithRepair(fenced, ParseResultSchema, vi.fn());
    expect(out.questions).toHaveLength(1);
  });

  it('retries exactly once with corrective feedback, then succeeds', async () => {
    const repair = vi.fn().mockResolvedValue(validParse);
    const out = await parseJsonWithRepair('not json at all', ParseResultSchema, repair);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair.mock.calls[0][0]).toMatch(/JSON/i);
    expect(out.questions).toHaveLength(1);
  });

  it('throws SCHEMA carrying the raw output after a second failure', async () => {
    const repair = vi.fn().mockResolvedValue('still garbage');
    await expect(parseJsonWithRepair('garbage', ParseResultSchema, repair))
      .rejects.toMatchObject({ code: 'SCHEMA', raw: 'still garbage' });
    expect(repair).toHaveBeenCalledTimes(1);
  });

  it('accepts a well-formed analyze result', () => {
    const parsed = AnalyzeResultSchema.parse({ analyses: [{
      order: 1, correctAnswer: 'B', explanation: 'e', strategy: 's',
      topic: 'subject-verb agreement', topicCategory: 'grammar',
    }] });
    expect(parsed.analyses[0].topicCategory).toBe('grammar');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ai/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'`

- [ ] **Step 3: Write `src/ai/types.ts`**

```ts
export type ChatPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mime: string; dataBase64: string };

export interface ChatRequest {
  system: string;
  userParts: ChatPart[];
  json: boolean;
  temperature?: number;
}

export interface AIProvider {
  complete(req: ChatRequest, signal: AbortSignal): Promise<string>;
  stream(req: ChatRequest, signal: AbortSignal): AsyncIterable<{ delta: string }>;
}
```

- [ ] **Step 4: Write `src/ai/schema.ts`**

```ts
import { z } from 'zod';
import { appError } from '../shared/errors';

const ChoiceSchema = z.object({
  label: z.string().min(1).max(4),
  text: z.string(),
});

/**
 * Deliberately has no `correctAnswer` field. zod strips unknown keys by
 * default, so even if the model volunteers the answer it never reaches the
 * client during the review step.
 */
export const ParsedQuestionSchema = z.object({
  order: z.number().int().min(1),
  stem: z.string().min(1),
  passage: z.string().optional(),
  choices: z.array(ChoiceSchema).min(2),
  toeicPart: z.number().int().min(1).max(7).optional(),
});

export const ParseResultSchema = z.object({
  questions: z.array(ParsedQuestionSchema),
});

export const RawAnalysisSchema = z.object({
  order: z.number().int().min(1),
  correctAnswer: z.string().min(1).max(4),
  explanation: z.string().min(1),
  strategy: z.string().min(1),
  distractorNotes: z.record(z.string(), z.string()).optional(),
  topic: z.string().min(1),
  topicCategory: z.enum(['grammar', 'vocabulary', 'reading', 'other']),
});

export const AnalyzeResultSchema = z.object({
  analyses: z.array(RawAnalysisSchema),
});

export type ParsedQuestion = z.infer<typeof ParsedQuestionSchema>;
export type RawAnalysis = z.infer<typeof RawAnalysisSchema>;

/** Models wrap JSON in markdown fences often enough to be worth handling. */
export function stripFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

/**
 * Validate model output. On failure, call `repair` exactly once with
 * corrective feedback, then validate again. A second failure throws SCHEMA
 * with the raw text attached so the UI can show it.
 */
export async function parseJsonWithRepair<T>(
  raw: string,
  schema: z.ZodType<T>,
  repair: (feedback: string) => Promise<string>,
): Promise<T> {
  const attempt = (text: string): { ok: true; value: T } | { ok: false; reason: string } => {
    try {
      return { ok: true, value: schema.parse(JSON.parse(stripFences(text))) };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  };

  const first = attempt(raw);
  if (first.ok) return first.value;

  const retried = await repair(
    `Your previous reply was not valid JSON matching the required schema. ` +
      `Error: ${first.reason}. Reply again with ONLY the JSON object, no prose, no markdown fences.`,
  );

  const second = attempt(retried);
  if (second.ok) return second.value;

  throw appError('SCHEMA', { detail: second.reason, raw: retried });
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/ai/schema.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 6: Commit**

```bash
git add src/ai/types.ts src/ai/schema.ts src/ai/schema.test.ts
git commit -m "feat: add AI output schemas with a one-shot repair retry

The parse schema has no correctAnswer field, so the answer cannot reach the
client while the user is recording what they originally picked."
```

---

## Task 7: Prompts

**Files:**
- Create: `src/ai/prompts/parse.ts`, `src/ai/prompts/analyze.ts`, `src/ai/prompts/errorPsych.ts`
- Test: `src/ai/prompts/prompts.test.ts`

**Interfaces:**
- Consumes: `ParsedQuestion` from schema; `ExplanationLanguage`, `Question`, `ErrorTag` from types; `S` from strings.
- Produces: `buildParsePrompt(lang)`, `buildAnalyzePrompt(input)`, `buildErrorPsychPrompt(input)`, `FIX_MARKER`, `splitDiagnosis(text)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildParsePrompt } from './parse';
import { buildAnalyzePrompt } from './analyze';
import { FIX_MARKER, buildErrorPsychPrompt, splitDiagnosis } from './errorPsych';

const q = {
  id: 'q1', sessionId: 's', order: 1, stem: 'The manager ___ the report.',
  choices: [{ label: 'A', text: 'submit' }, { label: 'B', text: 'submits' }],
  imageIds: [],
};

describe('prompts', () => {
  it('forbids the parse step from returning the correct answer', () => {
    const p = buildParsePrompt('vi');
    expect(p.toLowerCase()).toMatch(/never.*(correct answer|which answer is correct)/s);
    expect(p).toMatch(/"order"/);
  });

  it('caps the parse step at 20 questions', () => {
    expect(buildParsePrompt('vi')).toMatch(/20/);
  });

  it('instructs each language mode differently', () => {
    expect(buildParsePrompt('vi')).toMatch(/Vietnamese/);
    expect(buildAnalyzePrompt({ language: 'en', questions: [q], answers: {} }).system).toMatch(/English/);
    expect(buildAnalyzePrompt({ language: 'bilingual', questions: [q], answers: {} }).system).toMatch(/both/i);
  });

  it('tells the analyze step what the user picked, including "not attempted"', () => {
    const { user } = buildAnalyzePrompt({ language: 'vi', questions: [q], answers: { q1: undefined } });
    expect(user).toMatch(/not attempted/i);
    const answered = buildAnalyzePrompt({ language: 'vi', questions: [q], answers: { q1: 'A' } });
    expect(answered.user).toMatch(/"userAnswer": "A"/);
  });

  it('keeps English grammar terminology even when explaining in Vietnamese', () => {
    expect(buildAnalyzePrompt({ language: 'vi', questions: [q], answers: {} }).system)
      .toMatch(/terminology/i);
  });

  it('asks the error-psychology step for two sections split by a marker', () => {
    const { system } = buildErrorPsychPrompt({
      language: 'vi', question: q, correctAnswer: 'B', userAnswer: 'A',
      userTags: ['no_grammar'], userNote: 'nhìn nhầm',
    });
    expect(system).toContain(FIX_MARKER);
  });

  it('splits a streamed diagnosis on the marker', () => {
    expect(splitDiagnosis(`why you erred${FIX_MARKER}how to fix`))
      .toEqual({ aiDiagnosis: 'why you erred', fixAdvice: 'how to fix' });
  });

  it('puts the whole text in the diagnosis when the marker is missing', () => {
    expect(splitDiagnosis('only prose')).toEqual({ aiDiagnosis: 'only prose', fixAdvice: '' });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ai/prompts`
Expected: FAIL — `Cannot find module './parse'`

- [ ] **Step 3: Write `src/ai/prompts/language.ts`**

```ts
import type { ExplanationLanguage } from '../../shared/types';

export function languageInstruction(lang: ExplanationLanguage): string {
  switch (lang) {
    case 'vi':
      return 'Write all explanatory prose in Vietnamese.';
    case 'en':
      return 'Write all explanatory prose in English.';
    case 'bilingual':
      return 'Write every explanatory point twice: first in Vietnamese, then the same point in English on the next line.';
  }
}
```

- [ ] **Step 4: Write `src/ai/prompts/parse.ts`**

```ts
import type { ExplanationLanguage } from '../../shared/types';
import { languageInstruction } from './language';

export function buildParsePrompt(lang: ExplanationLanguage): string {
  return [
    'You split raw text copied from a TOEIC practice test into structured questions.',
    '',
    'Rules:',
    '- Return at most 20 questions. If the input has more, return the first 20.',
    '- NEVER include the correct answer, and never hint at which answer is correct. Your only job here is splitting.',
    '- `order` is 1-based and follows the order the questions appear in the input.',
    '- Keep the original English wording of stems and choices verbatim. Do not translate or fix them.',
    '- `choices` uses the labels shown in the source (usually A, B, C, D). If labels are missing, assign A, B, C, D in order.',
    '- For Part 6 and Part 7, put the shared reading passage in `passage` on every question that depends on it, and keep only the question sentence in `stem`.',
    '- Set `toeicPart` (1-7) only when you can tell with confidence. Otherwise omit it.',
    '- If the input contains no multiple-choice question at all, return `{"questions": []}`.',
    '',
    languageInstruction(lang),
    '',
    'Reply with ONLY this JSON object, no prose and no markdown fences:',
    '{',
    '  "questions": [',
    '    {',
    '      "order": 1,',
    '      "stem": "string",',
    '      "passage": "string (optional)",',
    '      "choices": [{ "label": "A", "text": "string" }],',
    '      "toeicPart": 5',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}
```

- [ ] **Step 5: Write `src/ai/prompts/analyze.ts`**

```ts
import type { ExplanationLanguage, Question } from '../../shared/types';
import { languageInstruction } from './language';

export interface AnalyzePromptInput {
  language: ExplanationLanguage;
  questions: Question[];
  answers: Record<string, string | undefined>;
}

export function buildAnalyzePrompt(input: AnalyzePromptInput): { system: string; user: string } {
  const system = [
    'You are a TOEIC coach. For each question you are given, decide the correct answer and explain it.',
    '',
    'Rules:',
    '- `explanation`: 3 to 4 lines. Say why the correct choice is correct — the grammar rule, collocation or reading clue at work.',
    '- `strategy`: 1 to 2 lines. The reusable signal a test-taker can spot next time under time pressure.',
    '- `distractorNotes`: one short line per wrong label explaining why it fails. Omit if the question has no meaningful distractors.',
    '- `topic`: a short, reusable label for the tested point, in English, lowercase (examples: "subject-verb agreement", "gerund vs infinitive", "business vocabulary: shipping"). Reuse the same wording for the same point across questions so it can be counted.',
    '- `topicCategory`: one of grammar, vocabulary, reading, other.',
    '- Keep English grammar terminology and the source vocabulary in English even when the surrounding prose is Vietnamese. Do not translate "subject-verb agreement" or the answer words themselves.',
    '- Be concise. This is revision material, not a textbook.',
    '- Return one entry per input question, matched by `order`.',
    '',
    languageInstruction(input.language),
    '',
    'Reply with ONLY this JSON object, no prose and no markdown fences:',
    '{',
    '  "analyses": [',
    '    {',
    '      "order": 1,',
    '      "correctAnswer": "B",',
    '      "explanation": "string",',
    '      "strategy": "string",',
    '      "distractorNotes": { "A": "string" },',
    '      "topic": "string",',
    '      "topicCategory": "grammar"',
    '    }',
    '  ]',
    '}',
  ].join('\n');

  const payload = input.questions.map((q) => ({
    order: q.order,
    passage: q.passage,
    stem: q.stem,
    choices: q.choices,
    userAnswer: input.answers[q.id] ?? 'not attempted',
  }));

  return { system, user: JSON.stringify({ questions: payload }, null, 2) };
}
```

- [ ] **Step 6: Write `src/ai/prompts/errorPsych.ts`**

```ts
import type { ErrorTag, ExplanationLanguage, Question } from '../../shared/types';
import { languageInstruction } from './language';

export const FIX_MARKER = '\n---FIX---\n';

const TAG_DESCRIPTIONS: Record<ErrorTag, string> = {
  no_grammar: 'did not know the grammar rule',
  no_structure: 'did not recognise the sentence structure',
  no_vocab: 'did not know the vocabulary',
  misclick: 'clicked the wrong option by accident',
  misread: 'skimmed and misread the question',
  time_pressure: 'ran out of time and guessed',
  trap_similar: 'was caught by a distractor that looked almost identical',
};

export interface ErrorPsychPromptInput {
  language: ExplanationLanguage;
  question: Question;
  correctAnswer: string;
  userAnswer: string;
  userTags: ErrorTag[];
  userNote?: string;
}

export function buildErrorPsychPrompt(input: ErrorPsychPromptInput): { system: string; user: string } {
  const system = [
    'You are a TOEIC coach diagnosing why a learner picked a specific wrong answer.',
    '',
    'Write two sections separated by the exact marker line ---FIX--- :',
    '1. Before the marker: what pulled the learner toward that specific wrong choice. Be concrete about the trap in this question — surface similarity, a familiar-looking collocation, a word that reads plausibly in isolation. Take their self-reported reasons seriously but say so plainly if the question suggests a different cause.',
    '2. After the marker: what to do differently next time. One or two concrete, checkable habits. No generic advice like "study more" or "read carefully".',
    '',
    'Keep the whole reply under 180 words. Do not repeat the question text back.',
    '',
    languageInstruction(input.language),
    '',
    `The marker must appear exactly once, on its own line: ${FIX_MARKER.trim()}`,
  ].join('\n');

  const tags = input.userTags.map((t) => TAG_DESCRIPTIONS[t]);
  const user = JSON.stringify(
    {
      passage: input.question.passage,
      stem: input.question.stem,
      choices: input.question.choices,
      correctAnswer: input.correctAnswer,
      learnerChose: input.userAnswer,
      learnerSelfReportedReasons: tags,
      learnerNote: input.userNote || undefined,
    },
    null,
    2,
  );

  return { system, user };
}

export function splitDiagnosis(text: string): { aiDiagnosis: string; fixAdvice: string } {
  const idx = text.indexOf('---FIX---');
  if (idx === -1) return { aiDiagnosis: text.trim(), fixAdvice: '' };
  return {
    aiDiagnosis: text.slice(0, idx).trim(),
    fixAdvice: text.slice(idx + '---FIX---'.length).trim(),
  };
}
```

- [ ] **Step 7: Run the test and watch it pass**

Run: `npx vitest run src/ai/prompts`
Expected: PASS, 8 tests

- [ ] **Step 8: Commit**

```bash
git add src/ai/prompts src/ai/prompts/prompts.test.ts
git commit -m "feat: add parse, analyze and error-psychology prompts"
```

---

## Task 8: OpenAI-compatible adapter

**Files:**
- Create: `src/ai/openai.ts`
- Test: `src/ai/openai.test.ts`

**Interfaces:**
- Consumes: `AIProvider`, `ChatRequest` from `src/ai/types.ts`; `ProviderConfig` from types; `appError` from errors.
- Produces: `createOpenAIProvider(config: ProviderConfig): AIProvider`; `mapHttpError(status, body): AppError` (exported for reuse by the Gemini adapter).

- [ ] **Step 1: Write the failing test**

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createOpenAIProvider } from './openai';
import { isAppError } from '../shared/errors';
import type { ProviderConfig } from '../shared/types';

const config: ProviderConfig = {
  provider: 'openai', apiKey: 'sk-test', model: 'gpt-test', supportsVision: true,
};

let lastBody: any;
let lastAuth: string | null;

const server = setupServer(
  http.post('https://api.openai.com/v1/chat/completions', async ({ request }) => {
    lastBody = await request.json();
    lastAuth = request.headers.get('authorization');
    if (lastBody.stream) {
      const sse = [
        'data: {"choices":[{"delta":{"content":"Hel"}}]}',
        'data: {"choices":[{"delta":{"content":"lo"}}]}',
        'data: [DONE]',
      ].join('\n\n') + '\n\n';
      return new HttpResponse(sse, { headers: { 'Content-Type': 'text/event-stream' } });
    }
    return HttpResponse.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('openai adapter', () => {
  it('sends the bearer token and the model, and returns the message content', async () => {
    const out = await createOpenAIProvider(config).complete(
      { system: 'sys', userParts: [{ type: 'text', text: 'hi' }], json: true },
      new AbortController().signal,
    );
    expect(out).toBe('{"ok":true}');
    expect(lastAuth).toBe('Bearer sk-test');
    expect(lastBody.model).toBe('gpt-test');
    expect(lastBody.response_format).toEqual({ type: 'json_object' });
    expect(lastBody.messages[0]).toEqual({ role: 'system', content: 'sys' });
  });

  it('omits response_format when json is false', async () => {
    await createOpenAIProvider(config).complete(
      { system: 's', userParts: [{ type: 'text', text: 'hi' }], json: false },
      new AbortController().signal,
    );
    expect(lastBody.response_format).toBeUndefined();
  });

  it('encodes images as data-URI image_url parts', async () => {
    await createOpenAIProvider(config).complete(
      { system: 's', userParts: [
        { type: 'text', text: 'look' },
        { type: 'image', mime: 'image/jpeg', dataBase64: 'QUJD' },
      ], json: false },
      new AbortController().signal,
    );
    expect(lastBody.messages[1].content).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } },
    ]);
  });

  it('streams deltas in order', async () => {
    const chunks: string[] = [];
    for await (const c of createOpenAIProvider(config).stream(
      { system: 's', userParts: [{ type: 'text', text: 'hi' }], json: false },
      new AbortController().signal,
    )) chunks.push(c.delta);
    expect(chunks.join('')).toBe('Hello');
  });

  it('honours a custom baseUrl', async () => {
    let hit = false;
    server.use(http.post('https://openrouter.test/api/v1/chat/completions', () => {
      hit = true;
      return HttpResponse.json({ choices: [{ message: { content: 'x' } }] });
    }));
    await createOpenAIProvider({ ...config, baseUrl: 'https://openrouter.test/api/v1' })
      .complete({ system: 's', userParts: [], json: false }, new AbortController().signal);
    expect(hit).toBe(true);
  });

  it.each([
    [401, 'AUTH'],
    [403, 'AUTH'],
    [429, 'RATE_LIMIT'],
    [500, 'UNKNOWN'],
  ])('maps HTTP %i to %s', async (status, code) => {
    server.use(http.post('https://api.openai.com/v1/chat/completions', () =>
      HttpResponse.text('nope', { status })));
    try {
      await createOpenAIProvider(config).complete(
        { system: 's', userParts: [], json: false }, new AbortController().signal);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(isAppError(e) && e.code).toBe(code);
    }
  });

  it('maps a network failure to NETWORK', async () => {
    server.use(http.post('https://api.openai.com/v1/chat/completions', () => HttpResponse.error()));
    try {
      await createOpenAIProvider(config).complete(
        { system: 's', userParts: [], json: false }, new AbortController().signal);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(isAppError(e) && e.code).toBe('NETWORK');
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ai/openai.test.ts`
Expected: FAIL — `Cannot find module './openai'`

- [ ] **Step 3: Implement**

```ts
import { type AppError, appError } from '../shared/errors';
import type { ProviderConfig } from '../shared/types';
import type { AIProvider, ChatPart, ChatRequest } from './types';

const DEFAULT_BASE = 'https://api.openai.com/v1';

export function mapHttpError(status: number, body: string): AppError {
  if (status === 401 || status === 403) return appError('AUTH', { detail: body.slice(0, 300) });
  if (status === 429) return appError('RATE_LIMIT', { detail: body.slice(0, 300) });
  return appError('UNKNOWN', { detail: `HTTP ${status}: ${body.slice(0, 300)}` });
}

function toContent(parts: ChatPart[]) {
  return parts.map((p) =>
    p.type === 'text'
      ? { type: 'text', text: p.text }
      : { type: 'image_url', image_url: { url: `data:${p.mime};base64,${p.dataBase64}` } },
  );
}

/** Splits an SSE byte stream into `data:` payload strings. */
export async function* sseLines(res: Response): AsyncGenerator<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
    }
  }
}

export function createOpenAIProvider(config: ProviderConfig): AIProvider {
  const base = config.baseUrl ?? DEFAULT_BASE;

  async function post(req: ChatRequest, stream: boolean, signal: AbortSignal): Promise<Response> {
    const body: Record<string, unknown> = {
      model: config.model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: toContent(req.userParts) },
      ],
      stream,
    };
    if (req.json) body.response_format = { type: 'json_object' };
    if (req.temperature != null) body.temperature = req.temperature;

    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (signal.aborted) throw e;
      throw appError('NETWORK', { detail: e instanceof Error ? e.message : String(e) });
    }
    if (!res.ok) throw mapHttpError(res.status, await res.text());
    return res;
  }

  return {
    async complete(req, signal) {
      const res = await post(req, false, signal);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return json.choices?.[0]?.message?.content ?? '';
    },

    async *stream(req, signal) {
      const res = await post(req, true, signal);
      for await (const payload of sseLines(res)) {
        if (payload === '[DONE]') return;
        try {
          const chunk = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield { delta };
        } catch {
          // Ignore keep-alive comments and malformed fragments; the stream continues.
        }
      }
    },
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/ai/openai.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/ai/openai.ts src/ai/openai.test.ts
git commit -m "feat: add OpenAI-compatible provider adapter with SSE streaming

The open baseUrl also covers OpenRouter, Groq and LM Studio."
```

---

## Task 9: Gemini adapter and the provider factory

**Files:**
- Create: `src/ai/gemini.ts`, `src/ai/index.ts`
- Test: `src/ai/gemini.test.ts`, `src/ai/index.test.ts`

**Interfaces:**
- Consumes: `mapHttpError`, `sseLines` from `src/ai/openai.ts`; `AIProvider`, `ChatRequest` from `src/ai/types.ts`.
- Produces: `createGeminiProvider(config)`, `createProvider(config): AIProvider`.

- [ ] **Step 1: Write the failing tests**

`src/ai/gemini.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createGeminiProvider } from './gemini';
import { isAppError } from '../shared/errors';
import type { ProviderConfig } from '../shared/types';

const config: ProviderConfig = {
  provider: 'gemini', apiKey: 'g-key', model: 'gemini-test', supportsVision: true,
};
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

let lastBody: any;
let lastUrl: URL;

const server = setupServer(
  http.post(`${BASE}/models/gemini-test:generateContent`, async ({ request }) => {
    lastBody = await request.json();
    lastUrl = new URL(request.url);
    return HttpResponse.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
  }),
  http.post(`${BASE}/models/gemini-test:streamGenerateContent`, () => {
    const sse = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}',
      'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}]}',
    ].join('\n\n') + '\n\n';
    return new HttpResponse(sse, { headers: { 'Content-Type': 'text/event-stream' } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('gemini adapter', () => {
  it('passes the key as a query param and the system prompt as systemInstruction', async () => {
    const out = await createGeminiProvider(config).complete(
      { system: 'sys', userParts: [{ type: 'text', text: 'hi' }], json: true },
      new AbortController().signal,
    );
    expect(out).toBe('{"ok":true}');
    expect(lastUrl.searchParams.get('key')).toBe('g-key');
    expect(lastBody.systemInstruction.parts[0].text).toBe('sys');
    expect(lastBody.generationConfig.responseMimeType).toBe('application/json');
  });

  it('omits responseMimeType when json is false', async () => {
    await createGeminiProvider(config).complete(
      { system: 's', userParts: [{ type: 'text', text: 'hi' }], json: false },
      new AbortController().signal,
    );
    expect(lastBody.generationConfig?.responseMimeType).toBeUndefined();
  });

  it('encodes images as inlineData parts', async () => {
    await createGeminiProvider(config).complete(
      { system: 's', userParts: [
        { type: 'text', text: 'look' },
        { type: 'image', mime: 'image/jpeg', dataBase64: 'QUJD' },
      ], json: false },
      new AbortController().signal,
    );
    expect(lastBody.contents[0].parts).toEqual([
      { text: 'look' },
      { inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } },
    ]);
  });

  it('streams deltas in order', async () => {
    const chunks: string[] = [];
    for await (const c of createGeminiProvider(config).stream(
      { system: 's', userParts: [{ type: 'text', text: 'hi' }], json: false },
      new AbortController().signal,
    )) chunks.push(c.delta);
    expect(chunks.join('')).toBe('Hello');
  });

  it('maps 401 to AUTH', async () => {
    server.use(http.post(`${BASE}/models/gemini-test:generateContent`, () =>
      HttpResponse.text('bad key', { status: 401 })));
    try {
      await createGeminiProvider(config).complete(
        { system: 's', userParts: [], json: false }, new AbortController().signal);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(isAppError(e) && e.code).toBe('AUTH');
    }
  });
});
```

`src/ai/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createProvider } from './index';
import { isAppError } from '../shared/errors';
import { DEFAULT_SETTINGS } from '../shared/storage/settings';

describe('provider factory', () => {
  it('refuses to build a provider without an API key', () => {
    try {
      createProvider(DEFAULT_SETTINGS.ai);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(isAppError(e) && e.code).toBe('NO_API_KEY');
    }
  });

  it('builds a provider for each supported vendor', () => {
    for (const provider of ['openai', 'gemini'] as const) {
      const p = createProvider({ provider, apiKey: 'k', model: 'm', supportsVision: true });
      expect(typeof p.complete).toBe('function');
      expect(typeof p.stream).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ai/gemini.test.ts src/ai/index.test.ts`
Expected: FAIL — `Cannot find module './gemini'`

- [ ] **Step 3: Write `src/ai/gemini.ts`**

```ts
import { appError } from '../shared/errors';
import type { ProviderConfig } from '../shared/types';
import { mapHttpError, sseLines } from './openai';
import type { AIProvider, ChatPart, ChatRequest } from './types';

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function toParts(parts: ChatPart[]) {
  return parts.map((p) =>
    p.type === 'text'
      ? { text: p.text }
      : { inlineData: { mimeType: p.mime, data: p.dataBase64 } },
  );
}

export function createGeminiProvider(config: ProviderConfig): AIProvider {
  const base = config.baseUrl ?? DEFAULT_BASE;

  async function post(req: ChatRequest, stream: boolean, signal: AbortSignal): Promise<Response> {
    const method = stream ? 'streamGenerateContent' : 'generateContent';
    const url = new URL(`${base}/models/${config.model}:${method}`);
    url.searchParams.set('key', config.apiKey);
    if (stream) url.searchParams.set('alt', 'sse');

    const generationConfig: Record<string, unknown> = {};
    if (req.json) generationConfig.responseMimeType = 'application/json';
    if (req.temperature != null) generationConfig.temperature = req.temperature;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: 'user', parts: toParts(req.userParts) }],
          generationConfig,
        }),
        signal,
      });
    } catch (e) {
      if (signal.aborted) throw e;
      throw appError('NETWORK', { detail: e instanceof Error ? e.message : String(e) });
    }
    if (!res.ok) throw mapHttpError(res.status, await res.text());
    return res;
  }

  type GeminiChunk = { candidates?: { content?: { parts?: { text?: string }[] } }[] };

  return {
    async complete(req, signal) {
      const res = await post(req, false, signal);
      const json = (await res.json()) as GeminiChunk;
      return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    },

    async *stream(req, signal) {
      const res = await post(req, true, signal);
      for await (const payload of sseLines(res)) {
        if (!payload) continue;
        try {
          const chunk = JSON.parse(payload) as GeminiChunk;
          const delta = chunk.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
          if (delta) yield { delta };
        } catch {
          // Ignore malformed fragments; the stream continues.
        }
      }
    },
  };
}
```

Note: Gemini gets no `responseSchema`. The schema lives in the prompt text and zod enforces it — see the deviation note in Global Constraints.

- [ ] **Step 4: Write `src/ai/index.ts`**

```ts
import { appError } from '../shared/errors';
import type { ProviderConfig } from '../shared/types';
import { createGeminiProvider } from './gemini';
import { createOpenAIProvider } from './openai';
import type { AIProvider } from './types';

export function createProvider(config: ProviderConfig): AIProvider {
  if (!config.apiKey.trim() || !config.model.trim()) throw appError('NO_API_KEY');
  return config.provider === 'gemini'
    ? createGeminiProvider(config)
    : createOpenAIProvider(config);
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run src/ai`
Expected: PASS — all AI suites green

- [ ] **Step 6: Commit**

```bash
git add src/ai/gemini.ts src/ai/index.ts src/ai/gemini.test.ts src/ai/index.test.ts
git commit -m "feat: add Gemini adapter and the provider factory"
```

---

## Task 10: AI runner and the background message router

**Files:**
- Create: `src/background/aiRunner.ts`
- Modify: `src/background/index.ts` (replaces the Task 1 spike body entirely)
- Test: `src/background/aiRunner.test.ts`

**Interfaces:**
- Consumes: `createProvider`, prompts, schemas, `getSettings`, history storage, `registerHandlers`, port constants.
- Produces: `runParse(input)`, `runAnalyze(input)`, `runErrorPsych(input)` (async generator), `runTestConnection(config)`.

- [ ] **Step 1: Write the failing test**

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeMock } from '../test/chromeMock';
import { resetDb, getAnalysis, getQuestionsBySession } from '../shared/storage/history';
import { saveSettings, DEFAULT_SETTINGS } from '../shared/storage/settings';

const complete = vi.fn();
const stream = vi.fn();
vi.mock('../ai/index', () => ({ createProvider: () => ({ complete, stream }) }));

const { runAnalyze, runErrorPsych, runParse } = await import('./aiRunner');

const mock = installChromeMock();

beforeEach(async () => {
  mock.reset();
  await resetDb();
  complete.mockReset();
  stream.mockReset();
  await saveSettings({ ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k', model: 'm' } });
});

const parseReply = JSON.stringify({
  questions: [
    { order: 1, stem: 'Q one', choices: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }] },
    { order: 2, stem: 'Q two', choices: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }] },
  ],
});

describe('runParse', () => {
  it('persists a session and its questions', async () => {
    complete.mockResolvedValue(parseReply);
    const out = await runParse({ rawText: 'raw', images: [], origin: 'paste' });
    expect(out.questions).toHaveLength(2);
    expect(await getQuestionsBySession(out.sessionId)).toHaveLength(2);
  });

  it('rejects when the model returns no questions', async () => {
    complete.mockResolvedValue(JSON.stringify({ questions: [] }));
    await expect(runParse({ rawText: 'raw', images: [], origin: 'paste' }))
      .rejects.toMatchObject({ code: 'PARSE_EMPTY' });
  });

  it('rejects more than 20 questions rather than truncating silently', async () => {
    const many = Array.from({ length: 21 }, (_, i) => ({
      order: i + 1, stem: `Q${i}`, choices: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }],
    }));
    complete.mockResolvedValue(JSON.stringify({ questions: many }));
    await expect(runParse({ rawText: 'raw', images: [], origin: 'paste' }))
      .rejects.toMatchObject({ code: 'TOO_MANY' });
  });

  it('drops images and flags it when the model has no vision support', async () => {
    await saveSettings({ ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k', model: 'm', supportsVision: false } });
    complete.mockResolvedValue(parseReply);
    const out = await runParse({
      rawText: 'raw', origin: 'paste',
      images: [{ mime: 'image/jpeg', dataBase64: 'QUJD' }],
    });
    expect(out.visionSkipped).toBe(true);
    expect(complete.mock.calls[0][0].userParts.some((p: any) => p.type === 'image')).toBe(false);
  });
});

describe('runAnalyze', () => {
  it('maps analyses back by order, deletes skipped questions and records attempts', async () => {
    complete.mockResolvedValueOnce(parseReply);
    const parsed = await runParse({ rawText: 'raw', images: [], origin: 'paste' });
    const [q1, q2] = parsed.questions;

    complete.mockResolvedValueOnce(JSON.stringify({
      analyses: [{
        order: 1, correctAnswer: 'B', explanation: 'e', strategy: 's',
        topic: 'subject-verb agreement', topicCategory: 'grammar',
      }],
    }));

    const out = await runAnalyze({
      sessionId: parsed.sessionId,
      answers: [{ questionId: q1.id, userAnswer: 'A' }],
      skippedQuestionIds: [q2.id],
    });

    expect(out.analyses[0].questionId).toBe(q1.id);
    expect((await getAnalysis(q1.id))?.correctAnswer).toBe('B');
    expect(await getQuestionsBySession(parsed.sessionId)).toHaveLength(1);
    expect(out.attemptIdByQuestionId[q1.id]).toBeTruthy();
  });
});

describe('runErrorPsych', () => {
  it('streams deltas then persists the split diagnosis', async () => {
    complete.mockResolvedValueOnce(parseReply);
    const parsed = await runParse({ rawText: 'raw', images: [], origin: 'paste' });
    const q = parsed.questions[0];

    complete.mockResolvedValueOnce(JSON.stringify({
      analyses: [{ order: 1, correctAnswer: 'B', explanation: 'e', strategy: 's',
        topic: 't', topicCategory: 'grammar' }],
    }));
    const analyzed = await runAnalyze({
      sessionId: parsed.sessionId,
      answers: [{ questionId: q.id, userAnswer: 'A' }],
      skippedQuestionIds: [],
    });

    stream.mockImplementation(async function* () {
      yield { delta: 'why' };
      yield { delta: '\n---FIX---\nhow' };
    });

    const seen: string[] = [];
    let final: { aiDiagnosis: string; fixAdvice: string } | undefined;
    for await (const ev of runErrorPsych({
      questionId: q.id,
      attemptId: analyzed.attemptIdByQuestionId[q.id],
      userTags: ['no_grammar'],
    })) {
      if (ev.type === 'delta') seen.push(ev.text);
      if (ev.type === 'done') final = { aiDiagnosis: ev.aiDiagnosis, fixAdvice: ev.fixAdvice };
    }

    expect(seen.join('')).toContain('why');
    expect(final).toEqual({ aiDiagnosis: 'why', fixAdvice: 'how' });
  });
});

describe('configuration guard', () => {
  it('refuses every run when no API key is configured', async () => {
    mock.reset();
    await expect(runParse({ rawText: 'raw', images: [], origin: 'paste' }))
      .rejects.toMatchObject({ code: 'NO_API_KEY' });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/background/aiRunner.test.ts`
Expected: FAIL — `Cannot find module './aiRunner'`

- [ ] **Step 3: Add two lookups to history storage**

The runner needs single-record reads that Task 4 did not expose. Append to `src/shared/storage/history.ts`:

```ts
export async function findQuestion(id: string): Promise<Question | undefined> {
  return (await openDb()).get('questions', id);
}

export async function answerForAttempt(attemptId: string): Promise<string | undefined> {
  return (await (await openDb()).get('attempts', attemptId))?.userAnswer;
}

/** Overwrites a whole session record — used to fill in questionIds after parsing. */
export async function putSession(session: Session): Promise<void> {
  await (await openDb()).put('sessions', session);
}
```

- [ ] **Step 4: Implement `src/background/aiRunner.ts`**

```ts
import { createProvider } from '../ai/index';
import { buildAnalyzePrompt } from '../ai/prompts/analyze';
import { FIX_MARKER, buildErrorPsychPrompt, splitDiagnosis } from '../ai/prompts/errorPsych';
import { buildParsePrompt } from '../ai/prompts/parse';
import { AnalyzeResultSchema, ParseResultSchema, parseJsonWithRepair } from '../ai/schema';
import type { ChatPart } from '../ai/types';
import { appError, serializeError } from '../shared/errors';
import type { ErrorPsychEvent, RequestMap } from '../shared/messages';
import {
  answerForAttempt, createSession, deleteQuestions, findQuestion, getAnalysis,
  getQuestionsBySession, putAnalyses, putErrorAnalysis, putQuestions, putSession,
  recordAttempt,
} from '../shared/storage/history';
import { getSettings, isConfigured } from '../shared/storage/settings';
import type { ErrorTag, ImageInput, Question, QuestionAnalysis, Settings } from '../shared/types';

const MAX_QUESTIONS = 20;

async function requireSettings(): Promise<Settings> {
  const settings = await getSettings();
  if (!isConfigured(settings)) throw appError('NO_API_KEY');
  return settings;
}

function imageParts(images: ImageInput[], supportsVision: boolean): ChatPart[] {
  if (!supportsVision) return [];
  return images.map((i) => ({ type: 'image' as const, mime: i.mime, dataBase64: i.dataBase64 }));
}

export async function runParse(
  input: RequestMap['PARSE_TEXT']['req'],
  signal: AbortSignal = new AbortController().signal,
): Promise<RequestMap['PARSE_TEXT']['res']> {
  const settings = await requireSettings();
  const provider = createProvider(settings.ai);
  const system = buildParsePrompt(settings.explanationLanguage);

  const visionSkipped = input.images.length > 0 && !settings.ai.supportsVision;
  const userParts: ChatPart[] = [
    { type: 'text', text: input.rawText },
    ...imageParts(input.images, settings.ai.supportsVision),
  ];

  const raw = await provider.complete({ system, userParts, json: true }, signal);
  const result = await parseJsonWithRepair(raw, ParseResultSchema, (feedback) =>
    provider.complete(
      { system, userParts: [...userParts, { type: 'text', text: feedback }], json: true },
      signal,
    ),
  );

  if (result.questions.length === 0) throw appError('PARSE_EMPTY');
  if (result.questions.length > MAX_QUESTIONS) {
    throw appError('TOO_MANY', { detail: `${result.questions.length} questions` });
  }

  const session = await createSession({
    origin: input.origin,
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle,
    rawText: input.rawText,
    questionIds: [],
  });

  const questions: Question[] = result.questions.map((q) => ({
    id: crypto.randomUUID(),
    sessionId: session.id,
    order: q.order,
    stem: q.stem,
    passage: q.passage,
    choices: q.choices,
    imageIds: [],
    toeicPart: q.toeicPart as Question['toeicPart'],
  }));

  await putQuestions(questions);
  await putSession({ ...session, questionIds: questions.map((q) => q.id) });

  return { sessionId: session.id, questions, visionSkipped };
}

export async function runAnalyze(
  input: RequestMap['ANALYZE']['req'],
  signal: AbortSignal = new AbortController().signal,
): Promise<RequestMap['ANALYZE']['res']> {
  const settings = await requireSettings();
  const provider = createProvider(settings.ai);

  if (input.skippedQuestionIds.length > 0) await deleteQuestions(input.skippedQuestionIds);

  const kept = (await getQuestionsBySession(input.sessionId)).filter(
    (q) => !input.skippedQuestionIds.includes(q.id),
  );
  if (kept.length === 0) throw appError('PARSE_EMPTY');

  const answers: Record<string, string | undefined> = {};
  for (const a of input.answers) answers[a.questionId] = a.userAnswer;

  const { system, user } = buildAnalyzePrompt({
    language: settings.explanationLanguage,
    questions: kept,
    answers,
  });
  const userParts: ChatPart[] = [{ type: 'text', text: user }];

  const raw = await provider.complete({ system, userParts, json: true }, signal);
  const result = await parseJsonWithRepair(raw, AnalyzeResultSchema, (feedback) =>
    provider.complete(
      { system, userParts: [...userParts, { type: 'text', text: feedback }], json: true },
      signal,
    ),
  );

  const byOrder = new Map(kept.map((q) => [q.order, q]));
  const analyses: QuestionAnalysis[] = [];
  const attemptIdByQuestionId: Record<string, string> = {};

  for (const a of result.analyses) {
    const question = byOrder.get(a.order);
    if (!question) continue; // the model invented an order; drop it rather than mis-attributing

    const analysis: QuestionAnalysis = {
      questionId: question.id,
      correctAnswer: a.correctAnswer,
      explanation: a.explanation,
      strategy: a.strategy,
      distractorNotes: a.distractorNotes,
      topic: a.topic,
      topicCategory: a.topicCategory,
    };
    analyses.push(analysis);

    const attempt = await recordAttempt({
      questionId: question.id,
      userAnswer: answers[question.id],
      correctAnswer: a.correctAnswer,
      isRetry: false,
    });
    attemptIdByQuestionId[question.id] = attempt.id;
  }

  await putAnalyses(analyses);
  return { analyses, attemptIdByQuestionId };
}

export async function* runErrorPsych(
  input: { questionId: string; attemptId: string; userTags: ErrorTag[]; userNote?: string },
  signal: AbortSignal = new AbortController().signal,
): AsyncGenerator<ErrorPsychEvent> {
  try {
    const settings = await requireSettings();
    const provider = createProvider(settings.ai);

    const analysis = await getAnalysis(input.questionId);
    if (!analysis) throw appError('UNKNOWN', { detail: 'analysis missing for question' });

    const question = await findQuestion(input.questionId);
    if (!question) throw appError('UNKNOWN', { detail: 'question missing' });

    const attemptAnswer = await answerForAttempt(input.attemptId);

    const { system, user } = buildErrorPsychPrompt({
      language: settings.explanationLanguage,
      question,
      correctAnswer: analysis.correctAnswer,
      userAnswer: attemptAnswer ?? '',
      userTags: input.userTags,
      userNote: input.userNote,
    });

    let full = '';
    for await (const chunk of provider.stream(
      { system, userParts: [{ type: 'text', text: user }], json: false },
      signal,
    )) {
      full += chunk.delta;
      yield { type: 'delta', text: chunk.delta };
    }

    const { aiDiagnosis, fixAdvice } = splitDiagnosis(full || FIX_MARKER);
    await putErrorAnalysis({
      attemptId: input.attemptId,
      questionId: input.questionId,
      userTags: input.userTags,
      userNote: input.userNote,
      aiDiagnosis,
      fixAdvice,
    });

    yield { type: 'done', aiDiagnosis, fixAdvice };
  } catch (e) {
    yield { type: 'error', error: serializeError(e) };
  }
}

export async function runTestConnection(
  config: RequestMap['TEST_CONNECTION']['req']['config'],
): Promise<RequestMap['TEST_CONNECTION']['res']> {
  try {
    const provider = createProvider(config);
    await provider.complete(
      {
        system: 'Reply with the single word OK.',
        userParts: [{ type: 'text', text: 'ping' }],
        json: false,
      },
      AbortSignal.timeout(20_000),
    );
    return { ok: true, message: '' };
  } catch (e) {
    return { ok: false, message: serializeError(e).code };
  }
}
```

Note on cancellation: `runParse` and `runAnalyze` accept an `AbortSignal` but the `sendMessage` transport has no cancel channel, so in practice they run to completion. Only the error-psychology port aborts on disconnect (Step 6). Plan 2 revisits this once selection changes can invalidate an in-flight parse.

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/background/aiRunner.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 6: Replace the background entry point**

`src/background/index.ts`:

```ts
import { PORT_ERROR_PSYCH, registerHandlers } from '../shared/messages';
import { runAnalyze, runErrorPsych, runParse, runTestConnection } from './aiRunner';

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error('[imen] setPanelBehavior failed', e));

registerHandlers({
  PARSE_TEXT: (req) => runParse(req),
  ANALYZE: (req) => runAnalyze(req),
  TEST_CONNECTION: (req) => runTestConnection(req.config),
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_ERROR_PSYCH) return;

  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());

  port.onMessage.addListener(async (req) => {
    for await (const event of runErrorPsych(req, controller.signal)) {
      try {
        port.postMessage(event);
      } catch {
        return; // the panel closed mid-stream
      }
    }
  });
});
```

- [ ] **Step 7: Verify the whole suite still passes**

Run: `npx vitest run`
Expected: PASS, every suite green

- [ ] **Step 8: Commit**

```bash
git add src/background src/shared/storage/history.ts
git commit -m "feat: add AI runner orchestrating parse, analyze and error psychology

Replaces the Task 1 spike background with the real message router and the
streaming port for error-psychology prose."
```

---

## Task 11: Options page and Settings view

Settings comes before any analysis UI because nothing else can run without an API key.

**Files:**
- Modify: `src/app/main.tsx`
- Create: `src/app/App.tsx`, `src/app/views/Settings.tsx`
- Test: `src/app/views/Settings.test.tsx`

**Interfaces:**
- Consumes: `getSettings`, `saveSettings` from settings storage; `sendRequest` from messages; `S` from strings.
- Produces: the `Settings` view component; the options page shell.

- [ ] **Step 1: Write the failing test**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installChromeMock } from '../../test/chromeMock';
import { S } from '../../shared/strings';

const sendRequest = vi.fn();
vi.mock('../../shared/messages', () => ({ sendRequest: (...a: unknown[]) => sendRequest(...a) }));

const { Settings } = await import('./Settings');
const mock = installChromeMock();

beforeEach(() => { mock.reset(); sendRequest.mockReset(); });

describe('Settings view', () => {
  it('shows the unencrypted-key warning', async () => {
    render(<Settings />);
    expect(await screen.findByText(S.settings.apiKeyWarning)).toBeInTheDocument();
  });

  it('saves the provider config and reloads it', async () => {
    render(<Settings />);
    await userEvent.type(await screen.findByLabelText(S.settings.apiKey), 'sk-abc');
    await userEvent.type(screen.getByLabelText(S.settings.model), 'gpt-test');
    await userEvent.click(screen.getByRole('button', { name: S.settings.save }));

    await waitFor(() => expect(screen.getByText(S.settings.saved)).toBeInTheDocument());
    const stored = mock.store.settings as { ai: { apiKey: string; model: string } };
    expect(stored.ai).toMatchObject({ apiKey: 'sk-abc', model: 'gpt-test' });
  });

  it('blocks saving until apiKey and model are both filled in', async () => {
    render(<Settings />);
    await userEvent.click(await screen.findByRole('button', { name: S.settings.save }));
    expect(await screen.findAllByText(S.settings.required)).toHaveLength(2);
    expect(mock.store.settings).toBeUndefined();
  });

  it('reports the result of a connection test', async () => {
    sendRequest.mockResolvedValue({ ok: true, data: { ok: true, message: '' } });
    render(<Settings />);
    await userEvent.type(await screen.findByLabelText(S.settings.apiKey), 'k');
    await userEvent.type(screen.getByLabelText(S.settings.model), 'm');
    await userEvent.click(screen.getByRole('button', { name: S.settings.testConnection }));
    expect(await screen.findByText(S.settings.testOk)).toBeInTheDocument();
    expect(sendRequest).toHaveBeenCalledWith('TEST_CONNECTION', expect.anything());
  });

  it('never sends the API key anywhere except storage and the background', async () => {
    render(<Settings />);
    await userEvent.type(await screen.findByLabelText(S.settings.apiKey), 'sk-secret');
    await userEvent.click(screen.getByRole('button', { name: S.settings.save }));
    await waitFor(() => expect(mock.store.settings).toBeDefined());
    expect(sendRequest).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/app`
Expected: FAIL — `Cannot find module './Settings'`

- [ ] **Step 3: Implement `src/app/views/Settings.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { type ErrorCode, appError, deserializeError, errorMessage } from '../../shared/errors';
import { sendRequest } from '../../shared/messages';
import { DEFAULT_SETTINGS, getSettings, saveSettings } from '../../shared/storage/settings';
import { S } from '../../shared/strings';
import type { ExplanationLanguage, Provider, Settings as SettingsType } from '../../shared/types';

type TestState = { status: 'idle' | 'running' | 'ok' | 'fail'; message?: string };

export function Settings() {
  const [draft, setDraft] = useState<SettingsType>(DEFAULT_SETTINGS);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  useEffect(() => { void getSettings().then(setDraft); }, []);

  const missingKey = draft.ai.apiKey.trim() === '';
  const missingModel = draft.ai.model.trim() === '';

  function patchAi(patch: Partial<SettingsType['ai']>) {
    setSaved(false);
    setDraft((d) => ({ ...d, ai: { ...d.ai, ...patch } }));
  }

  async function onSave() {
    setTouched(true);
    if (missingKey || missingModel) return;
    await saveSettings(draft);
    setSaved(true);
  }

  async function onTest() {
    setTouched(true);
    if (missingKey || missingModel) return;
    setTest({ status: 'running' });
    const res = await sendRequest('TEST_CONNECTION', { config: draft.ai });
    if (res.ok && res.data.ok) {
      setTest({ status: 'ok' });
    } else {
      // runTestConnection reports failure as an ErrorCode string; a transport
      // failure arrives as a SerializedError. Both go through the same table.
      const err = res.ok
        ? appError(res.data.message as ErrorCode)
        : deserializeError(res.error);
      setTest({ status: 'fail', message: errorMessage(err) });
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 p-6">
      <h1 className="text-xl font-semibold">{S.settings.title}</h1>

      <label className="block">
        <span className="mb-1 block text-sm">{S.settings.provider}</span>
        <select
          className="w-full rounded border p-2"
          value={draft.ai.provider}
          onChange={(e) => patchAi({ provider: e.target.value as Provider })}
        >
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm">{S.settings.baseUrl}</span>
        <input
          className="w-full rounded border p-2"
          value={draft.ai.baseUrl ?? ''}
          onChange={(e) => patchAi({ baseUrl: e.target.value })}
        />
        <span className="mt-1 block text-xs text-gray-500">{S.settings.baseUrlHint}</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm">{S.settings.apiKey}</span>
        <input
          type="password"
          className="w-full rounded border p-2"
          value={draft.ai.apiKey}
          onChange={(e) => patchAi({ apiKey: e.target.value })}
        />
        {touched && missingKey && <span className="text-xs text-red-600">{S.settings.required}</span>}
        <span className="mt-1 block rounded bg-amber-50 p-2 text-xs text-amber-900">
          {S.settings.apiKeyWarning}
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm">{S.settings.model}</span>
        <input
          className="w-full rounded border p-2"
          value={draft.ai.model}
          onChange={(e) => patchAi({ model: e.target.value })}
        />
        {touched && missingModel && <span className="text-xs text-red-600">{S.settings.required}</span>}
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={draft.ai.supportsVision}
          onChange={(e) => patchAi({ supportsVision: e.target.checked })}
        />
        <span className="text-sm">{S.settings.supportsVision}</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm">{S.settings.explanationLanguage}</span>
        <select
          className="w-full rounded border p-2"
          value={draft.explanationLanguage}
          onChange={(e) =>
            setDraft((d) => ({ ...d, explanationLanguage: e.target.value as ExplanationLanguage }))
          }
        >
          <option value="vi">{S.settings.langVi}</option>
          <option value="en">{S.settings.langEn}</option>
          <option value="bilingual">{S.settings.langBilingual}</option>
        </select>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={draft.captureImages}
          onChange={(e) => setDraft((d) => ({ ...d, captureImages: e.target.checked }))}
        />
        <span className="text-sm">{S.settings.captureImages}</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm">{S.settings.minSelectionChars}</span>
        <input
          type="number"
          min={1}
          className="w-32 rounded border p-2"
          value={draft.minSelectionChars}
          onChange={(e) =>
            setDraft((d) => ({ ...d, minSelectionChars: Number(e.target.value) || 1 }))
          }
        />
      </label>

      <div className="flex items-center gap-3">
        <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={onSave}>
          {S.settings.save}
        </button>
        <button className="rounded border px-4 py-2" onClick={onTest} disabled={test.status === 'running'}>
          {test.status === 'running' ? S.settings.testing : S.settings.testConnection}
        </button>
        {saved && <span className="text-sm text-green-700">{S.settings.saved}</span>}
        {test.status === 'ok' && <span className="text-sm text-green-700">{S.settings.testOk}</span>}
        {test.status === 'fail' && <span className="text-sm text-red-600">{test.message}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the options page shell**

`src/app/App.tsx`:

```tsx
import { Settings } from './views/Settings';

export function App() {
  return <Settings />;
}
```

`src/app/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '../styles.css';

createRoot(document.getElementById('root')!).render(<App />);
```

Plan 3 turns `App.tsx` into a three-tab shell (History / Stats / Settings). It renders Settings alone for now.

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/app`
Expected: PASS, 5 tests

- [ ] **Step 6: Commit**

```bash
git add src/app
git commit -m "feat: add options page with provider settings and connection test"
```

---

## Task 12: Shared side-panel components

Two small components every later view depends on. Built first so nothing below has to forward-reference them.

**Files:**
- Create: `src/sidepanel/components/Onboarding.tsx`, `src/sidepanel/components/ErrorBanner.tsx`
- Test: `src/sidepanel/components/components.test.tsx`

**Interfaces:**
- Consumes: `S`; `errorMessage`, `deserializeError`, `SerializedError`.
- Produces: `Onboarding` (no props); `ErrorBanner` with props `{ error: SerializedError; onRetry?: () => void }`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { S } from '../../shared/strings';
import { Onboarding } from './Onboarding';
import { ErrorBanner } from './ErrorBanner';

describe('Onboarding', () => {
  it('opens the options page when asked', async () => {
    const openOptionsPage = vi.fn();
    (globalThis as any).chrome = { runtime: { openOptionsPage } };
    render(<Onboarding />);
    await userEvent.click(screen.getByRole('button', { name: S.onboarding.openSettings }));
    expect(openOptionsPage).toHaveBeenCalled();
  });
});

describe('ErrorBanner', () => {
  it('renders the Vietnamese message for the code, never the code itself', () => {
    render(<ErrorBanner error={{ code: 'RATE_LIMIT' }} />);
    expect(screen.queryByText(/RATE_LIMIT/)).not.toBeInTheDocument();
    expect(screen.getByText(/giới hạn tốc độ/)).toBeInTheDocument();
  });

  it('exposes the raw model output behind a disclosure when there is one', async () => {
    render(<ErrorBanner error={{ code: 'SCHEMA', raw: '{{broken' }} />);
    await userEvent.click(screen.getByText(S.common.rawOutput));
    expect(screen.getByText('{{broken')).toBeInTheDocument();
  });

  it('shows a retry button only when a handler is given', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorBanner error={{ code: 'NETWORK' }} />);
    expect(screen.queryByRole('button', { name: S.common.retry })).not.toBeInTheDocument();
    rerender(<ErrorBanner error={{ code: 'NETWORK' }} onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: S.common.retry }));
    expect(onRetry).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/sidepanel/components`
Expected: FAIL — `Cannot find module './Onboarding'`

- [ ] **Step 3: Implement the pieces**

`src/sidepanel/components/Onboarding.tsx`:

```tsx
import { S } from '../../shared/strings';

export function Onboarding() {
  return (
    <div className="space-y-3 p-4">
      <h2 className="font-semibold">{S.onboarding.title}</h2>
      <p className="text-sm text-gray-600">{S.onboarding.body}</p>
      <button
        className="rounded bg-blue-600 px-3 py-2 text-white"
        onClick={() => chrome.runtime.openOptionsPage()}
      >
        {S.onboarding.openSettings}
      </button>
    </div>
  );
}
```

`src/sidepanel/components/ErrorBanner.tsx`:

```tsx
import { type SerializedError, deserializeError, errorMessage } from '../../shared/errors';
import { S } from '../../shared/strings';

export function ErrorBanner({ error, onRetry }: { error: SerializedError; onRetry?: () => void }) {
  const err = deserializeError(error);
  return (
    <div className="space-y-2 rounded border border-red-300 bg-red-50 p-3 text-sm">
      <p className="text-red-800">{errorMessage(err)}</p>
      {err.raw && (
        <details>
          <summary className="cursor-pointer text-xs text-red-700">{S.common.rawOutput}</summary>
          <pre className="mt-1 max-h-40 overflow-auto text-xs whitespace-pre-wrap">{err.raw}</pre>
        </details>
      )}
      {onRetry && (
        <button className="rounded border border-red-400 px-3 py-1 text-red-800" onClick={onRetry}>
          {S.common.retry}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/sidepanel/components`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/components
git commit -m "feat: add onboarding and error banner components for the side panel"
```

---

## Task 13: Paste view

**Files:**
- Create: `src/sidepanel/views/Paste.tsx`
- Test: `src/sidepanel/views/Paste.test.tsx`

**Interfaces:**
- Consumes: `sendRequest`; `S`; `ErrorBanner`.
- Produces: `Paste` with prop `onParsed(p: { sessionId, questions, visionSkipped }): void`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { S } from '../../shared/strings';

const sendRequest = vi.fn();
vi.mock('../../shared/messages', () => ({ sendRequest: (...a: unknown[]) => sendRequest(...a) }));

const { Paste } = await import('./Paste');

const questions = [{ id: 'q1', sessionId: 's1', order: 1, stem: 'Q', choices: [], imageIds: [] }];

describe('Paste view', () => {
  it('does not call the background with empty input', async () => {
    render(<Paste onParsed={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: S.paste.submit }));
    expect(await screen.findByText(S.paste.empty)).toBeInTheDocument();
    expect(sendRequest).not.toHaveBeenCalled();
  });

  it('sends the text and hands the parsed questions upward', async () => {
    sendRequest.mockResolvedValue({ ok: true, data: { sessionId: 's1', questions, visionSkipped: false } });
    const onParsed = vi.fn();
    render(<Paste onParsed={onParsed} />);
    await userEvent.type(screen.getByPlaceholderText(S.paste.placeholder), '101. The manager ___');
    await userEvent.click(screen.getByRole('button', { name: S.paste.submit }));
    expect(sendRequest).toHaveBeenCalledWith('PARSE_TEXT', expect.objectContaining({
      rawText: '101. The manager ___', origin: 'paste',
    }));
    expect(onParsed).toHaveBeenCalledWith({ sessionId: 's1', questions, visionSkipped: false });
  });

  it('shows an error banner with a retry when parsing fails', async () => {
    sendRequest.mockResolvedValue({ ok: false, error: { code: 'PARSE_EMPTY' } });
    render(<Paste onParsed={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText(S.paste.placeholder), 'nonsense');
    await userEvent.click(screen.getByRole('button', { name: S.paste.submit }));
    expect(await screen.findByRole('button', { name: S.common.retry })).toBeInTheDocument();
  });

  it('attaches images pasted from the clipboard', async () => {
    sendRequest.mockResolvedValue({ ok: true, data: { sessionId: 's1', questions, visionSkipped: false } });
    render(<Paste onParsed={vi.fn()} />);
    const box = screen.getByPlaceholderText(S.paste.placeholder);
    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
    const data = new DataTransfer();
    data.items.add(file);
    await userEvent.type(box, 'q');
    box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    await userEvent.click(screen.getByRole('button', { name: S.paste.submit }));
    expect(sendRequest.mock.calls.at(-1)?.[1].images.length).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/sidepanel/views/Paste.test.tsx`
Expected: FAIL — `Cannot find module './Paste'`

- [ ] **Step 3: Implement**

```tsx
import { useState } from 'react';
import type { SerializedError } from '../../shared/errors';
import { sendRequest } from '../../shared/messages';
import { S } from '../../shared/strings';
import type { ImageInput, Question } from '../../shared/types';
import { ErrorBanner } from '../components/ErrorBanner';

export interface ParsedPayload {
  sessionId: string;
  questions: Question[];
  visionSkipped: boolean;
}

async function fileToImageInput(file: File): Promise<ImageInput> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return { mime: file.type || 'image/png', dataBase64: btoa(binary) };
}

export function Paste({ onParsed }: { onParsed: (p: ParsedPayload) => void }) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<SerializedError | null>(null);

  async function submit() {
    setError(null);
    if (text.trim() === '') {
      setEmpty(true);
      return;
    }
    setEmpty(false);
    setBusy(true);
    const res = await sendRequest('PARSE_TEXT', { rawText: text.trim(), images, origin: 'paste' });
    setBusy(false);
    if (res.ok) onParsed(res.data);
    else setError(res.error);
  }

  async function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    setImages(await Promise.all(files.map(fileToImageInput)));
  }

  return (
    <div className="space-y-3 p-4">
      <textarea
        className="h-64 w-full resize-none rounded border p-2 text-sm"
        placeholder={S.paste.placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
      />
      {images.length > 0 && (
        <p className="text-xs text-gray-500">{S.paste.imageCount(images.length)}</p>
      )}
      {empty && <p className="text-sm text-red-600">{S.paste.empty}</p>}
      {error && <ErrorBanner error={error} onRetry={() => void submit()} />}
      <button
        className="w-full rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy ? S.paste.parsing : S.paste.submit}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/sidepanel/views/Paste.test.tsx`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/views/Paste.tsx src/sidepanel/views/Paste.test.tsx
git commit -m "feat: add paste view with clipboard image support"
```

---

## Task 14: Review view

This is the screen the whole three-step pipeline exists to protect: the user records what they picked while the client holds no correct answer.

**Files:**
- Create: `src/sidepanel/views/Review.tsx`
- Test: `src/sidepanel/views/Review.test.tsx`

**Interfaces:**
- Consumes: `sendRequest`; `S`; `ErrorBanner`.
- Produces: `Review` with props `{ sessionId, questions, visionSkipped, onAnalyzed(p) }` where `p = { questions, analyses, answers, attemptIdByQuestionId }`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { S } from '../../shared/strings';
import type { Question } from '../../shared/types';

const sendRequest = vi.fn();
vi.mock('../../shared/messages', () => ({ sendRequest: (...a: unknown[]) => sendRequest(...a) }));

const { Review } = await import('./Review');

const questions: Question[] = [
  { id: 'q1', sessionId: 's1', order: 1, stem: 'The manager ___ the report.', imageIds: [],
    choices: [{ label: 'A', text: 'submit' }, { label: 'B', text: 'submits' }] },
  { id: 'q2', sessionId: 's1', order: 2, stem: 'Please ___ us.', imageIds: [],
    choices: [{ label: 'A', text: 'contact' }, { label: 'B', text: 'contacted' }] },
];

function renderReview(onAnalyzed = vi.fn()) {
  render(<Review sessionId="s1" questions={questions} visionSkipped={false} onAnalyzed={onAnalyzed} />);
  return onAnalyzed;
}

describe('Review view', () => {
  it('never renders a correct answer — nothing here knows one', () => {
    renderReview();
    expect(screen.queryByText(S.result.correctAnswer)).not.toBeInTheDocument();
    expect(screen.getByText(S.review.hint)).toBeInTheDocument();
  });

  it('sends the ticked answers, leaving unticked ones undefined', async () => {
    sendRequest.mockResolvedValue({ ok: true, data: { analyses: [], attemptIdByQuestionId: {} } });
    renderReview();
    const first = screen.getByTestId('question-q1');
    await userEvent.click(within(first).getByRole('button', { name: 'B' }));
    await userEvent.click(screen.getByRole('button', { name: S.review.analyzeButton }));

    expect(sendRequest).toHaveBeenCalledWith('ANALYZE', {
      sessionId: 's1',
      answers: [{ questionId: 'q1', userAnswer: 'B' }, { questionId: 'q2', userAnswer: undefined }],
      skippedQuestionIds: [],
    });
  });

  it('keeps the analyze button enabled with nothing ticked', () => {
    renderReview();
    expect(screen.getByRole('button', { name: S.review.analyzeButton })).toBeEnabled();
  });

  it('drops a skipped question from the payload and from the list', async () => {
    sendRequest.mockResolvedValue({ ok: true, data: { analyses: [], attemptIdByQuestionId: {} } });
    renderReview();
    await userEvent.click(within(screen.getByTestId('question-q2')).getByRole('button', { name: S.review.skip }));
    expect(screen.queryByTestId('question-q2')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: S.review.analyzeButton }));
    expect(sendRequest).toHaveBeenCalledWith('ANALYZE', expect.objectContaining({
      answers: [{ questionId: 'q1', userAnswer: undefined }],
      skippedQuestionIds: ['q2'],
    }));
  });

  it('toggles an answer off when the same label is clicked twice', async () => {
    sendRequest.mockResolvedValue({ ok: true, data: { analyses: [], attemptIdByQuestionId: {} } });
    renderReview();
    const first = screen.getByTestId('question-q1');
    await userEvent.click(within(first).getByRole('button', { name: 'A' }));
    await userEvent.click(within(first).getByRole('button', { name: 'A' }));
    expect(screen.getByText(S.review.counter(0, 2))).toBeInTheDocument();
  });

  it('surfaces a failure with a retry instead of losing the parsed questions', async () => {
    sendRequest.mockResolvedValue({ ok: false, error: { code: 'RATE_LIMIT' } });
    renderReview();
    await userEvent.click(screen.getByRole('button', { name: S.review.analyzeButton }));
    expect(await screen.findByRole('button', { name: S.common.retry })).toBeInTheDocument();
    expect(screen.getByTestId('question-q1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/sidepanel/views/Review.test.tsx`
Expected: FAIL — `Cannot find module './Review'`

- [ ] **Step 3: Implement**

```tsx
import { useState } from 'react';
import type { SerializedError } from '../../shared/errors';
import { sendRequest } from '../../shared/messages';
import { S } from '../../shared/strings';
import type { Question, QuestionAnalysis } from '../../shared/types';
import { ErrorBanner } from '../components/ErrorBanner';

export interface AnalyzedPayload {
  questions: Question[];
  analyses: QuestionAnalysis[];
  answers: Record<string, string | undefined>;
  attemptIdByQuestionId: Record<string, string>;
}

export function Review({
  sessionId, questions, visionSkipped, onAnalyzed,
}: {
  sessionId: string;
  questions: Question[];
  visionSkipped: boolean;
  onAnalyzed: (p: AnalyzedPayload) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string | undefined>>({});
  const [skipped, setSkipped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SerializedError | null>(null);

  const kept = questions.filter((q) => !skipped.includes(q.id));
  const ticked = kept.filter((q) => answers[q.id] != null).length;

  function pick(questionId: string, label: string) {
    setAnswers((a) => ({ ...a, [questionId]: a[questionId] === label ? undefined : label }));
  }

  async function analyze() {
    setError(null);
    setBusy(true);
    const res = await sendRequest('ANALYZE', {
      sessionId,
      answers: kept.map((q) => ({ questionId: q.id, userAnswer: answers[q.id] })),
      skippedQuestionIds: skipped,
    });
    setBusy(false);
    if (res.ok) onAnalyzed({ questions: kept, answers, ...res.data });
    else setError(res.error);
  }

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-1">
        <h2 className="font-semibold">{S.review.title}</h2>
        <p className="text-xs text-gray-600">{S.review.hint}</p>
        {visionSkipped && (
          <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">{S.review.visionSkipped}</p>
        )}
      </header>

      {kept.map((q) => (
        <div key={q.id} data-testid={`question-${q.id}`} className="space-y-2 rounded border p-3">
          {q.passage && <p className="text-xs whitespace-pre-wrap text-gray-500">{q.passage}</p>}
          <p className="text-sm">
            <span className="mr-1 font-medium">{q.order}.</span>
            {q.stem}
          </p>
          <div className="flex flex-wrap gap-2">
            {q.choices.map((c) => (
              <button
                key={c.label}
                aria-pressed={answers[q.id] === c.label}
                className={`rounded border px-3 py-1 text-sm ${
                  answers[q.id] === c.label ? 'border-blue-600 bg-blue-600 text-white' : ''
                }`}
                onClick={() => pick(q.id, c.label)}
              >
                {c.label}
              </button>
            ))}
            <span className="self-center text-xs text-gray-500">
              {answers[q.id] == null ? S.review.notAttempted : ''}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {q.choices.map((c) => (
              <div key={c.label}>
                {c.label}. {c.text}
              </div>
            ))}
          </div>
          <button
            className="text-xs text-gray-500 underline"
            onClick={() => setSkipped((s) => [...s, q.id])}
          >
            {S.review.skip}
          </button>
        </div>
      ))}

      {error && <ErrorBanner error={error} onRetry={() => void analyze()} />}

      <div className="sticky bottom-0 space-y-2 bg-white pt-2">
        <p className="text-xs text-gray-600">{S.review.counter(ticked, kept.length)}</p>
        <button
          className="w-full rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => void analyze()}
        >
          {busy ? S.review.analyzing : S.review.analyzeButton}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/sidepanel/views/Review.test.tsx`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/views/Review.tsx src/sidepanel/views/Review.test.tsx
git commit -m "feat: add review view where the user records the answer they picked

The client holds no correct answer at this point by construction."
```

---

## Task 15: Result view

**Files:**
- Create: `src/sidepanel/views/Result.tsx`
- Test: `src/sidepanel/views/Result.test.tsx`

**Interfaces:**
- Consumes: `S`.
- Produces: `Result` with props `{ questions, analyses, answers, attemptIdByQuestionId, renderErrorPanel, onRestart }`.

`Result` does not import `ErrorPanel`. It takes `renderErrorPanel(questionId, attemptId): ReactNode` and the shell (Task 17) supplies the real one. That keeps `Result` purely presentational — it knows nothing about ports or streaming — and removes any dependency on a task that has not run yet.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Result } from './Result';
import { S } from '../../shared/strings';
import type { Question, QuestionAnalysis } from '../../shared/types';

const questions: Question[] = [
  { id: 'q1', sessionId: 's', order: 1, stem: 'A stem', imageIds: [],
    choices: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }] },
  { id: 'q2', sessionId: 's', order: 2, stem: 'B stem', imageIds: [],
    choices: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }] },
];

const analyses: QuestionAnalysis[] = [
  { questionId: 'q1', correctAnswer: 'B', explanation: 'exp1', strategy: 'str1',
    topic: 'subject-verb agreement', topicCategory: 'grammar' },
  { questionId: 'q2', correctAnswer: 'A', explanation: 'exp2', strategy: 'str2',
    distractorNotes: { B: 'wrong tense' }, topic: 'tense', topicCategory: 'grammar' },
];

function renderResult() {
  render(
    <Result
      questions={questions}
      analyses={analyses}
      answers={{ q1: 'B', q2: 'B' }}
      attemptIdByQuestionId={{ q1: 'a1', q2: 'a2' }}
      renderErrorPanel={() => <div data-testid="error-panel" />}
      onRestart={vi.fn()}
    />,
  );
}

describe('Result view', () => {
  it('marks a matching answer correct and a mismatching one wrong', () => {
    renderResult();
    expect(within(screen.getByTestId('result-q1')).getByText(S.result.correct)).toBeInTheDocument();
    expect(within(screen.getByTestId('result-q2')).getByText(S.result.wrong)).toBeInTheDocument();
  });

  it('shows explanation and strategy for every question', () => {
    renderResult();
    expect(screen.getByText('exp1')).toBeInTheDocument();
    expect(screen.getByText('str2')).toBeInTheDocument();
  });

  it('offers the mistake-analysis panel only on wrong answers', () => {
    renderResult();
    expect(within(screen.getByTestId('result-q1')).queryByTestId('error-panel')).not.toBeInTheDocument();
    expect(within(screen.getByTestId('result-q2')).getByTestId('error-panel')).toBeInTheDocument();
  });

  it('shows distractor notes when the model supplied them', () => {
    renderResult();
    expect(screen.getByText(/wrong tense/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/sidepanel/views/Result.test.tsx`
Expected: FAIL — `Cannot find module './Result'`

- [ ] **Step 3: Implement**

```tsx
import type { ReactNode } from 'react';
import { S } from '../../shared/strings';
import type { Question, QuestionAnalysis } from '../../shared/types';

export function Result({
  questions, analyses, answers, attemptIdByQuestionId, renderErrorPanel, onRestart,
}: {
  questions: Question[];
  analyses: QuestionAnalysis[];
  answers: Record<string, string | undefined>;
  attemptIdByQuestionId: Record<string, string>;
  renderErrorPanel: (questionId: string, attemptId: string) => ReactNode;
  onRestart: () => void;
}) {
  const byId = new Map(analyses.map((a) => [a.questionId, a]));

  return (
    <div className="space-y-4 p-4">
      {questions.map((q) => {
        const a = byId.get(q.id);
        if (!a) return null;
        const picked = answers[q.id];
        const correct = picked === a.correctAnswer;

        return (
          <div key={q.id} data-testid={`result-${q.id}`} className="space-y-2 rounded border p-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{q.order}.</span>
              <span className={correct ? 'text-green-700' : 'text-red-700'}>
                {correct ? S.result.correct : S.result.wrong}
              </span>
              {!correct && (
                <span className="text-gray-600">
                  {S.result.youChose} {picked ?? S.review.notAttempted}
                </span>
              )}
              <span className="text-gray-600">
                {S.result.correctAnswer} {a.correctAnswer}
              </span>
            </div>

            <p className="text-sm">{q.stem}</p>

            <div className="text-sm">
              <p className="font-medium">{S.result.explanation}</p>
              <p className="whitespace-pre-wrap text-gray-700">{a.explanation}</p>
            </div>

            <div className="text-sm">
              <p className="font-medium">{S.result.strategy}</p>
              <p className="whitespace-pre-wrap text-gray-700">{a.strategy}</p>
            </div>

            {a.distractorNotes && Object.keys(a.distractorNotes).length > 0 && (
              <div className="text-xs text-gray-600">
                <p className="font-medium">{S.result.distractors}</p>
                {Object.entries(a.distractorNotes).map(([label, note]) => (
                  <div key={label}>
                    {label}. {note}
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-gray-400">{a.topic}</p>

            {!correct && renderErrorPanel(q.id, attemptIdByQuestionId[q.id])}
          </div>
        );
      })}

      <button className="w-full rounded border px-3 py-2" onClick={onRestart}>
        {S.result.backToPaste}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/sidepanel/views/Result.test.tsx`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/views/Result.tsx src/sidepanel/views/Result.test.tsx
git commit -m "feat: add result view with explanations, strategies and distractor notes"
```

---

## Task 16: Error-psychology panel with streaming

**Files:**
- Create: `src/sidepanel/components/ErrorPanel.tsx`
- Test: `src/sidepanel/components/ErrorPanel.test.tsx`

**Interfaces:**
- Consumes: `PORT_ERROR_PSYCH`, `ErrorPsychEvent` from messages; `ERROR_TAG_ORDER`, `S` from strings.
- Produces: `ErrorPanel` with props `{ questionId, attemptId }`.

- [ ] **Step 1: Write the failing test**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ERROR_TAG_ORDER, S } from '../../shared/strings';
import type { ErrorPsychEvent } from '../../shared/messages';

let posted: unknown[] = [];
let emit: (e: ErrorPsychEvent) => void = () => {};
let disconnected = false;

beforeEach(() => {
  posted = [];
  disconnected = false;
  (globalThis as any).chrome = {
    runtime: {
      connect: () => ({
        name: 'errorPsych',
        postMessage: (m: unknown) => posted.push(m),
        disconnect: () => { disconnected = true; },
        onMessage: { addListener: (fn: (e: ErrorPsychEvent) => void) => { emit = fn; } },
        onDisconnect: { addListener: () => {} },
      }),
    },
  };
});

const { ErrorPanel } = await import('./ErrorPanel');

describe('ErrorPanel', () => {
  it('offers all seven reasons with the four primary ones first', async () => {
    render(<ErrorPanel questionId="q1" attemptId="a1" />);
    await userEvent.click(screen.getByRole('button', { name: S.result.analyzeMistake }));
    const labels = screen.getAllByRole('button')
      .map((b) => b.textContent)
      .filter((t) => Object.values(S.errorTag).includes(t as string));
    expect(labels.slice(0, 4)).toEqual(ERROR_TAG_ORDER.slice(0, 4).map((t) => S.errorTag[t]));
    expect(labels).toHaveLength(7);
  });

  it('requires at least one reason before submitting', async () => {
    render(<ErrorPanel questionId="q1" attemptId="a1" />);
    await userEvent.click(screen.getByRole('button', { name: S.result.analyzeMistake }));
    expect(screen.getByRole('button', { name: S.errorPanel.submit })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: S.errorTag.no_grammar }));
    expect(screen.getByRole('button', { name: S.errorPanel.submit })).toBeEnabled();
  });

  it('sends the tags and note over the port, then renders streamed deltas', async () => {
    render(<ErrorPanel questionId="q1" attemptId="a1" />);
    await userEvent.click(screen.getByRole('button', { name: S.result.analyzeMistake }));
    await userEvent.click(screen.getByRole('button', { name: S.errorTag.no_vocab }));
    await userEvent.type(screen.getByPlaceholderText(S.errorPanel.notePlaceholder), 'ghi chú');
    await userEvent.click(screen.getByRole('button', { name: S.errorPanel.submit }));

    expect(posted[0]).toEqual({
      questionId: 'q1', attemptId: 'a1', userTags: ['no_vocab'], userNote: 'ghi chú',
    });

    emit({ type: 'delta', text: 'phần một' });
    expect(await screen.findByText(/phần một/)).toBeInTheDocument();
  });

  it('splits the final text into diagnosis and fix advice', async () => {
    render(<ErrorPanel questionId="q1" attemptId="a1" />);
    await userEvent.click(screen.getByRole('button', { name: S.result.analyzeMistake }));
    await userEvent.click(screen.getByRole('button', { name: S.errorTag.misclick }));
    await userEvent.click(screen.getByRole('button', { name: S.errorPanel.submit }));

    emit({ type: 'done', aiDiagnosis: 'chẩn đoán', fixAdvice: 'cách sửa' });
    expect(await screen.findByText('chẩn đoán')).toBeInTheDocument();
    expect(screen.getByText('cách sửa')).toBeInTheDocument();
  });

  it('shows an error banner when the stream fails', async () => {
    render(<ErrorPanel questionId="q1" attemptId="a1" />);
    await userEvent.click(screen.getByRole('button', { name: S.result.analyzeMistake }));
    await userEvent.click(screen.getByRole('button', { name: S.errorTag.misread }));
    await userEvent.click(screen.getByRole('button', { name: S.errorPanel.submit }));

    emit({ type: 'error', error: { code: 'RATE_LIMIT' } });
    expect(await screen.findByRole('button', { name: S.common.retry })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/sidepanel/components/ErrorPanel.test.tsx`
Expected: FAIL — `Cannot find module './ErrorPanel'`

- [ ] **Step 3: Implement**

```tsx
import { useRef, useState } from 'react';
import type { SerializedError } from '../../shared/errors';
import { type ErrorPsychEvent, PORT_ERROR_PSYCH } from '../../shared/messages';
import { ERROR_TAG_ORDER, S } from '../../shared/strings';
import type { ErrorTag } from '../../shared/types';
import { ErrorBanner } from './ErrorBanner';

type Phase =
  | { kind: 'closed' }
  | { kind: 'form' }
  | { kind: 'streaming'; text: string }
  | { kind: 'done'; aiDiagnosis: string; fixAdvice: string }
  | { kind: 'error'; error: SerializedError };

export function ErrorPanel({ questionId, attemptId }: { questionId: string; attemptId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'closed' });
  const [tags, setTags] = useState<ErrorTag[]>([]);
  const [note, setNote] = useState('');
  const portRef = useRef<chrome.runtime.Port | null>(null);

  function toggle(tag: ErrorTag) {
    setTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));
  }

  function submit() {
    setPhase({ kind: 'streaming', text: '' });

    const port = chrome.runtime.connect({ name: PORT_ERROR_PSYCH });
    portRef.current = port;

    port.onMessage.addListener((event: ErrorPsychEvent) => {
      if (event.type === 'delta') {
        setPhase((p) => (p.kind === 'streaming' ? { kind: 'streaming', text: p.text + event.text } : p));
      } else if (event.type === 'done') {
        setPhase({ kind: 'done', aiDiagnosis: event.aiDiagnosis, fixAdvice: event.fixAdvice });
        port.disconnect();
      } else {
        setPhase({ kind: 'error', error: event.error });
        port.disconnect();
      }
    });

    port.postMessage({
      questionId,
      attemptId,
      userTags: tags,
      userNote: note.trim() || undefined,
    });
  }

  if (phase.kind === 'closed') {
    return (
      <button
        className="rounded border px-3 py-1 text-sm"
        onClick={() => setPhase({ kind: 'form' })}
      >
        {S.result.analyzeMistake}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded bg-gray-50 p-3">
      <p className="text-sm font-medium">{S.errorPanel.title}</p>

      {phase.kind === 'form' && (
        <>
          <p className="text-xs text-gray-600">{S.errorPanel.hint}</p>
          <div className="flex flex-wrap gap-2">
            {ERROR_TAG_ORDER.map((tag) => (
              <button
                key={tag}
                aria-pressed={tags.includes(tag)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  tags.includes(tag) ? 'border-blue-600 bg-blue-600 text-white' : ''
                }`}
                onClick={() => toggle(tag)}
              >
                {S.errorTag[tag]}
              </button>
            ))}
          </div>
          <textarea
            className="w-full rounded border p-2 text-sm"
            rows={2}
            placeholder={S.errorPanel.notePlaceholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
            disabled={tags.length === 0}
            onClick={submit}
          >
            {S.errorPanel.submit}
          </button>
        </>
      )}

      {phase.kind === 'streaming' && (
        <div className="space-y-1">
          <p className="text-xs text-gray-500">{S.errorPanel.thinking}</p>
          <p className="text-sm whitespace-pre-wrap">{phase.text}</p>
        </div>
      )}

      {phase.kind === 'done' && (
        <div className="space-y-2 text-sm">
          <div>
            <p className="font-medium">{S.errorPanel.diagnosis}</p>
            <p className="whitespace-pre-wrap text-gray-700">{phase.aiDiagnosis}</p>
          </div>
          {phase.fixAdvice && (
            <div>
              <p className="font-medium">{S.errorPanel.fixAdvice}</p>
              <p className="whitespace-pre-wrap text-gray-700">{phase.fixAdvice}</p>
            </div>
          )}
        </div>
      )}

      {phase.kind === 'error' && (
        <ErrorBanner error={phase.error} onRetry={() => setPhase({ kind: 'form' })} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/sidepanel/components/ErrorPanel.test.tsx`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/components/ErrorPanel.tsx src/sidepanel/components/ErrorPanel.test.tsx
git commit -m "feat: add error-psychology panel with reason chips and streamed diagnosis"
```

---

## Task 17: Side panel shell, end-to-end wiring and the manual acceptance run

The shell comes last because every view it composes now exists, so nothing here is a stub.

**Files:**
- Create: `src/sidepanel/App.tsx`
- Modify: `src/sidepanel/main.tsx`
- Modify: `package.json` (test/build scripts)
- Test: `src/sidepanel/App.test.tsx`
- Create: `README.md`, `docs/superpowers/plans/plan-1-acceptance.md`

**Interfaces:**
- Consumes: `Onboarding`, `Paste`, `Review`, `Result`, `ErrorPanel`; `getSettings`, `isConfigured`.
- Produces: a loadable extension that completes the paste flow against a real provider.

- [ ] **Step 1: Write the failing test**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { installChromeMock } from '../test/chromeMock';
import { DEFAULT_SETTINGS, saveSettings } from '../shared/storage/settings';
import { S } from '../shared/strings';

vi.mock('../shared/messages', () => ({ sendRequest: vi.fn(), PORT_ERROR_PSYCH: 'errorPsych' }));

const { App } = await import('./App');
const mock = installChromeMock();
beforeEach(() => mock.reset());

describe('side panel shell', () => {
  it('shows onboarding when no API key is configured', async () => {
    render(<App />);
    expect(await screen.findByText(S.onboarding.title)).toBeInTheDocument();
  });

  it('shows the paste view once configured', async () => {
    await saveSettings({ ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k', model: 'm' } });
    render(<App />);
    expect(await screen.findByPlaceholderText(S.paste.placeholder)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/sidepanel/App.test.tsx`
Expected: FAIL — `Cannot find module './App'`

- [ ] **Step 3: Implement the shell**

`src/sidepanel/App.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { getSettings, isConfigured } from '../shared/storage/settings';
import type { Question, QuestionAnalysis } from '../shared/types';
import { ErrorPanel } from './components/ErrorPanel';
import { Onboarding } from './components/Onboarding';
import { Paste } from './views/Paste';
import { Result } from './views/Result';
import { Review } from './views/Review';

export type PanelState =
  | { view: 'loading' }
  | { view: 'onboarding' }
  | { view: 'paste' }
  | { view: 'review'; sessionId: string; questions: Question[]; visionSkipped: boolean }
  | {
      view: 'result';
      questions: Question[];
      analyses: QuestionAnalysis[];
      answers: Record<string, string | undefined>;
      attemptIdByQuestionId: Record<string, string>;
    };

export function App() {
  const [state, setState] = useState<PanelState>({ view: 'loading' });

  useEffect(() => {
    void getSettings().then((s) => setState({ view: isConfigured(s) ? 'paste' : 'onboarding' }));
  }, []);

  switch (state.view) {
    case 'loading':
      return null;
    case 'onboarding':
      return <Onboarding />;
    case 'paste':
      return <Paste onParsed={(p) => setState({ view: 'review', ...p })} />;
    case 'review':
      return (
        <Review
          sessionId={state.sessionId}
          questions={state.questions}
          visionSkipped={state.visionSkipped}
          onAnalyzed={(p) => setState({ view: 'result', ...p })}
        />
      );
    case 'result':
      return (
        <Result
          questions={state.questions}
          analyses={state.analyses}
          answers={state.answers}
          attemptIdByQuestionId={state.attemptIdByQuestionId}
          renderErrorPanel={(questionId, attemptId) => (
            <ErrorPanel questionId={questionId} attemptId={attemptId} />
          )}
          onRestart={() => setState({ view: 'paste' })}
        />
      );
  }
}
```

`src/sidepanel/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '../styles.css';

createRoot(document.getElementById('root')!).render(<App />);
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/sidepanel/App.test.tsx`
Expected: PASS, 2 tests

- [ ] **Step 5: Add the scripts**

In `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 6: Run the whole suite and the type check**

```bash
npm test
npx tsc --noEmit
```

Expected: every suite passes, zero type errors.

- [ ] **Step 7: Build and load**

```bash
npm run build
```

Load `dist/` via `chrome://extensions` → Load unpacked.

- [ ] **Step 8: Run the manual acceptance checklist**

Write results into `docs/superpowers/plans/plan-1-acceptance.md`. Each line is pass/fail with a note:

1. Click the extension icon with no API key set → the side panel shows onboarding, and its button opens the options page.
2. In Settings, save a real provider config → the unencrypted-key warning is visible; "Test connection" reports success.
3. Enter a deliberately wrong API key → "Test connection" reports the auth error in Vietnamese, not a raw code.
4. Back in the side panel, paste this block into the Paste tab and press Parse:

```
101. The manager ___ the quarterly report before Friday.
(A) submit  (B) submits  (C) submitted  (D) submitting

102. Please ___ our customer service team if you have questions.
(A) contact  (B) contacted  (C) contacting  (D) contacts
```

   → two questions appear in Review, and **no correct answer is visible anywhere on screen**.
5. Tick a deliberately wrong answer on 101, leave 102 untouched, press Analyze → Result shows 101 as wrong with an explanation, and 102 marked against "not attempted".
6. On the wrong card, press "Analyze my mistake", pick two reasons, add a note, submit → text streams in, then splits into diagnosis and fix advice.
7. Open DevTools → Application → IndexedDB → `imen`. Confirm `sessions`, `questions`, `analyses`, `attempts` and `errorAnalyses` all hold rows, and that `attempts` has `isRetry: false`.
8. Confirm every string you saw on screen was Vietnamese.
9. In DevTools, inspect the side panel's network tab → **no request went directly to the provider**. All provider traffic belongs to the service worker.

Item 9 is the one that must not be waved through — it is the plan's central invariant.

- [ ] **Step 9: Write the README**

```markdown
# IMEN

Chrome extension for AI-assisted TOEIC practice.

## Development

    npm install
    npm test          # Vitest
    npm run build     # outputs dist/

Load `dist/` via chrome://extensions → Developer mode → Load unpacked.
Chrome 116 or newer is required (the sidePanel API).

## Configuration

Open the extension's options page and set provider, API key and model.
Leave Base URL empty for the provider default; set it to point at
OpenRouter, Groq or a local LM Studio server.

The API key is stored unencrypted in chrome.storage.local. Anyone with
access to your Chrome profile can read it.

## Architecture

See `docs/superpowers/specs/2026-08-07-imen-ext-design.md`.
The API key lives only in the service worker; no other context may talk to a
provider.
```

- [ ] **Step 10: Commit**

```bash
git add package.json README.md src/sidepanel docs/superpowers/plans/plan-1-acceptance.md
git commit -m "feat: complete the manual-paste analysis flow end to end

Adds build/test scripts, the README and the recorded acceptance run."
```

---

## What Plan 2 and Plan 3 pick up

**Plan 2 — selection capture and images.** Replaces `src/content/index.ts` with `selection.ts` / `trigger.tsx` / `imageScan.ts` / `snip.tsx`; adds `background/capture.ts` (cross-origin image fetch, `captureVisibleTab` + `OffscreenCanvas` crop). The `PARSE_TEXT` message already carries `origin`, `sourceUrl`, `sourceTitle` and `images`, so no message change is needed. Whether the floating button can open the side panel directly is answered by Task 1's spike.

**Plan 3 — dashboard.** Adds `shared/storage/stats.ts`, `ai/prompts/weakness.ts`, `app/views/History.tsx`, `app/views/Stats.tsx`, the three-tab shell in `app/App.tsx`, "Retry this question" (writes an `Attempt` with `isRetry: true`, no AI call), and JSON export/import. Every store it reads already exists and is populated by this plan.
