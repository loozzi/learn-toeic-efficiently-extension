# Socratic hints ("Chưa biết") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-question "Chưa biết" button to the side-panel Review view that fetches one progressively more specific, answer-free hint per click.

**Architecture:** New plain-text prompt `buildHintPrompt` → new one-shot `HINT` request handled by `runHint` in the background (via `registerHandlers`, `provider.complete`, no streaming, no persistence) → Review keeps `hints` per question in component state and sends previous hints on each click.

**Tech Stack:** TypeScript, React, Vitest + Testing Library, Chrome MV3 messaging.

**Spec:** `docs/superpowers/specs/2026-11-27-socratic-hints-design.md`

## Global Constraints

- A hint must never reveal the answer: never name the correct letter, never say "the answer is …", never confirm a choice.
- Hints are not stored: no IndexedDB writes, no history/attempt/stats/export changes.
- Result, History, Stats, RetryPanel are untouched.
- Hint prose follows `settings.explanationLanguage` via `languageInstruction`.
- UI copy is Vietnamese, in `src/shared/strings.ts`.

## Review Focus

1. Learner clicks "Chưa biết" on Q1, then on Q2 before Q1 returns → each hint lands under its own question (state keyed by questionId). Test in Task 3.
2. Learner skips a question while its hint is loading → no crash, late reply ignored. Covered by keyed state (skipped questions simply aren't rendered); no extra test.
3. Hint request fails (no API key, network) → inline error under that question, button re-enabled so they can retry. Test in Task 3.
4. Model wraps the hint in quotes/whitespace or returns empty → trimmed; empty text throws `UNKNOWN` so the UI shows an error instead of a blank hint. Test in Task 2.
5. Learner already picked a choice → button still works (spec). Implicitly covered; no separate test.

Cancellation on unmount: deliberately not implemented (my call, cheaper than a cancel channel; a late reply to an unmounted Review is dropped by React). Spec updated to match.

---

### Task 1: Hint prompt

**Files:**
- Create: `src/ai/prompts/hint.ts`
- Test: `src/ai/prompts/prompts.test.ts` (add cases)

**Interfaces:**
- Produces: `buildHintPrompt(input: { language: ExplanationLanguage; question: Question; previousHints: string[] }): { system: string; user: string }`

- [ ] **Step 1: Write failing tests** in `prompts.test.ts` (reuse the file's `question` fixture):

```ts
it('forbids the hint step from revealing the answer', () => {
  const { system } = buildHintPrompt({ language: 'vi', question, previousHints: [] });
  expect(system.toLowerCase()).toMatch(/never.*(reveal|state|name).*(answer|letter)/s);
  expect(system).toMatch(/Vietnamese/);
});
it('sends previous hints so the next one escalates', () => {
  const { system, user } = buildHintPrompt({ language: 'en', question, previousHints: ['Look at the subject.'] });
  expect(user).toContain('Look at the subject.');
  expect(user).toContain('The manager ___ the report.');
  expect(system.toLowerCase()).toMatch(/more specific/);
});
```

- [ ] **Step 2: Run** `npx vitest run src/ai/prompts/prompts.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement `buildHintPrompt`** in `src/ai/prompts/hint.ts`, same style as `analyze.ts`. System prompt: Socratic TOEIC tutor; reply with ONE hint, 1–2 lines, plain text, no markdown, no preamble; prefer a guiding question about a signal (word form after a determiner, tense marker, collocation, passage clue); must be more specific than every previous hint and must not repeat them; never reveal, name, or confirm the correct answer or its letter; keep English grammar terms in English; then `languageInstruction(language)`. User: `JSON.stringify({ passage, stem, choices, previousHints }, null, 2)`.

- [ ] **Step 4: Run** the same command — expect PASS.

- [ ] **Step 5: Commit** `feat: add Socratic hint prompt`

---

### Task 2: HINT request + background runner

**Files:**
- Modify: `src/shared/messages.ts` (`RequestMap`)
- Modify: `src/background/aiRunner.ts` (add `runHint`)
- Modify: `src/background/index.ts` (register `HINT` in `registerHandlers`)
- Test: `src/background/aiRunner.test.ts`

**Interfaces:**
- Consumes: `buildHintPrompt` (Task 1); `findQuestion(id)` from `shared/storage/history`.
- Produces: `RequestMap["HINT"] = { req: { questionId: string; previousHints: string[] }; res: { hint: string } }`; `runHint(input: RequestMap["HINT"]["req"], signal?: AbortSignal): Promise<RequestMap["HINT"]["res"]>`.

- [ ] **Step 1: Write failing tests** in `aiRunner.test.ts` (import `runHint` alongside the others; seed a question via `runParse` with the existing `parseReply`):

```ts
describe("runHint", () => {
  it("returns the trimmed hint and passes previous hints to the model", async () => {
    complete.mockResolvedValueOnce({ text: parseReply });
    const { questions } = await runParse({ rawText: "raw", images: [], origin: "paste" });
    complete.mockResolvedValueOnce({ text: "  Sau chủ ngữ số ít cần gì?\n" });
    const out = await runHint({ questionId: questions[0].id, previousHints: ["Nhìn chủ ngữ."] });
    expect(out).toEqual({ hint: "Sau chủ ngữ số ít cần gì?" });
    const request = complete.mock.calls[1][0];
    expect(request.json).toBe(false);
    expect(request.userParts[0].text).toContain("Nhìn chủ ngữ.");
  });
  it("rejects an empty hint instead of showing a blank one", async () => {
    complete.mockResolvedValueOnce({ text: parseReply });
    const { questions } = await runParse({ rawText: "raw", images: [], origin: "paste" });
    complete.mockResolvedValueOnce({ text: "   " });
    await expect(runHint({ questionId: questions[0].id, previousHints: [] })).rejects.toMatchObject({ code: "UNKNOWN" });
  });
  it("rejects an unknown question", async () => {
    await expect(runHint({ questionId: "nope", previousHints: [] })).rejects.toMatchObject({ code: "UNKNOWN" });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/background/aiRunner.test.ts` — expect FAIL (`runHint` not exported).

- [ ] **Step 3: Implement.** Add `HINT` to `RequestMap`. `runHint`: `requireSettings()` → `findQuestion` (missing → `appError("UNKNOWN", { detail: "question missing" })`) → `buildHintPrompt` → `provider.complete({ system, userParts: [{ type: "text", text: user }], json: false }, signal)` → trim; empty → `appError("UNKNOWN", { detail: "empty hint" })`. Strip one pair of surrounding quotes if present. In `index.ts` add `HINT: (request) => runHint(request)` to `registerHandlers`.

- [ ] **Step 4: Run** the test file, then `npm run typecheck` — expect PASS / no errors.

- [ ] **Step 5: Commit** `feat: add HINT request handled by runHint`

---

### Task 3: "Chưa biết" button in Review

**Files:**
- Modify: `src/shared/strings.ts` (`S.review`)
- Modify: `src/sidepanel/views/Review.tsx`
- Test: `src/sidepanel/views/Review.test.tsx`

**Interfaces:**
- Consumes: `sendRequest("HINT", { questionId, previousHints })` (Task 2).
- Produces: strings `S.review.dontKnow = "Chưa biết"`, `S.review.hintLabel = (n: number) => \`Gợi ý ${n}\``, `S.review.hintLoading = "Đang nghĩ gợi ý…"`.

- [ ] **Step 1: Write failing tests** in `Review.test.tsx`:

```ts
it("shows a hint under the question and sends earlier hints on the next click", async () => {
  sendRequest
    .mockResolvedValueOnce({ ok: true, data: { hint: "Nhìn chủ ngữ." } })
    .mockResolvedValueOnce({ ok: true, data: { hint: "Chủ ngữ số ít thì động từ thế nào?" } });
  renderReview();
  const card = within(screen.getByTestId("question-q1"));
  await userEvent.click(card.getByRole("button", { name: S.review.dontKnow }));
  expect(await card.findByText("Nhìn chủ ngữ.")).toBeInTheDocument();
  await userEvent.click(card.getByRole("button", { name: S.review.dontKnow }));
  expect(await card.findByText("Chủ ngữ số ít thì động từ thế nào?")).toBeInTheDocument();
  expect(card.getByText("Nhìn chủ ngữ.")).toBeInTheDocument();
  expect(sendRequest).toHaveBeenLastCalledWith("HINT", { questionId: "q1", previousHints: ["Nhìn chủ ngữ."] });
  expect(within(screen.getByTestId("question-q2")).queryByText("Nhìn chủ ngữ.")).not.toBeInTheDocument();
});
it("shows a hint error inline and lets the learner retry", async () => {
  sendRequest.mockResolvedValueOnce({ ok: false, error: { code: "NO_API_KEY" } });
  renderReview();
  const card = within(screen.getByTestId("question-q1"));
  await userEvent.click(card.getByRole("button", { name: S.review.dontKnow }));
  expect(await card.findByRole("alert")).toBeInTheDocument();
  expect(card.getByRole("button", { name: S.review.dontKnow })).toBeEnabled();
});
```

(`ErrorBanner` has no role today: add `role="alert"` to its root div — harmless for other users.) Add `sendRequest.mockReset()` in a `beforeEach` if the file lacks one.

- [ ] **Step 2: Run** `npx vitest run src/sidepanel/views/Review.test.tsx` — expect the two new tests FAIL.

- [ ] **Step 3: Implement.** State `hints: Record<string, string[]>`, `hintLoading: Record<string, boolean>`, `hintErrors: Record<string, SerializedError | undefined>`. `askHint(questionId)`: set loading, clear error, `sendRequest("HINT", { questionId, previousHints: hints[questionId] ?? [] })`, on ok append `reply.data.hint`, else set error; clear loading. Render a "Chưa biết" button (same `ChoiceButton`-adjacent row, lucide `HelpCircle` icon, outline style) disabled while that question loads, label `S.review.hintLoading` while loading. Under the choice texts render `hints[q.id]` as a list: `💡 {S.review.hintLabel(i + 1)}: {hint}` (lucide `Lightbulb` instead of emoji, matching `Result.tsx`). Inline error: `ErrorBanner` with `onRetry={() => askHint(q.id)}`.

- [ ] **Step 4: Run** `npm test` and `npm run build` — expect all green.

- [ ] **Step 5: Commit** `feat: add "Chưa biết" Socratic hints to Review`
