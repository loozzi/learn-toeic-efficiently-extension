# IMEN — Chrome extension for AI-assisted TOEIC practice

**Date:** 2026-08-07
**Status:** Design approved, ready for implementation planning
**Implemented by:** Codex · **Reviewed by:** project owner

> **Language conventions.** This document, all code, comments and commit
> messages are in English to keep token cost down.
>
> The product itself is Vietnamese: **all UI strings ship in Vietnamese**, and
> the button labels written in English throughout this spec are descriptions,
> not the strings to implement. AI explanations follow the
> `explanationLanguage` setting, which defaults to Vietnamese.
>
> UI strings live in one `src/shared/strings.ts` module rather than being
> inlined across components — so the English-doc / Vietnamese-UI split has
> exactly one place where it can go wrong.

---

## 1. Goal

Help a TOEIC learner quickly understand why an answer is correct, why they picked the wrong one, and accumulate data revealing where they are weak.

Scope is deliberately narrow: **TOEIC multiple-choice questions, text and image**. Not a general English-learning platform.

### Success criteria

1. Select a block of questions on any practice site → explanations back in under 15 seconds.
2. The user records the answer they originally picked **before** seeing the correct one.
3. After ~50 questions, the Stats page names their 3 weakest grammar/vocabulary topics.

---

## 2. Decisions locked in

| Axis | Choice | Why |
|---|---|---|
| Context | TOEIC-first | Prompts and `topic` taxonomy tuned for Parts 5/6/7 |
| History | Weakness dashboard, no SRS | Enough to know what's weak without inflating scope |
| Stack | Vite + React + TypeScript + Tailwind, `@crxjs/vite-plugin` | TS makes generated code far easier to review |
| Main UI | Chrome Side Panel (Chrome 116+) | Doesn't touch page DOM, immune to site CSS/CSP, survives scrolling |
| Images | DOM → screenshot fallback → manual snip | Covers plain HTML sites as well as canvas/PDF |
| Explanation language | Settings dropdown: Vietnamese / English / Bilingual, default **Vietnamese** | |
| AI pipeline | Three separate steps: parse → analyze → error-psychology | Honest measurement; each prompt single-purpose, easy to tune and review |

---

## 3. Architecture

### 3.1 Invariant

**The API key exists only inside the service worker.** The content script never sees it; neither does the side panel. Every provider call goes through the background. This is review priority number one.

### 3.2 Component boundaries

| Component | Responsibility | Must not |
|---|---|---|
| `content/` | Track selection, draw floating button in Shadow DOM, scan images intersecting the selection, snip overlay | Call AI, read the API key, read IndexedDB |
| `background/` | Message router, AI calls, cross-origin image fetch, capture + crop, history writes | Render UI |
| `sidepanel/` | Main flow: Parse → Review → Result → Error | Call the AI provider directly |
| `app/` (own tab) | History, Stats, Settings | — |

**No action popup.** Clicking the extension icon opens the side panel (`chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`). The manual-paste flow lives in the side panel's "Paste" tab. One fewer surface to maintain.

### 3.3 Directory layout

```
src/
  manifest.config.ts
  shared/
    types.ts              # shared entities
    messages.ts           # discriminated union of all messages + typed send/on helpers
    strings.ts            # every user-facing string, in Vietnamese
    storage/
      settings.ts         # chrome.storage.local wrapper
      history.ts          # IndexedDB CRUD via idb
      stats.ts            # aggregate queries for the dashboard
  ai/
    types.ts              # AIProvider, ChatRequest
    openai.ts             # OpenAI-compatible adapter
    gemini.ts             # Gemini adapter
    index.ts              # factory driven by Settings
    schema.ts             # zod schemas + repair/retry
    prompts/
      parse.ts  analyze.ts  errorPsych.ts  weakness.ts
  background/
    index.ts              # message router
    aiRunner.ts           # orchestrates the 3 steps, relays streams over a port
    capture.ts            # image fetch → Blob, captureVisibleTab + crop
  content/
    index.ts  selection.ts  trigger.tsx  imageScan.ts  snip.tsx
  sidepanel/
    App.tsx  views/{Paste,Review,Result}.tsx  components/
  app/
    App.tsx  views/{History,Stats,Settings}.tsx
```

`shared/messages.ts` is the single place messages are defined. Nothing in the codebase sends a message with an ad-hoc string.

### 3.4 Permissions

```jsonc
{
  "permissions": ["storage", "sidePanel", "activeTab", "scripting", "unlimitedStorage"],
  "host_permissions": ["<all_urls>"]
}
```

`<all_urls>` is needed for two things: running the content script on arbitrary practice sites, and fetching cross-origin images from the service worker (bypassing CORS).

---

## 4. Data model

### 4.1 Two stores, split on purpose

**`chrome.storage.local`** → `Settings`.
Deliberately **not** `storage.sync`: sync would push the API key to Google's cloud.
State the trade-off plainly: `storage.local` is **not encrypted** — anyone with access to the Chrome profile can read the key. The Settings page must show this warning.

**IndexedDB** (via the `idb` library) → history. Reason: `storage.local` caps around 10MB and images would consume all of it.
Object stores: `sessions`, `questions`, `analyses`, `attempts`, `errorAnalyses`, `images` (stores `Blob`, **never** base64).

`attempts` is the **single source of truth** for "what the user answered, and when". The first answer and every "Retry this question" both append a new `Attempt`. The Stats page reads from this store only. `QuestionAnalysis` carries **no** `userAnswer` — the explanation of the correct answer does not change between retries.

### 4.2 Types

```ts
type Provider = 'openai' | 'gemini';
type ExplanationLanguage = 'vi' | 'en' | 'bilingual';

interface ProviderConfig {
  provider: Provider;
  baseUrl?: string;         // empty = provider's default endpoint
  apiKey: string;           // required
  model: string;            // required
  supportsVision: boolean;  // Settings checkbox, defaults to true
}

interface Settings {
  ai: ProviderConfig;
  explanationLanguage: ExplanationLanguage;  // default 'vi'
  captureImages: boolean;                    // default true
  minSelectionChars: number;                 // default 15
}

interface Choice { label: string; text: string; }   // label: 'A' | 'B' | 'C' | 'D'

interface Question {
  id: string;
  sessionId: string;
  order: number;
  stem: string;
  passage?: string;          // shared passage for Parts 6/7
  choices: Choice[];
  imageIds: string[];
  toeicPart?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

interface Attempt {
  id: string;
  questionId: string;
  userAnswer?: string;     // undefined = "not attempted"
  isCorrect: boolean;      // false when userAnswer is undefined
  createdAt: number;
  isRetry: boolean;        // false for the first answer, true for "Retry this question"
}

interface QuestionAnalysis {
  questionId: string;
  correctAnswer: string;                    // 'B'
  explanation: string;                      // concise, 3–4 lines
  strategy: string;                         // how to spot it, 1–2 lines
  distractorNotes?: Record<string, string>; // why each distractor is wrong
  topic: string;                            // "subject-verb agreement"
  topicCategory: 'grammar' | 'vocabulary' | 'reading' | 'other';
}

type ErrorTag =
  | 'no_grammar' | 'no_structure' | 'no_vocab' | 'misclick'   // 4 tags shown first
  | 'misread' | 'time_pressure' | 'trap_similar';             // 3 tags shown after

interface ErrorAnalysis {
  questionId: string;
  attemptId: string;       // tied to the specific wrong attempt
  userTags: ErrorTag[];
  userNote?: string;
  aiDiagnosis: string;     // why the user was psychologically drawn to the wrong choice
  fixAdvice: string;
}

interface Session {
  id: string;
  createdAt: number;
  origin: 'selection' | 'paste';
  sourceUrl?: string;      // only for origin 'selection'
  sourceTitle?: string;    // only for origin 'selection'
  rawText: string;
  questionIds: string[];
}
```

`topic` and `topicCategory` are assigned by the AI in step 2. They are what feeds the Stats page — without them the dashboard can only count right vs. wrong.

---

## 5. AI layer

### 5.1 Common interface

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

### 5.2 Two adapters

**OpenAI** → `POST {baseUrl ?? 'https://api.openai.com/v1'}/chat/completions`, using `response_format: { type: 'json_schema' }`.
Because `baseUrl` is open, this same config works with OpenRouter / Groq / LM Studio — a free capability, no extra code.

**Gemini** → `POST {baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta'}/models/{model}:generateContent`, using `generationConfig.responseMimeType = 'application/json'` plus `responseSchema`.

### 5.3 Which steps stream

| Step | Output | Streams | Why |
|---|---|---|---|
| 1. Parse | JSON | No | Structure must be complete before rendering the answer-picker. Show a skeleton. |
| 2. Analyze (whole batch) | JSON | No | Needs structured `correctAnswer` / `topic` to persist stats. |
| 3. Error psychology | Prose | **Yes** | This is where the user sits and reads — streaming text earns its keep. |
| 4. Weakness summary (dashboard) | Prose | **Yes** | Same as above. |

Streaming partial JSON would require incremental parsing — complex, little benefit. Dropped.

Steps 3 and 4 relay chunks from the service worker to the UI over a long-lived `chrome.runtime.connect` port.

### 5.4 Output constraints

Every JSON output passes through **zod**. On schema failure, retry exactly **once** with a prompt asking for a schema-conformant response. On a second failure, surface the error with the raw output and a "Retry" button. **Never swallow the error.**

Cap of **20 questions per capture**. Beyond that, warn and let the user trim before any AI call.

### 5.5 Prompts

All four prompts take `explanationLanguage` from Settings and honour it.

- **`parse.ts`** — split text (plus images if present) into an array of `Question`. **Must never return the correct answer.** Infer `toeicPart` when derivable. Fold a shared passage into `passage` for Parts 6/7.
- **`analyze.ts`** — takes the `Question` array plus each `userAnswer`, returns an array of `QuestionAnalysis`. Explicit constraints: `explanation` 3–4 lines, `strategy` 1–2 lines, and keep English grammar terminology and source vocabulary verbatim even when explaining in Vietnamese.
- **`errorPsych.ts`** — takes one question, the wrong answer picked, `userTags` and `userNote`; returns prose diagnosing the mistake and how to fix it.
- **`weakness.ts`** — takes **aggregated numbers only** (never resends full question text), returns 3–5 bullets on what to study first.

---

## 6. Image capture

Four rungs; stop at the first that succeeds.

1. Compute the union of `range.getClientRects()`, then **extend 200px upward** — TOEIC Part 1 images usually sit above the text.
2. Scan `img, canvas, svg, [style*="background-image"]` intersecting that region with area ≥ 40×40 px. For `<img>`: send the `src` to the service worker to fetch (host permissions bypass CORS) → `Blob`. If `src` is a `data:` URI, use it directly.
3. For `<canvas>`: try `toDataURL()` in the content script; fails if the canvas is tainted → fall to rung 4.
4. Fallback: `chrome.tabs.captureVisibleTab({ format: 'png' })` → `createImageBitmap` → crop to the rect scaled by `devicePixelRatio` in an `OffscreenCanvas` (the service worker has no DOM but does have both APIs).

**Manual escape hatch:** a "📷 Snip region" button in the side panel activates a drag-select overlay in the content script; the user draws a box → rect goes to the service worker → capture + crop. This is what rescues PDF viewers and canvas-rendered sites.

**Normalise before sending to the AI:** at most 3 images per session, longest edge ≤ 1024px, JPEG quality 0.8.

If `supportsVision === false`, drop images and show a "Current model does not accept images" banner — do **not** send and then fail.

---

## 7. User flows

### 7.1 Flow A — text selection (primary)

```
① Select ≥ minSelectionChars characters
   └─ a floating "✨" button appears just under the LAST rect of the selection
      (Shadow DOM, host div position:fixed, z-index 2147483647)
      hides on: empty selection · scroll · outside click · Esc

② Click → side panel opens → "Parsing questions…" plus a preview of captured text
   in parallel: run the four-rung image scan from §6

③ [AI call 1 — parse] → REVIEW view
   Q101  The manager ___ the report before Friday.
         ( A ) ( B ) ( C ) ( D )   [Not attempted]
   Q102  …
   → the user ticks THE ANSWER THEY ORIGINALLY PICKED.
     At this point the client does not hold the correct answer at all.
   → each question has [Skip this one] to drop mis-parsed entries
   → [Analyze] is ALWAYS enabled. Unticked questions are sent with
     userAnswer = undefined and recorded as an Attempt with isCorrect = false.

④ [AI call 2 — analyze batch] → RESULT view
   ┌ 101  ✓ B ──────────────────────────┐
   │ Explanation (3–4 lines)            │
   │ How to spot it (1–2 lines)         │
   └────────────────────────────────────┘
   ┌ 102  ✗ you chose C · correct A ────┐
   │ Explanation · Strategy · Why C is wrong │
   │ [🧠 Analyze my mistake]            │
   └────────────────────────────────────┘

⑤ Click [🧠] → multi-select reason chips + a free-text note
   First row:  Don't know the grammar · Don't know the structure ·
               Don't know the vocabulary · Misclick
   Second row: Skimmed and misread · Ran out of time, guessed ·
               Fell for a near-identical distractor
   → [Submit] → [AI call 3 — streaming] psychological diagnosis + how to fix
```

Write to IndexedDB at **every milestone** (after ③, ④ and ⑤). Closing the panel midway loses nothing.

### 7.2 Flow B — manual paste

Click the extension icon → side panel → **"Paste"** tab → textarea plus clipboard image paste (`paste` event, read `clipboardData.files`) → **[Parse questions]** → drops straight into step ③.

Reuses the exact same `Review` component; no duplicated code.

This is also the escape route wherever the content script cannot run: `chrome://`, the Chrome Web Store, the built-in PDF viewer.

### 7.3 Flow C — dashboard

Opens in its own tab, `app.html`, from a button in the side panel.

**History** — listed **by question**, not by session, because revision happens per question.
Filters: correct/incorrect · TOEIC part · `topic` · `ErrorTag` · date range. Full-text search over question text.
Clicking opens the detail view including the original images.
**"Retry this question"** → hides the answer, lets the user pick again, compares to last time. The cheapest way to learn whether the weakness was actually fixed. Records a new `Attempt` with `isRetry = true`; **does not** call the AI (the `QuestionAnalysis` already exists), so retrying costs no tokens.

**Stats**
All figures come from the `attempts` store. By default **only first attempts count** (`isRetry = false`), so scores can't be inflated by redoing questions whose answers are already known; a "Include retries" toggle is available.

- Overall accuracy, and accuracy by week
- **Most-missed topics** (by `topic`), a table sorted by wrong count
- Distribution of mistake reasons (by `ErrorTag`) — reveals whether the gap is *knowledge* or *exam technique*
- Accuracy by TOEIC part
- **"AI weakness summary"** button → the `weakness.ts` prompt

**Settings**
provider · baseUrl (empty = default) · apiKey · model · `supportsVision` · **[Test connection]** (fires one cheap request, reports OK or the specific error) · explanation language · images on/off · `minSelectionChars` · JSON export/import · wipe all data.

Includes the warning that the API key is stored unencrypted.

**JSON export/import:** the file contains `sessions`, `questions`, `analyses`, `attempts`, `errorAnalyses`. An "Include images" checkbox (**off by default** — turning it on embeds base64 and the file balloons fast). **Never** export `Settings`, so a shared file cannot leak the API key. Import is **additive**, not destructive: on an `id` collision, skip the incoming record.

---

## 8. Error handling

| Situation | Behaviour |
|---|---|
| No API key configured | Side panel shows onboarding with a button to Settings. No AI call. |
| 401 / 429 / network failure | Specific message per status code plus [Retry]. Already-parsed data is **preserved**. |
| JSON fails schema | Retry once; if it fails again, show the raw output plus [Retry]. |
| `sidePanel.open()` throws | In-page toast "Click the IMEN icon to open the panel" + red dot badge on the icon. |
| Selection changes / panel closes | `AbortController` cancels the in-flight request. |
| Model lacks vision support | Drop images, show an explanatory banner. |
| Parse yields 0 questions | Show the raw text and suggest the "Paste" tab for manual correction. |
| Content script cannot inject | Only flow B is available. The side panel says why. |

---

## 9. Technical risk to verify early

**`chrome.sidePanel.open()` requires a user gesture.** Calling it from the service worker in response to a message the content script sent after a click is documented as valid, but real behaviour has shifted across Chrome versions.

→ Make this a **spike in the very first task** of the implementation plan. The fallback is already designed (see §8), so this risk does not block progress — but the answer is needed before building UI on top of it.

---

## 10. Testing

**Automated (Vitest)**
- `shared/storage/*` with `fake-indexeddb` — CRUD, schema version migration, Stats aggregation
- `ai/schema.ts` — zod validation and the retry/repair path
- `ai/openai.ts`, `ai/gemini.ts` with `msw` — correct request construction, SSE parsing, 401/429 mapping
- `content/imageScan.ts`, `content/selection.ts` with jsdom — the rect-intersection logic is pure and testable
- React Testing Library for the `Review → Result` flow against a fake background port

**Manual (checklist, requires a real browser)**
- Side panel opens from the floating button
- Snip drag-select produces an image of the right region
- `captureVisibleTab` + crop respects `devicePixelRatio` on a HiDPI display
- The floating button renders correctly on 3 real TOEIC practice sites

---

## 11. Suggested build order

This spec is enough for one implementation plan, but the volume is large. Five stages, each independently runnable and reviewable:

| Stage | Contents | Done when |
|---|---|---|
| 0 | Scaffold Vite + CRXJS + TS + Tailwind, `manifest.config.ts`, `shared/types.ts`, `shared/messages.ts`. **Spike `sidePanel.open()` from a content-script click** (§9). | Extension loads, clicking the icon opens an empty side panel, and the spike's verdict is known |
| 1 | `shared/storage/*` plus `ai/*` (two adapters, zod, three prompts) plus `background/aiRunner.ts`. No real UI yet. | Every Vitest suite from §10 is green |
| 2 | Flow B first (manual paste → Review → Result → Error). Settings page. | Pasting a block of TOEIC questions runs the whole flow and writes history |
| 3 | Flow A (content script: selection, floating button, `imageScan`, `snip`) plus `background/capture.ts` | Selecting text on a real practice site works |
| 4 | Dashboard History + Stats + `weakness.ts` + export/import | After ~50 questions it names the 3 weakest topics |

Building flow B (stage 2) **before** flow A is deliberate: it depends on neither the content script nor screen-capture permissions, so the entire AI pipeline and UI get validated before touching the most fragile part.

---

## 12. Out of scope for v1

SRS / Anki · cloud sync, multi-device · Parts 1–4 audio · auto-detecting which answer the user ticked on the page · user accounts · Firefox support.
