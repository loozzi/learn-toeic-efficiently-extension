# Socratic hints ("Chưa biết") — design

## Intent

Today IMEN tells the learner the answer and explains it. The goal here is to let the
learner work the answer out themselves first: when stuck, they ask for a hint, and the
AI points at a clue ("Chỗ trống đứng sau mạo từ *the* — cần loại từ gì?") instead of
the answer. The learner keeps asking until they're ready to pick, then the existing
grading/explanation flow runs unchanged.

## Goals

- A **"Chưa biết"** button on each question in the Review view (beside A/B/C/D).
- Each click fetches **one new hint**, more specific than the previous one, shown
  under the question. Earlier hints stay visible.
- No limit on clicks: the learner can keep asking until they pick a choice.
- After "Phân tích", behaviour is exactly as today (analyze → Result → error psych).

## Non-goals

- No chat box / free-form conversation.
- Hints are **not stored** anywhere: not in history, attempts, stats or export.
  They live in Review component state and are discarded.
- No changes to Stats, History, RetryPanel (the dashboard retry flow), or Result.

## Anti-goals

- A hint must **never reveal the answer**: never name the correct letter, never say
  "the answer is …", never quote the correct choice as the answer. A hint that gives
  the answer away defeats the feature even if everything else works.

## Approaches

1. **One AI call per click (chosen).** Send the question plus hints already given; the
   model returns the next, more specific hint. Unlimited, non-repeating, simple. Costs
   ~1–3 s and a few tokens per click.
2. Generate a ladder of 3 hints on the first click. Instant later hints, but capped at
   3 — conflicts with "keep hinting until they pick".
3. Generate hints for every question during parse. Slows parse and wastes tokens on
   questions the learner can do. Rejected.

The user picked approach 1.

## Design

- **Prompt** `src/ai/prompts/hint.ts`: `buildHintPrompt({ language, question, previousHints })`.
  System prompt: Socratic TOEIC tutor; reply with one short hint (1–2 lines), ideally
  a guiding question about a signal in the sentence (word form, tense marker,
  collocation, passage clue); each hint more specific than the previous ones; never
  reveal or confirm the answer. Plain text, not JSON. Uses `languageInstruction`
  so it follows the explanation-language setting.
- **Message** `HINT` in `src/shared/messages.ts`: req `{ questionId, previousHints: string[] }`,
  res `{ hint: string }`, registered through `registerHandlers`. No cancel channel:
  a late reply to an unmounted Review is simply dropped (builder's call — hints are cheap).
- **Background** `runHint` in `src/background/aiRunner.ts`: loads the question via
  `findQuestion`, calls `provider.complete` (no streaming, `json: false`), returns
  trimmed text. Errors go through the existing `appError` / `ErrorBanner` path.
- **Review view**: per-question state `hints: string[]` and `hintLoading`. The
  "Chưa biết" button is disabled while that question's hint is loading. Hints render
  as a small list under the choices ("💡 Gợi ý 1: …"). The button stays visible after
  a choice is picked, so the learner can still ask (cheap to allow, no harm).
- **Strings** in `src/shared/strings.ts` (`S.review.dontKnow`, `S.review.hintLabel(n)`,
  `S.review.hintLoading`).

## Builder's calls

- Exact prompt wording and hint-escalation phrasing.
- Visual styling of the hint list (follow existing Review card styles).
- Whether a hint error shows inline under the question or in the shared banner.
- Tests: prompt builder unit test (includes previous hints, contains the
  never-reveal rule), `runHint` test with mocked provider, Review test for click →
  hint appears → second click sends previous hints.
