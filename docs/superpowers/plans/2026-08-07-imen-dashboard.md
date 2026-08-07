# IMEN Plan 3 — History & Weakness Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the question history Plans 1 and 2 accumulate into an answer to "what am I weak at" — a filterable question list, a weakness dashboard, free retries, and JSON export/import.

**Architecture:** Everything reads from the IndexedDB stores that already exist. A query layer joins the five stores into one `HistoryRow` per question; a pure `computeStats` function turns rows into every figure the dashboard shows. The options page grows from a single Settings screen into a three-tab shell. The only new AI call is a weakness summary, which is sent aggregated numbers — never the question text again.

**Tech Stack:** Same as Plans 1 and 2. No new dependencies.

**Prerequisite:** Plans 1 and 2 complete.

**Source spec:** `docs/superpowers/specs/2026-08-07-imen-ext-design.md` §7.3.

---

## Global Constraints

Plan 1's Global Constraints all still apply. Additions:

- **`attempts` is the single source of truth for outcomes.** No view may recompute correctness from `answers` state or from `QuestionAnalysis`. Everything counts from attempt rows.
- **Statistics count first attempts only by default** (`isRetry === false`). A user who redoes a question they already know the answer to must not be able to inflate their own numbers without noticing. The "Include retries" toggle is opt-in and off on load.
- **"Retry this question" never calls the AI.** The `QuestionAnalysis` already exists; retrying writes one `Attempt` and nothing else. It is free.
- **Export never includes `Settings`.** A shared export file must not be able to leak an API key.
- **Import is additive.** On an `id` collision, skip the incoming record. Never overwrite, never delete.
- **The weakness prompt receives aggregated numbers only** — topic names and counts. It must never be handed the raw question text again.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/storage/queries.ts` | Joins the five stores into `HistoryRow`s and filters them |
| `src/shared/storage/stats.ts` | Pure `computeStats(rows, opts)` — every dashboard figure |
| `src/shared/storage/exportImport.ts` | Bundle build and additive merge |
| `src/ai/prompts/weakness.ts` | Aggregated numbers → study advice |
| `src/app/App.tsx` | Three-tab shell (History / Stats / Settings) |
| `src/app/views/History.tsx` | Filterable question list plus detail |
| `src/app/views/QuestionDetail.tsx` | One question, its analysis, its attempts, retry |
| `src/app/views/Stats.tsx` | The weakness dashboard |
| `src/app/components/StatBar.tsx` | The one shared chart primitive |

---

## Task 1: History query layer

**Files:**
- Modify: `src/shared/storage/history.ts` (bulk readers)
- Create: `src/shared/storage/queries.ts`
- Test: `src/shared/storage/queries.test.ts`

**Interfaces:**
- Consumes: entity types; `openDb`.
- Produces: `getAllQuestions()`, `getAllAnalyses()`, `getAllAttempts()`, `getAllErrorAnalyses()`, `getAllSessions()`; `HistoryRow`, `HistoryFilter`, `buildRows()`, `applyFilter(rows, filter)`, `listHistory(filter)`, `getRow(questionId)`.

`buildRows` and `applyFilter` are pure so the filtering logic is testable without a database. `listHistory` is the thin adapter that reads the stores and calls them.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { applyFilter, buildRows } from './queries';
import type { Attempt, ErrorAnalysis, Question, QuestionAnalysis } from '../types';

const DAY = 86_400_000;

const question = (id: string, over: Partial<Question> = {}): Question => ({
  id, sessionId: 's1', order: 1, stem: `stem ${id}`, imageIds: [],
  choices: [{ label: 'A', text: 'alpha' }, { label: 'B', text: 'beta' }], ...over,
});

const analysis = (questionId: string, over: Partial<QuestionAnalysis> = {}): QuestionAnalysis => ({
  questionId, correctAnswer: 'B', explanation: 'e', strategy: 's',
  topic: 'subject-verb agreement', topicCategory: 'grammar', ...over,
});

const attempt = (id: string, questionId: string, over: Partial<Attempt> = {}): Attempt => ({
  id, questionId, userAnswer: 'B', isCorrect: true, createdAt: 1000, isRetry: false, ...over,
});

const errorAnalysis = (attemptId: string, questionId: string, tags: ErrorAnalysis['userTags']): ErrorAnalysis => ({
  attemptId, questionId, userTags: tags, aiDiagnosis: 'd', fixAdvice: 'f',
});

describe('buildRows', () => {
  it('joins a question with its analysis, attempts and error tags', () => {
    const rows = buildRows({
      questions: [question('q1')],
      analyses: [analysis('q1')],
      attempts: [attempt('a1', 'q1')],
      errorAnalyses: [errorAnalysis('a1', 'q1', ['no_vocab'])],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].analysis?.topic).toBe('subject-verb agreement');
    expect(rows[0].attempts).toHaveLength(1);
    expect(rows[0].errorTags).toEqual(['no_vocab']);
  });

  it('orders attempts oldest first and exposes first and latest', () => {
    const rows = buildRows({
      questions: [question('q1')],
      analyses: [],
      attempts: [
        attempt('a2', 'q1', { createdAt: 3000, isRetry: true, isCorrect: true }),
        attempt('a1', 'q1', { createdAt: 1000, isCorrect: false }),
      ],
      errorAnalyses: [],
    });
    expect(rows[0].attempts.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(rows[0].firstAttempt?.id).toBe('a1');
    expect(rows[0].latestAttempt?.id).toBe('a2');
  });

  it('deduplicates error tags reported across several attempts', () => {
    const rows = buildRows({
      questions: [question('q1')],
      analyses: [],
      attempts: [attempt('a1', 'q1'), attempt('a2', 'q1', { createdAt: 2000 })],
      errorAnalyses: [
        errorAnalysis('a1', 'q1', ['no_vocab', 'misread']),
        errorAnalysis('a2', 'q1', ['no_vocab']),
      ],
    });
    expect(rows[0].errorTags.sort()).toEqual(['misread', 'no_vocab']);
  });

  it('keeps a question that has no analysis yet', () => {
    const rows = buildRows({ questions: [question('q1')], analyses: [], attempts: [], errorAnalyses: [] });
    expect(rows[0].analysis).toBeUndefined();
    expect(rows[0].firstAttempt).toBeUndefined();
  });

  it('sorts newest question first by its first attempt', () => {
    const rows = buildRows({
      questions: [question('old'), question('new')],
      analyses: [],
      attempts: [
        attempt('a1', 'old', { createdAt: 1000 }),
        attempt('a2', 'new', { createdAt: 5000 }),
      ],
      errorAnalyses: [],
    });
    expect(rows.map((r) => r.question.id)).toEqual(['new', 'old']);
  });
});

describe('applyFilter', () => {
  const rows = buildRows({
    questions: [
      question('q1', { toeicPart: 5, stem: 'The manager submits the report' }),
      question('q2', { toeicPart: 7, stem: 'Please contact our team' }),
    ],
    analyses: [
      analysis('q1', { topic: 'subject-verb agreement' }),
      analysis('q2', { topic: 'business vocabulary', topicCategory: 'vocabulary' }),
    ],
    attempts: [
      attempt('a1', 'q1', { isCorrect: false, createdAt: 1000 }),
      attempt('a2', 'q2', { isCorrect: true, createdAt: 1000 + 10 * DAY }),
    ],
    errorAnalyses: [errorAnalysis('a1', 'q1', ['no_grammar'])],
  });

  it('returns everything with an empty filter', () => {
    expect(applyFilter(rows, {})).toHaveLength(2);
  });

  it('filters by first-attempt outcome', () => {
    expect(applyFilter(rows, { outcome: 'wrong' }).map((r) => r.question.id)).toEqual(['q1']);
    expect(applyFilter(rows, { outcome: 'correct' }).map((r) => r.question.id)).toEqual(['q2']);
  });

  it('filters by TOEIC part, topic and error tag', () => {
    expect(applyFilter(rows, { toeicPart: 7 }).map((r) => r.question.id)).toEqual(['q2']);
    expect(applyFilter(rows, { topic: 'business vocabulary' }).map((r) => r.question.id)).toEqual(['q2']);
    expect(applyFilter(rows, { errorTag: 'no_grammar' }).map((r) => r.question.id)).toEqual(['q1']);
  });

  it('filters by date range on the first attempt', () => {
    expect(applyFilter(rows, { from: 1000 + 5 * DAY }).map((r) => r.question.id)).toEqual(['q2']);
    expect(applyFilter(rows, { to: 1000 + 5 * DAY }).map((r) => r.question.id)).toEqual(['q1']);
  });

  it('searches stem, choices and topic case-insensitively', () => {
    expect(applyFilter(rows, { search: 'MANAGER' }).map((r) => r.question.id)).toEqual(['q1']);
    expect(applyFilter(rows, { search: 'alpha' })).toHaveLength(2);
    expect(applyFilter(rows, { search: 'vocabulary' }).map((r) => r.question.id)).toEqual(['q2']);
  });

  it('combines filters conjunctively', () => {
    expect(applyFilter(rows, { outcome: 'wrong', toeicPart: 7 })).toHaveLength(0);
  });

  it('treats a question with no attempt as neither correct nor wrong', () => {
    const orphan = buildRows({ questions: [question('q3')], analyses: [], attempts: [], errorAnalyses: [] });
    expect(applyFilter(orphan, { outcome: 'wrong' })).toHaveLength(0);
    expect(applyFilter(orphan, { outcome: 'correct' })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/shared/storage/queries.test.ts`
Expected: FAIL — `Cannot find module './queries'`

- [ ] **Step 3: Add bulk readers to `src/shared/storage/history.ts`**

```ts
export async function getAllSessions(): Promise<Session[]> {
  return (await openDb()).getAll('sessions');
}

export async function getAllQuestions(): Promise<Question[]> {
  return (await openDb()).getAll('questions');
}

export async function getAllAnalyses(): Promise<QuestionAnalysis[]> {
  return (await openDb()).getAll('analyses');
}

export async function getAllAttempts(): Promise<Attempt[]> {
  return (await openDb()).getAll('attempts');
}

export async function getAllErrorAnalyses(): Promise<ErrorAnalysis[]> {
  return (await openDb()).getAll('errorAnalyses');
}
```

- [ ] **Step 4: Implement `src/shared/storage/queries.ts`**

```ts
import {
  getAllAnalyses, getAllAttempts, getAllErrorAnalyses, getAllQuestions,
} from './history';
import type {
  Attempt, ErrorAnalysis, ErrorTag, Question, QuestionAnalysis,
} from '../types';

export interface HistoryRow {
  question: Question;
  analysis?: QuestionAnalysis;
  attempts: Attempt[]; // oldest first
  firstAttempt?: Attempt;
  latestAttempt?: Attempt;
  errorTags: ErrorTag[];
}

export interface HistoryFilter {
  outcome?: 'correct' | 'wrong';
  toeicPart?: number;
  topic?: string;
  errorTag?: ErrorTag;
  from?: number;
  to?: number;
  search?: string;
}

export interface RawStores {
  questions: Question[];
  analyses: QuestionAnalysis[];
  attempts: Attempt[];
  errorAnalyses: ErrorAnalysis[];
}

/**
 * Joins in memory rather than with cursors. At the volumes this extension
 * produces — a few thousand questions after a year of daily practice — one
 * full read is far simpler than five index walks and fast enough.
 */
export function buildRows(stores: RawStores): HistoryRow[] {
  const analysisByQuestion = new Map(stores.analyses.map((a) => [a.questionId, a]));

  const attemptsByQuestion = new Map<string, Attempt[]>();
  for (const attempt of stores.attempts) {
    const list = attemptsByQuestion.get(attempt.questionId) ?? [];
    list.push(attempt);
    attemptsByQuestion.set(attempt.questionId, list);
  }

  const tagsByQuestion = new Map<string, Set<ErrorTag>>();
  for (const err of stores.errorAnalyses) {
    const set = tagsByQuestion.get(err.questionId) ?? new Set<ErrorTag>();
    for (const tag of err.userTags) set.add(tag);
    tagsByQuestion.set(err.questionId, set);
  }

  const rows: HistoryRow[] = stores.questions.map((question) => {
    const attempts = (attemptsByQuestion.get(question.id) ?? [])
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt);

    return {
      question,
      analysis: analysisByQuestion.get(question.id),
      attempts,
      firstAttempt: attempts[0],
      latestAttempt: attempts.at(-1),
      errorTags: [...(tagsByQuestion.get(question.id) ?? [])],
    };
  });

  return rows.sort((a, b) => (b.firstAttempt?.createdAt ?? 0) - (a.firstAttempt?.createdAt ?? 0));
}

function haystack(row: HistoryRow): string {
  return [
    row.question.stem,
    row.question.passage ?? '',
    ...row.question.choices.map((c) => c.text),
    row.analysis?.topic ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

export function applyFilter(rows: HistoryRow[], filter: HistoryFilter): HistoryRow[] {
  const search = filter.search?.trim().toLowerCase();

  return rows.filter((row) => {
    if (filter.outcome) {
      // No attempt means no outcome — such a question matches neither value.
      if (!row.firstAttempt) return false;
      if (filter.outcome === 'correct' && !row.firstAttempt.isCorrect) return false;
      if (filter.outcome === 'wrong' && row.firstAttempt.isCorrect) return false;
    }
    if (filter.toeicPart != null && row.question.toeicPart !== filter.toeicPart) return false;
    if (filter.topic != null && row.analysis?.topic !== filter.topic) return false;
    if (filter.errorTag != null && !row.errorTags.includes(filter.errorTag)) return false;
    if (filter.from != null && (row.firstAttempt?.createdAt ?? 0) < filter.from) return false;
    if (filter.to != null && (row.firstAttempt?.createdAt ?? 0) > filter.to) return false;
    if (search && !haystack(row).includes(search)) return false;
    return true;
  });
}

export async function listHistory(filter: HistoryFilter = {}): Promise<HistoryRow[]> {
  const [questions, analyses, attempts, errorAnalyses] = await Promise.all([
    getAllQuestions(), getAllAnalyses(), getAllAttempts(), getAllErrorAnalyses(),
  ]);
  return applyFilter(buildRows({ questions, analyses, attempts, errorAnalyses }), filter);
}

export async function getRow(questionId: string): Promise<HistoryRow | undefined> {
  return (await listHistory()).find((r) => r.question.id === questionId);
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/shared/storage/queries.test.ts`
Expected: PASS, 14 tests

- [ ] **Step 6: Commit**

```bash
git add src/shared/storage/queries.ts src/shared/storage/queries.test.ts src/shared/storage/history.ts
git commit -m "feat: add history query layer joining questions, analyses and attempts"
```

---

## Task 2: Statistics

**Files:**
- Create: `src/shared/storage/stats.ts`
- Test: `src/shared/storage/stats.test.ts`

**Interfaces:**
- Consumes: `HistoryRow` from queries; `ErrorTag`.
- Produces: `Stats`, `StatsOptions`, `startOfWeek(ts)`, `computeStats(rows, opts)`.

`computeStats` is pure, which is what makes the "first attempts only" rule verifiable rather than aspirational.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { computeStats, startOfWeek } from './stats';
import type { HistoryRow } from './queries';
import type { Attempt } from '../types';

const MON = Date.UTC(2026, 0, 5); // a Monday
const DAY = 86_400_000;

const attempt = (over: Partial<Attempt>): Attempt => ({
  id: crypto.randomUUID(), questionId: 'q', userAnswer: 'B',
  isCorrect: true, createdAt: MON, isRetry: false, ...over,
});

const row = (over: Partial<HistoryRow> & { attempts: Attempt[] }): HistoryRow => ({
  question: {
    id: 'q', sessionId: 's', order: 1, stem: 'x', imageIds: [],
    choices: [{ label: 'A', text: 'a' }],
  },
  attempts: over.attempts,
  firstAttempt: over.attempts[0],
  latestAttempt: over.attempts.at(-1),
  errorTags: [],
  ...over,
});

describe('startOfWeek', () => {
  it('snaps every day of a week back to its Monday', () => {
    for (let i = 0; i < 7; i++) expect(startOfWeek(MON + i * DAY)).toBe(MON);
  });

  it('rolls a Sunday back six days, not forward one', () => {
    expect(startOfWeek(MON + 6 * DAY)).toBe(MON);
  });
});

describe('computeStats', () => {
  it('reports zeroes for an empty history without dividing by zero', () => {
    const stats = computeStats([], { includeRetries: false });
    expect(stats).toMatchObject({ total: 0, correct: 0, accuracy: 0 });
    expect(stats.topMissedTopics).toEqual([]);
  });

  it('counts only first attempts by default', () => {
    const rows = [row({ attempts: [
      attempt({ isCorrect: false }),
      attempt({ isCorrect: true, isRetry: true, createdAt: MON + DAY }),
    ] })];
    expect(computeStats(rows, { includeRetries: false })).toMatchObject({ total: 1, correct: 0 });
  });

  it('counts retries too when asked', () => {
    const rows = [row({ attempts: [
      attempt({ isCorrect: false }),
      attempt({ isCorrect: true, isRetry: true, createdAt: MON + DAY }),
    ] })];
    expect(computeStats(rows, { includeRetries: true })).toMatchObject({ total: 2, correct: 1 });
  });

  it('computes accuracy as a fraction', () => {
    const rows = [
      row({ attempts: [attempt({ isCorrect: true })] }),
      row({ attempts: [attempt({ isCorrect: true })] }),
      row({ attempts: [attempt({ isCorrect: false })] }),
      row({ attempts: [attempt({ isCorrect: false })] }),
    ];
    expect(computeStats(rows, { includeRetries: false }).accuracy).toBeCloseTo(0.5);
  });

  it('buckets by week and sorts oldest week first', () => {
    const rows = [
      row({ attempts: [attempt({ createdAt: MON, isCorrect: true })] }),
      row({ attempts: [attempt({ createdAt: MON + 8 * DAY, isCorrect: false })] }),
    ];
    const weeks = computeStats(rows, { includeRetries: false }).byWeek;
    expect(weeks.map((w) => w.weekStart)).toEqual([MON, MON + 7 * DAY]);
    expect(weeks[0]).toMatchObject({ total: 1, correct: 1 });
  });

  it('ranks topics by wrong count, most missed first', () => {
    const grammar = { questionId: 'q', correctAnswer: 'B', explanation: 'e', strategy: 's',
      topic: 'gerund vs infinitive', topicCategory: 'grammar' as const };
    const vocab = { ...grammar, topic: 'shipping vocabulary', topicCategory: 'vocabulary' as const };

    const rows = [
      row({ analysis: grammar, attempts: [attempt({ isCorrect: false })] }),
      row({ analysis: grammar, attempts: [attempt({ isCorrect: false })] }),
      row({ analysis: grammar, attempts: [attempt({ isCorrect: true })] }),
      row({ analysis: vocab, attempts: [attempt({ isCorrect: false })] }),
    ];
    const top = computeStats(rows, { includeRetries: false }).topMissedTopics;
    expect(top[0]).toEqual({ topic: 'gerund vs infinitive', wrong: 2, total: 3 });
    expect(top[1]).toEqual({ topic: 'shipping vocabulary', wrong: 1, total: 1 });
  });

  it('omits topics that were never missed', () => {
    const analysis = { questionId: 'q', correctAnswer: 'B', explanation: 'e', strategy: 's',
      topic: 'always right', topicCategory: 'grammar' as const };
    const rows = [row({ analysis, attempts: [attempt({ isCorrect: true })] })];
    expect(computeStats(rows, { includeRetries: false }).topMissedTopics).toEqual([]);
  });

  it('counts error tags per question, not per attempt', () => {
    const rows = [
      row({ errorTags: ['no_vocab', 'misread'], attempts: [attempt({ isCorrect: false })] }),
      row({ errorTags: ['no_vocab'], attempts: [attempt({ isCorrect: false })] }),
    ];
    const counts = computeStats(rows, { includeRetries: false }).errorTagCounts;
    expect(counts[0]).toEqual({ tag: 'no_vocab', count: 2 });
    expect(counts).toContainEqual({ tag: 'misread', count: 1 });
  });

  it('breaks accuracy down by TOEIC part and skips unlabelled questions', () => {
    const withPart = (part: 5 | 7, isCorrect: boolean) => row({
      question: { id: 'q', sessionId: 's', order: 1, stem: 'x', imageIds: [],
        choices: [{ label: 'A', text: 'a' }], toeicPart: part },
      attempts: [attempt({ isCorrect })],
    });
    const rows = [withPart(5, true), withPart(5, false), withPart(7, true),
      row({ attempts: [attempt({ isCorrect: false })] })];
    const byPart = computeStats(rows, { includeRetries: false }).byPart;
    expect(byPart).toEqual([
      { part: 5, total: 2, correct: 1 },
      { part: 7, total: 1, correct: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/shared/storage/stats.test.ts`
Expected: FAIL — `Cannot find module './stats'`

- [ ] **Step 3: Implement**

```ts
import type { Attempt, ErrorTag } from '../types';
import type { HistoryRow } from './queries';

const DAY = 86_400_000;

export interface StatsOptions {
  includeRetries: boolean;
}

export interface WeekBucket {
  weekStart: number;
  total: number;
  correct: number;
}

export interface TopicStat {
  topic: string;
  wrong: number;
  total: number;
}

export interface PartStat {
  part: number;
  total: number;
  correct: number;
}

export interface Stats {
  total: number;
  correct: number;
  accuracy: number; // 0..1, and 0 when there is nothing to divide
  byWeek: WeekBucket[];
  topMissedTopics: TopicStat[];
  errorTagCounts: { tag: ErrorTag; count: number }[];
  byPart: PartStat[];
}

/** Monday 00:00 UTC of the week containing `ts`. */
export function startOfWeek(ts: number): number {
  const date = new Date(ts);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const dayOfWeek = new Date(midnight).getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return midnight - daysSinceMonday * DAY;
}

function countedAttempts(row: HistoryRow, opts: StatsOptions): Attempt[] {
  return opts.includeRetries ? row.attempts : row.attempts.filter((a) => !a.isRetry);
}

export function computeStats(rows: HistoryRow[], opts: StatsOptions): Stats {
  let total = 0;
  let correct = 0;

  const weeks = new Map<number, WeekBucket>();
  const topics = new Map<string, TopicStat>();
  const tags = new Map<ErrorTag, number>();
  const parts = new Map<number, PartStat>();

  for (const row of rows) {
    const attempts = countedAttempts(row, opts);

    for (const attempt of attempts) {
      total += 1;
      if (attempt.isCorrect) correct += 1;

      const weekStart = startOfWeek(attempt.createdAt);
      const week = weeks.get(weekStart) ?? { weekStart, total: 0, correct: 0 };
      week.total += 1;
      if (attempt.isCorrect) week.correct += 1;
      weeks.set(weekStart, week);

      const topicName = row.analysis?.topic;
      if (topicName) {
        const topic = topics.get(topicName) ?? { topic: topicName, wrong: 0, total: 0 };
        topic.total += 1;
        if (!attempt.isCorrect) topic.wrong += 1;
        topics.set(topicName, topic);
      }

      const partNumber = row.question.toeicPart;
      if (partNumber != null) {
        const part = parts.get(partNumber) ?? { part: partNumber, total: 0, correct: 0 };
        part.total += 1;
        if (attempt.isCorrect) part.correct += 1;
        parts.set(partNumber, part);
      }
    }

    // Tags describe the question, not each attempt, so they are counted once.
    if (attempts.length > 0) {
      for (const tag of row.errorTags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
    }
  }

  return {
    total,
    correct,
    accuracy: total === 0 ? 0 : correct / total,
    byWeek: [...weeks.values()].sort((a, b) => a.weekStart - b.weekStart),
    topMissedTopics: [...topics.values()]
      .filter((t) => t.wrong > 0)
      .sort((a, b) => b.wrong - a.wrong || a.topic.localeCompare(b.topic)),
    errorTagCounts: [...tags.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count),
    byPart: [...parts.values()].sort((a, b) => a.part - b.part),
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/shared/storage/stats.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 5: Commit**

```bash
git add src/shared/storage/stats.ts src/shared/storage/stats.test.ts
git commit -m "feat: add pure statistics over attempt history

First attempts only by default so retries cannot inflate the numbers."
```

---

## Task 3: Weakness summary prompt and its streaming port

**Files:**
- Create: `src/ai/prompts/weakness.ts`
- Modify: `src/background/aiRunner.ts`, `src/background/index.ts`, `src/shared/messages.ts`
- Test: `src/ai/prompts/weakness.test.ts`, `src/background/weakness.test.ts`

**Interfaces:**
- Consumes: `Stats`; `S`; `createProvider`; `getSettings`.
- Produces: `buildWeaknessPrompt({ language, stats })`; `runWeaknessSummary(stats, signal)` async generator; `PORT_WEAKNESS`; `WeaknessEvent`.

- [ ] **Step 1: Write the failing tests**

`src/ai/prompts/weakness.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildWeaknessPrompt } from './weakness';
import type { Stats } from '../../shared/storage/stats';

const stats: Stats = {
  total: 50, correct: 34, accuracy: 0.68,
  byWeek: [{ weekStart: Date.UTC(2026, 0, 5), total: 50, correct: 34 }],
  topMissedTopics: [
    { topic: 'gerund vs infinitive', wrong: 6, total: 8 },
    { topic: 'shipping vocabulary', wrong: 4, total: 5 },
  ],
  errorTagCounts: [{ tag: 'no_vocab', count: 7 }, { tag: 'time_pressure', count: 3 }],
  byPart: [{ part: 5, total: 30, correct: 22 }, { part: 7, total: 20, correct: 12 }],
};

describe('buildWeaknessPrompt', () => {
  it('asks for a small number of concrete bullets', () => {
    expect(buildWeaknessPrompt({ language: 'vi', stats }).system).toMatch(/3.{0,10}5/);
  });

  it('passes the aggregated numbers through', () => {
    const { user } = buildWeaknessPrompt({ language: 'vi', stats });
    expect(user).toContain('gerund vs infinitive');
    expect(user).toContain('no_vocab');
    expect(user).toMatch(/"accuracy": 0.68/);
  });

  it('never carries question text — only counts', () => {
    const { user } = buildWeaknessPrompt({ language: 'vi', stats });
    expect(user).not.toMatch(/stem|choices|explanation/);
  });

  it('honours the language setting', () => {
    expect(buildWeaknessPrompt({ language: 'en', stats }).system).toMatch(/English/);
  });
});
```

`src/background/weakness.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeMock } from '../test/chromeMock';
import { DEFAULT_SETTINGS, saveSettings } from '../shared/storage/settings';

const stream = vi.fn();
vi.mock('../ai/index', () => ({ createProvider: () => ({ complete: vi.fn(), stream }) }));

const { runWeaknessSummary } = await import('./aiRunner');
const mock = installChromeMock();

const stats = {
  total: 10, correct: 5, accuracy: 0.5, byWeek: [],
  topMissedTopics: [], errorTagCounts: [], byPart: [],
};

beforeEach(async () => {
  mock.reset();
  stream.mockReset();
  await saveSettings({ ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k', model: 'm' } });
});

describe('runWeaknessSummary', () => {
  it('streams deltas then a done event carrying the full text', async () => {
    stream.mockImplementation(async function* () {
      yield { delta: 'Ôn ' };
      yield { delta: 'gerund.' };
    });

    const events = [];
    for await (const e of runWeaknessSummary(stats)) events.push(e);

    expect(events).toEqual([
      { type: 'delta', text: 'Ôn ' },
      { type: 'delta', text: 'gerund.' },
      { type: 'done', text: 'Ôn gerund.' },
    ]);
  });

  it('emits an error event instead of throwing when unconfigured', async () => {
    mock.reset();
    const events = [];
    for await (const e of runWeaknessSummary(stats)) events.push(e);
    expect(events).toEqual([{ type: 'error', error: { code: 'NO_API_KEY', detail: undefined, raw: undefined } }]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ai/prompts/weakness.test.ts src/background/weakness.test.ts`
Expected: FAIL — `Cannot find module './weakness'`

- [ ] **Step 3: Implement `src/ai/prompts/weakness.ts`**

```ts
import type { Stats } from '../../shared/storage/stats';
import type { ExplanationLanguage } from '../../shared/types';
import { languageInstruction } from './language';

export interface WeaknessPromptInput {
  language: ExplanationLanguage;
  stats: Stats;
}

export function buildWeaknessPrompt(input: WeaknessPromptInput): { system: string; user: string } {
  const system = [
    'You advise a TOEIC learner on what to study next, based only on their own practice statistics.',
    '',
    'Rules:',
    '- Return 3 to 5 bullets, ordered by what would raise their score fastest.',
    '- Each bullet names the specific weakness and one concrete action. Not "study grammar" but "drill gerund vs infinitive after verbs like avoid, consider, suggest".',
    '- If the mistake-reason counts point at exam technique rather than knowledge (time pressure, misclicks, skim-reading), say so and address the technique.',
    '- Do not invent weaknesses the numbers do not support, and do not pad to reach five bullets.',
    '- No preamble and no closing encouragement. Bullets only.',
    '',
    languageInstruction(input.language),
  ].join('\n');

  // Aggregates only — the question text is never resent.
  const user = JSON.stringify(
    {
      accuracy: Number(input.stats.accuracy.toFixed(2)),
      questionsAttempted: input.stats.total,
      topMissedTopics: input.stats.topMissedTopics.slice(0, 8),
      mistakeReasonCounts: input.stats.errorTagCounts,
      accuracyByToeicPart: input.stats.byPart,
    },
    null,
    2,
  );

  return { system, user };
}
```

- [ ] **Step 4: Add `runWeaknessSummary` to `src/background/aiRunner.ts`**

```ts
import { buildWeaknessPrompt } from '../ai/prompts/weakness';
import type { Stats } from '../shared/storage/stats';
import type { WeaknessEvent } from '../shared/messages';

export async function* runWeaknessSummary(
  stats: Stats,
  signal: AbortSignal = new AbortController().signal,
): AsyncGenerator<WeaknessEvent> {
  try {
    const settings = await requireSettings();
    const provider = createProvider(settings.ai);
    const { system, user } = buildWeaknessPrompt({ language: settings.explanationLanguage, stats });

    let full = '';
    for await (const chunk of provider.stream(
      { system, userParts: [{ type: 'text', text: user }], json: false },
      signal,
    )) {
      full += chunk.delta;
      yield { type: 'delta', text: chunk.delta };
    }

    yield { type: 'done', text: full };
  } catch (e) {
    yield { type: 'error', error: serializeError(e) };
  }
}
```

- [ ] **Step 5: Add the port contract to `src/shared/messages.ts`**

```ts
export const PORT_WEAKNESS = 'weakness';

export type WeaknessEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string }
  | { type: 'error'; error: SerializedError };
```

And handle it in `src/background/index.ts`, alongside the existing ports:

```ts
  if (port.name === PORT_WEAKNESS) {
    const controller = new AbortController();
    port.onDisconnect.addListener(() => controller.abort());
    port.onMessage.addListener(async (stats) => {
      for await (const event of runWeaknessSummary(stats, controller.signal)) {
        try {
          port.postMessage(event);
        } catch {
          return;
        }
      }
    });
    return;
  }
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `npx vitest run src/ai/prompts/weakness.test.ts src/background/weakness.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 7: Commit**

```bash
git add src/ai/prompts/weakness.ts src/background src/shared/messages.ts
git commit -m "feat: add weakness summary prompt fed only aggregated statistics"
```

---

## Task 4: Three-tab options shell

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/shared/strings.ts`
- Test: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: `Settings` view from Plan 1; `History`, `Stats` views (built in Tasks 5 and 7 — this task creates them as real, minimal components that the later tasks fill out, not stubs: each renders its own data from Task 1 and 2 and is independently useful).

To avoid a forward reference, this task ships `History` and `Stats` as **complete minimal views** — a plain list and a headline accuracy figure. Tasks 5 and 7 extend them. Nothing here is a placeholder.

- [ ] **Step 1: Add the strings**

```ts
  tabs: {
    history: 'Lịch sử',
    stats: 'Thống kê',
    settings: 'Cài đặt',
  },

  history: {
    empty: 'Chưa có câu hỏi nào được lưu.',
    countLabel: (n: number) => `${n} câu`,
  },

  stats: {
    accuracy: 'Tỷ lệ đúng',
    attempted: 'Số câu đã làm',
    empty: 'Chưa đủ dữ liệu để thống kê.',
  },
```

- [ ] **Step 2: Write the failing test**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installChromeMock } from '../test/chromeMock';
import { S } from '../shared/strings';

vi.mock('../shared/messages', () => ({ sendRequest: vi.fn() }));
vi.mock('../shared/storage/queries', () => ({ listHistory: async () => [] }));

const { App } = await import('./App');
const mock = installChromeMock();
beforeEach(() => mock.reset());

describe('options shell', () => {
  it('opens on the history tab', async () => {
    render(<App />);
    expect(await screen.findByText(S.history.empty)).toBeInTheDocument();
  });

  it('switches tabs on click', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: S.tabs.settings }));
    expect(await screen.findByText(S.settings.title)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: S.tabs.stats }));
    expect(await screen.findByText(S.stats.empty)).toBeInTheDocument();
  });

  it('marks exactly one tab selected', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: S.tabs.stats }));
    const selected = screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent(S.tabs.stats);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/app/App.test.tsx`
Expected: FAIL — no tabs are rendered

- [ ] **Step 4: Implement**

`src/app/App.tsx`:

```tsx
import { useState } from 'react';
import { S } from '../shared/strings';
import { History } from './views/History';
import { Settings } from './views/Settings';
import { Stats } from './views/Stats';

type Tab = 'history' | 'stats' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'history', label: S.tabs.history },
  { id: 'stats', label: S.tabs.stats },
  { id: 'settings', label: S.tabs.settings },
];

export function App() {
  const [tab, setTab] = useState<Tab>('history');

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div role="tablist" className="mb-6 flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`px-4 py-2 text-sm ${
              tab === t.id ? 'border-b-2 border-blue-600 font-medium text-blue-700' : 'text-gray-600'
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'history' && <History />}
      {tab === 'stats' && <Stats />}
      {tab === 'settings' && <Settings />}
    </div>
  );
}
```

`src/app/views/History.tsx` — minimal but complete; Task 5 adds filters and detail:

```tsx
import { useEffect, useState } from 'react';
import { type HistoryRow, listHistory } from '../../shared/storage/queries';
import { S } from '../../shared/strings';

export function History() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);

  useEffect(() => { void listHistory().then(setRows); }, []);

  if (rows == null) return null;
  if (rows.length === 0) return <p className="text-sm text-gray-600">{S.history.empty}</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">{S.history.countLabel(rows.length)}</p>
      {rows.map((row) => (
        <div key={row.question.id} className="rounded border p-3 text-sm">
          <span className={row.firstAttempt?.isCorrect ? 'text-green-700' : 'text-red-700'}>
            {row.firstAttempt?.isCorrect ? S.result.correct : S.result.wrong}
          </span>
          <span className="ml-2">{row.question.stem}</span>
        </div>
      ))}
    </div>
  );
}
```

`src/app/views/Stats.tsx` — minimal but complete; Task 7 adds the breakdowns:

```tsx
import { useEffect, useState } from 'react';
import { listHistory } from '../../shared/storage/queries';
import { type Stats as StatsData, computeStats } from '../../shared/storage/stats';
import { S } from '../../shared/strings';

export function Stats() {
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    void listHistory().then((rows) => setStats(computeStats(rows, { includeRetries: false })));
  }, []);

  if (stats == null) return null;
  if (stats.total === 0) return <p className="text-sm text-gray-600">{S.stats.empty}</p>;

  return (
    <div className="flex gap-8">
      <div>
        <p className="text-xs text-gray-500">{S.stats.accuracy}</p>
        <p className="text-2xl font-semibold">{Math.round(stats.accuracy * 100)}%</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">{S.stats.attempted}</p>
        <p className="text-2xl font-semibold">{stats.total}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/app/App.test.tsx`
Expected: PASS, 3 tests

- [ ] **Step 6: Commit**

```bash
git add src/app src/shared/strings.ts
git commit -m "feat: turn the options page into a three-tab shell with history and stats"
```

---

## Task 5: History filters and detail

**Files:**
- Modify: `src/app/views/History.tsx`
- Create: `src/app/views/QuestionDetail.tsx`
- Modify: `src/shared/strings.ts`
- Test: `src/app/views/History.test.tsx`

**Interfaces:**
- Consumes: `listHistory`, `applyFilter`, `HistoryFilter`; `getImage` from history storage.
- Produces: the filter bar and `QuestionDetail` with props `{ row, onRetry }` (retry wired in Task 6).

- [ ] **Step 1: Add the strings**

```ts
  history: {
    // …existing keys…
    searchPlaceholder: 'Tìm trong đề…',
    outcomeLabel: 'Kết quả',
    allOutcomes: 'Tất cả',
    onlyCorrect: 'Chỉ câu đúng',
    onlyWrong: 'Chỉ câu sai',
    allParts: 'Mọi part',
    part: (n: number) => `Part ${n}`,
    allTopics: 'Mọi chủ điểm',
    allTags: 'Mọi lý do sai',
    clearFilters: 'Xoá bộ lọc',
    noMatch: 'Không có câu nào khớp bộ lọc.',
    yourAnswer: 'Bạn chọn',
    attemptCount: (n: number) => `${n} lần làm`,
    close: 'Đóng',
  },
```

- [ ] **Step 2: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { S } from '../../shared/strings';
import type { HistoryRow } from '../../shared/storage/queries';

const rows: HistoryRow[] = [
  {
    question: { id: 'q1', sessionId: 's', order: 1, stem: 'The manager submits it', imageIds: [],
      choices: [{ label: 'A', text: 'a' }], toeicPart: 5 },
    analysis: { questionId: 'q1', correctAnswer: 'B', explanation: 'e', strategy: 's',
      topic: 'subject-verb agreement', topicCategory: 'grammar' },
    attempts: [{ id: 'a1', questionId: 'q1', userAnswer: 'A', isCorrect: false, createdAt: 1000, isRetry: false }],
    firstAttempt: { id: 'a1', questionId: 'q1', userAnswer: 'A', isCorrect: false, createdAt: 1000, isRetry: false },
    latestAttempt: { id: 'a1', questionId: 'q1', userAnswer: 'A', isCorrect: false, createdAt: 1000, isRetry: false },
    errorTags: ['no_grammar'],
  },
  {
    question: { id: 'q2', sessionId: 's', order: 2, stem: 'Please contact us', imageIds: [],
      choices: [{ label: 'A', text: 'a' }], toeicPart: 7 },
    analysis: { questionId: 'q2', correctAnswer: 'A', explanation: 'e2', strategy: 's2',
      topic: 'business vocabulary', topicCategory: 'vocabulary' },
    attempts: [{ id: 'a2', questionId: 'q2', userAnswer: 'A', isCorrect: true, createdAt: 2000, isRetry: false }],
    firstAttempt: { id: 'a2', questionId: 'q2', userAnswer: 'A', isCorrect: true, createdAt: 2000, isRetry: false },
    latestAttempt: { id: 'a2', questionId: 'q2', userAnswer: 'A', isCorrect: true, createdAt: 2000, isRetry: false },
    errorTags: [],
  },
];

vi.mock('../../shared/storage/queries', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listHistory: async () => rows,
}));
vi.mock('../../shared/storage/history', () => ({ getImage: async () => undefined, recordAttempt: vi.fn() }));

const { History } = await import('./History');

describe('History view', () => {
  it('lists every question by default', async () => {
    render(<History />);
    expect(await screen.findByText(/The manager submits it/)).toBeInTheDocument();
    expect(screen.getByText(/Please contact us/)).toBeInTheDocument();
  });

  it('filters to wrong answers only', async () => {
    render(<History />);
    await screen.findByText(/The manager submits it/);
    await userEvent.selectOptions(screen.getByLabelText(S.history.outcomeLabel), 'wrong');
    expect(screen.queryByText(/Please contact us/)).not.toBeInTheDocument();
  });

  it('searches the question text', async () => {
    render(<History />);
    await screen.findByText(/The manager submits it/);
    await userEvent.type(screen.getByPlaceholderText(S.history.searchPlaceholder), 'contact');
    expect(screen.queryByText(/The manager submits it/)).not.toBeInTheDocument();
    expect(screen.getByText(/Please contact us/)).toBeInTheDocument();
  });

  it('offers only the topics actually present', async () => {
    render(<History />);
    await screen.findByText(/The manager submits it/);
    const options = Array.from(screen.getByLabelText(S.history.allTopics).querySelectorAll('option'));
    expect(options.map((o) => o.textContent)).toEqual([
      S.history.allTopics, 'business vocabulary', 'subject-verb agreement',
    ]);
  });

  it('says so when nothing matches', async () => {
    render(<History />);
    await screen.findByText(/The manager submits it/);
    await userEvent.type(screen.getByPlaceholderText(S.history.searchPlaceholder), 'zzzz');
    expect(screen.getByText(S.history.noMatch)).toBeInTheDocument();
  });

  it('clears every filter at once', async () => {
    render(<History />);
    await screen.findByText(/The manager submits it/);
    await userEvent.type(screen.getByPlaceholderText(S.history.searchPlaceholder), 'zzzz');
    await userEvent.click(screen.getByRole('button', { name: S.history.clearFilters }));
    expect(screen.getByText(/The manager submits it/)).toBeInTheDocument();
  });

  it('opens the detail view showing the explanation and the recorded answer', async () => {
    render(<History />);
    await userEvent.click(await screen.findByText(/The manager submits it/));
    expect(await screen.findByText('e')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${S.history.yourAnswer}.*A`))).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/app/views/History.test.tsx`
Expected: FAIL — no filter controls exist

- [ ] **Step 4: Implement `src/app/views/QuestionDetail.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { getImage } from '../../shared/storage/history';
import type { HistoryRow } from '../../shared/storage/queries';
import { S } from '../../shared/strings';

function ImageStrip({ ids }: { ids: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    let revoked: string[] = [];
    void Promise.all(ids.map(getImage)).then((blobs) => {
      revoked = blobs.filter((b): b is Blob => b != null).map((b) => URL.createObjectURL(b));
      setUrls(revoked);
    });
    return () => revoked.forEach(URL.revokeObjectURL);
  }, [ids]);

  if (urls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((url) => (
        <img key={url} src={url} alt="" className="max-h-48 rounded border" />
      ))}
    </div>
  );
}

export function QuestionDetail({
  row, onClose, onAttemptRecorded,
}: {
  row: HistoryRow;
  onClose: () => void;
  /** Task 6 calls this after a retry so the list can refresh. Unused until then. */
  onAttemptRecorded: () => void;
}) {
  void onAttemptRecorded;
  const { question, analysis, firstAttempt, attempts } = row;

  return (
    <div className="space-y-3 rounded border bg-white p-4">
      <ImageStrip ids={question.imageIds} />

      {question.passage && (
        <p className="text-xs whitespace-pre-wrap text-gray-500">{question.passage}</p>
      )}
      <p className="text-sm">{question.stem}</p>

      <div className="text-sm text-gray-700">
        {question.choices.map((c) => (
          <div key={c.label} className={c.label === analysis?.correctAnswer ? 'font-medium' : ''}>
            {c.label}. {c.text}
          </div>
        ))}
      </div>

      {firstAttempt && (
        <p className="text-sm">
          {S.history.yourAnswer} {firstAttempt.userAnswer ?? S.review.notAttempted} ·{' '}
          {S.result.correctAnswer} {analysis?.correctAnswer}
        </p>
      )}

      {analysis && (
        <>
          <div className="text-sm">
            <p className="font-medium">{S.result.explanation}</p>
            <p className="whitespace-pre-wrap text-gray-700">{analysis.explanation}</p>
          </div>
          <div className="text-sm">
            <p className="font-medium">{S.result.strategy}</p>
            <p className="whitespace-pre-wrap text-gray-700">{analysis.strategy}</p>
          </div>
          <p className="text-xs text-gray-400">{analysis.topic}</p>
        </>
      )}

      <p className="text-xs text-gray-500">{S.history.attemptCount(attempts.length)}</p>

      <button className="rounded border px-3 py-1 text-sm" onClick={onClose}>
        {S.history.close}
      </button>
    </div>
  );
}
```

No retry button yet — Task 6 adds it together with the panel it opens, so this task has no forward reference to a component that does not exist.

- [ ] **Step 5: Rewrite `src/app/views/History.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { ERROR_TAG_ORDER, S } from '../../shared/strings';
import {
  type HistoryFilter, type HistoryRow, applyFilter, listHistory,
} from '../../shared/storage/queries';
import type { ErrorTag } from '../../shared/types';
import { QuestionDetail } from './QuestionDetail';

const EMPTY: HistoryFilter = {};

export function History() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY);
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = () => listHistory().then(setRows);
  useEffect(() => { void reload(); }, []);

  const topics = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.analysis?.topic).filter(Boolean) as string[])].sort(),
    [rows],
  );
  const parts = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.question.toeicPart).filter(Boolean) as number[])].sort(),
    [rows],
  );

  if (rows == null) return null;
  if (rows.length === 0) return <p className="text-sm text-gray-600">{S.history.empty}</p>;

  const visible = applyFilter(rows, filter);
  const open = visible.find((r) => r.question.id === openId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="rounded border p-2 text-sm"
          placeholder={S.history.searchPlaceholder}
          value={filter.search ?? ''}
          onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value || undefined }))}
        />

        <select
          aria-label={S.history.outcomeLabel}
          className="rounded border p-2 text-sm"
          value={filter.outcome ?? ''}
          onChange={(e) =>
            setFilter((f) => ({ ...f, outcome: (e.target.value || undefined) as HistoryFilter['outcome'] }))
          }
        >
          <option value="">{S.history.allOutcomes}</option>
          <option value="correct">{S.history.onlyCorrect}</option>
          <option value="wrong">{S.history.onlyWrong}</option>
        </select>

        <select
          aria-label={S.history.allParts}
          className="rounded border p-2 text-sm"
          value={filter.toeicPart ?? ''}
          onChange={(e) =>
            setFilter((f) => ({ ...f, toeicPart: e.target.value ? Number(e.target.value) : undefined }))
          }
        >
          <option value="">{S.history.allParts}</option>
          {parts.map((p) => (
            <option key={p} value={p}>{S.history.part(p)}</option>
          ))}
        </select>

        <select
          aria-label={S.history.allTopics}
          className="rounded border p-2 text-sm"
          value={filter.topic ?? ''}
          onChange={(e) => setFilter((f) => ({ ...f, topic: e.target.value || undefined }))}
        >
          <option value="">{S.history.allTopics}</option>
          {topics.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          aria-label={S.history.allTags}
          className="rounded border p-2 text-sm"
          value={filter.errorTag ?? ''}
          onChange={(e) =>
            setFilter((f) => ({ ...f, errorTag: (e.target.value || undefined) as ErrorTag | undefined }))
          }
        >
          <option value="">{S.history.allTags}</option>
          {ERROR_TAG_ORDER.map((tag) => (
            <option key={tag} value={tag}>{S.errorTag[tag]}</option>
          ))}
        </select>

        <button className="rounded border px-3 py-2 text-sm" onClick={() => setFilter(EMPTY)}>
          {S.history.clearFilters}
        </button>
      </div>

      <p className="text-xs text-gray-500">{S.history.countLabel(visible.length)}</p>

      {visible.length === 0 && <p className="text-sm text-gray-600">{S.history.noMatch}</p>}

      {open && (
        <QuestionDetail
          row={open}
          onClose={() => setOpenId(null)}
          onAttemptRecorded={() => void reload()}
        />
      )}

      <div className="space-y-2">
        {visible.map((row) => (
          <button
            key={row.question.id}
            className="block w-full rounded border p-3 text-left text-sm hover:bg-gray-50"
            onClick={() => setOpenId(row.question.id)}
          >
            <span className={row.firstAttempt?.isCorrect ? 'text-green-700' : 'text-red-700'}>
              {row.firstAttempt?.isCorrect ? S.result.correct : S.result.wrong}
            </span>
            <span className="ml-2">{row.question.stem}</span>
            {row.analysis && (
              <span className="ml-2 text-xs text-gray-400">{row.analysis.topic}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `npx vitest run src/app/views/History.test.tsx`
Expected: PASS, 7 tests

- [ ] **Step 7: Commit**

```bash
git add src/app/views src/shared/strings.ts
git commit -m "feat: add history filters, search and question detail with images"
```

---

## Task 6: Retry this question

**Files:**
- Create: `src/app/views/RetryPanel.tsx`
- Modify: `src/app/views/QuestionDetail.tsx`, `src/app/views/History.tsx`
- Test: `src/app/views/RetryPanel.test.tsx`

**Interfaces:**
- Consumes: `recordAttempt` from history storage; `HistoryRow`.
- Produces: `RetryPanel` with props `{ row, onDone }`.

The rule this task must not break: **no AI call.** The test asserts it.

- [ ] **Step 1: Add the strings**

```ts
  history: {
    // …existing keys…
    retry: 'Làm lại câu này',
    retryHint: 'Chọn lại đáp án. Đáp án đúng đang được ẩn.',
    retrySubmit: 'Kiểm tra',
    retryCorrect: 'Chính xác. Lần đầu bạn đã sai câu này.',
    retryStillWrong: 'Vẫn chưa đúng. Đọc lại phần giải thích bên dưới.',
    retryAgainRight: 'Đúng, giống lần trước.',
  },
```

- [ ] **Step 2: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { S } from '../../shared/strings';
import type { HistoryRow } from '../../shared/storage/queries';

const recordAttempt = vi.fn().mockResolvedValue({ id: 'new' });
vi.mock('../../shared/storage/history', () => ({
  recordAttempt: (...a: unknown[]) => recordAttempt(...a),
  getImage: async () => undefined,
}));

const sendRequest = vi.fn();
vi.mock('../../shared/messages', () => ({ sendRequest: (...a: unknown[]) => sendRequest(...a) }));

const { RetryPanel } = await import('./RetryPanel');

const row: HistoryRow = {
  question: { id: 'q1', sessionId: 's', order: 1, stem: 'stem', imageIds: [],
    choices: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }] },
  analysis: { questionId: 'q1', correctAnswer: 'B', explanation: 'e', strategy: 's',
    topic: 't', topicCategory: 'grammar' },
  attempts: [{ id: 'a1', questionId: 'q1', userAnswer: 'A', isCorrect: false, createdAt: 1, isRetry: false }],
  firstAttempt: { id: 'a1', questionId: 'q1', userAnswer: 'A', isCorrect: false, createdAt: 1, isRetry: false },
  latestAttempt: { id: 'a1', questionId: 'q1', userAnswer: 'A', isCorrect: false, createdAt: 1, isRetry: false },
  errorTags: [],
};

describe('RetryPanel', () => {
  it('hides the correct answer until the user commits', () => {
    render(<RetryPanel row={row} onDone={vi.fn()} />);
    expect(screen.getByText(S.history.retryHint)).toBeInTheDocument();
    expect(screen.queryByText(S.result.correctAnswer)).not.toBeInTheDocument();
  });

  it('records an attempt marked as a retry', async () => {
    render(<RetryPanel row={row} onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    await userEvent.click(screen.getByRole('button', { name: S.history.retrySubmit }));
    expect(recordAttempt).toHaveBeenCalledWith({
      questionId: 'q1', userAnswer: 'B', correctAnswer: 'B', isRetry: true,
    });
  });

  it('never calls the AI — the analysis already exists', async () => {
    render(<RetryPanel row={row} onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    await userEvent.click(screen.getByRole('button', { name: S.history.retrySubmit }));
    expect(sendRequest).not.toHaveBeenCalled();
  });

  it('says the weakness looks fixed when a previously-wrong question is now right', async () => {
    render(<RetryPanel row={row} onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    await userEvent.click(screen.getByRole('button', { name: S.history.retrySubmit }));
    expect(await screen.findByText(S.history.retryCorrect)).toBeInTheDocument();
  });

  it('says it is still wrong when the user misses again', async () => {
    render(<RetryPanel row={row} onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'A' }));
    await userEvent.click(screen.getByRole('button', { name: S.history.retrySubmit }));
    expect(await screen.findByText(S.history.retryStillWrong)).toBeInTheDocument();
  });

  it('will not submit without a choice', () => {
    render(<RetryPanel row={row} onDone={vi.fn()} />);
    expect(screen.getByRole('button', { name: S.history.retrySubmit })).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/app/views/RetryPanel.test.tsx`
Expected: FAIL — `Cannot find module './RetryPanel'`

- [ ] **Step 4: Implement `src/app/views/RetryPanel.tsx`**

```tsx
import { useState } from 'react';
import { recordAttempt } from '../../shared/storage/history';
import type { HistoryRow } from '../../shared/storage/queries';
import { S } from '../../shared/strings';

export function RetryPanel({ row, onDone }: { row: HistoryRow; onDone: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);

  const correctAnswer = row.analysis?.correctAnswer;

  async function submit() {
    if (!picked || !correctAnswer) return;

    // No AI call: the analysis is already stored, so a retry is free.
    await recordAttempt({
      questionId: row.question.id,
      userAnswer: picked,
      correctAnswer,
      isRetry: true,
    });

    const nowCorrect = picked === correctAnswer;
    const wasCorrect = row.firstAttempt?.isCorrect === true;

    setVerdict(
      nowCorrect
        ? wasCorrect
          ? S.history.retryAgainRight
          : S.history.retryCorrect
        : S.history.retryStillWrong,
    );
    onDone();
  }

  if (verdict) return <p className="text-sm font-medium">{verdict}</p>;

  return (
    <div className="space-y-2 rounded bg-gray-50 p-3">
      <p className="text-xs text-gray-600">{S.history.retryHint}</p>
      <div className="flex flex-wrap gap-2">
        {row.question.choices.map((c) => (
          <button
            key={c.label}
            aria-pressed={picked === c.label}
            className={`rounded border px-3 py-1 text-sm ${
              picked === c.label ? 'border-blue-600 bg-blue-600 text-white' : ''
            }`}
            onClick={() => setPicked(c.label)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <button
        className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        disabled={!picked}
        onClick={() => void submit()}
      >
        {S.history.retrySubmit}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Wire it into `QuestionDetail`**

Three changes in `QuestionDetail.tsx`. `History.tsx` already passes `onAttemptRecorded`, so it needs no edit.

First, add the state and drop the `void onAttemptRecorded;` line from Task 5:

```tsx
  const [retrying, setRetrying] = useState(false);
```

Second, hide everything that would give the answer away while a retry is in progress — the user must not be able to read the answer off the screen they are being tested on. Change the choice highlight and the recorded-answer line:

```tsx
      <div className="text-sm text-gray-700">
        {question.choices.map((c) => (
          <div
            key={c.label}
            className={!retrying && c.label === analysis?.correctAnswer ? 'font-medium' : ''}
          >
            {c.label}. {c.text}
          </div>
        ))}
      </div>

      {!retrying && firstAttempt && (
        <p className="text-sm">
          {S.history.yourAnswer} {firstAttempt.userAnswer ?? S.review.notAttempted} ·{' '}
          {S.result.correctAnswer} {analysis?.correctAnswer}
        </p>
      )}
```

The explanation block stays visible — it is the point of the retry that you can reread it.

Third, add the retry control above the close button:

```tsx
      {analysis && (retrying ? (
        <RetryPanel row={row} onDone={onAttemptRecorded} />
      ) : (
        <button className="rounded border px-3 py-1 text-sm" onClick={() => setRetrying(true)}>
          {S.history.retry}
        </button>
      ))}
```

Guarding on `analysis` matters: a question with no stored analysis has no correct answer to check against, so retrying it is meaningless.

- [ ] **Step 6: Run the whole app suite**

Run: `npx vitest run src/app`
Expected: PASS, every app suite green

- [ ] **Step 7: Commit**

```bash
git add src/app/views src/shared/strings.ts
git commit -m "feat: add free retry that records an attempt without calling the AI"
```

---

## Task 7: Full statistics dashboard

**Files:**
- Create: `src/app/components/StatBar.tsx`
- Modify: `src/app/views/Stats.tsx`, `src/shared/strings.ts`
- Test: `src/app/views/Stats.test.tsx`

**Interfaces:**
- Consumes: `computeStats`, `listHistory`; `PORT_WEAKNESS`, `WeaknessEvent`.
- Produces: the dashboard plus the streamed weakness summary.

- [ ] **Step 1: Add the strings**

```ts
  stats: {
    // …existing keys…
    includeRetries: 'Tính cả lần làm lại',
    byWeek: 'Theo tuần',
    topMissed: 'Chủ điểm sai nhiều nhất',
    reasons: 'Lý do sai',
    byPart: 'Tỷ lệ đúng theo part',
    wrongCount: (wrong: number, total: number) => `sai ${wrong}/${total}`,
    weaknessButton: 'AI tổng kết điểm yếu',
    weaknessRunning: 'Đang tổng kết…',
    weekLabel: (start: number) =>
      new Date(start).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
  },
```

- [ ] **Step 2: Write the failing test**

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { S } from '../../shared/strings';
import type { HistoryRow } from '../../shared/storage/queries';

const attempt = (id: string, questionId: string, isCorrect: boolean, isRetry = false) => ({
  id, questionId, userAnswer: 'A', isCorrect, createdAt: Date.UTC(2026, 0, 5), isRetry,
});

const rows: HistoryRow[] = [
  {
    question: { id: 'q1', sessionId: 's', order: 1, stem: 'x', imageIds: [],
      choices: [{ label: 'A', text: 'a' }], toeicPart: 5 },
    analysis: { questionId: 'q1', correctAnswer: 'B', explanation: 'e', strategy: 's',
      topic: 'gerund vs infinitive', topicCategory: 'grammar' },
    attempts: [attempt('a1', 'q1', false), attempt('a2', 'q1', true, true)],
    firstAttempt: attempt('a1', 'q1', false),
    latestAttempt: attempt('a2', 'q1', true, true),
    errorTags: ['no_grammar'],
  },
];

vi.mock('../../shared/storage/queries', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listHistory: async () => rows,
}));

let emit: (e: unknown) => void = () => {};
const postMessage = vi.fn();

beforeEach(() => {
  postMessage.mockReset();
  (globalThis as any).chrome = {
    runtime: {
      connect: () => ({
        postMessage,
        disconnect: vi.fn(),
        onMessage: { addListener: (fn: (e: unknown) => void) => { emit = fn; } },
        onDisconnect: { addListener: vi.fn() },
      }),
    },
  };
});

const { Stats } = await import('./Stats');

describe('Stats view', () => {
  it('counts first attempts only by default', async () => {
    render(<Stats />);
    expect(await screen.findByText('0%')).toBeInTheDocument();
  });

  it('recounts when retries are included', async () => {
    render(<Stats />);
    await screen.findByText('0%');
    await userEvent.click(screen.getByLabelText(S.stats.includeRetries));
    expect(await screen.findByText('50%')).toBeInTheDocument();
  });

  it('lists the most-missed topics with their counts', async () => {
    render(<Stats />);
    expect(await screen.findByText('gerund vs infinitive')).toBeInTheDocument();
    expect(screen.getByText(S.stats.wrongCount(1, 1))).toBeInTheDocument();
  });

  it('shows the mistake-reason breakdown', async () => {
    render(<Stats />);
    expect(await screen.findByText(S.errorTag.no_grammar)).toBeInTheDocument();
  });

  it('shows accuracy per TOEIC part', async () => {
    render(<Stats />);
    expect(await screen.findByText(S.history.part(5))).toBeInTheDocument();
  });

  it('sends the aggregated stats over the port and streams the summary back', async () => {
    render(<Stats />);
    await screen.findByText('0%');
    await userEvent.click(screen.getByRole('button', { name: S.stats.weaknessButton }));

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ total: 1 }));
    emit({ type: 'delta', text: 'Ôn gerund' });
    expect(await screen.findByText(/Ôn gerund/)).toBeInTheDocument();
  });

  it('surfaces a streaming failure instead of hanging', async () => {
    render(<Stats />);
    await screen.findByText('0%');
    await userEvent.click(screen.getByRole('button', { name: S.stats.weaknessButton }));
    emit({ type: 'error', error: { code: 'NO_API_KEY' } });
    expect(await screen.findByText(/chưa cấu hình API key/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/app/views/Stats.test.tsx`
Expected: FAIL — the retries toggle does not exist

- [ ] **Step 4: Implement `src/app/components/StatBar.tsx`**

```tsx
export function StatBar({ label, value, max, caption }: {
  label: string;
  value: number;
  max: number;
  caption?: string;
}) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-56 shrink-0 truncate">{label}</span>
      <span className="h-2 flex-1 rounded bg-gray-200">
        <span className="block h-2 rounded bg-blue-600" style={{ width: `${pct}%` }} />
      </span>
      {caption && <span className="w-24 shrink-0 text-right text-xs text-gray-500">{caption}</span>}
    </div>
  );
}
```

- [ ] **Step 5: Rewrite `src/app/views/Stats.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { type SerializedError, deserializeError, errorMessage } from '../../shared/errors';
import { PORT_WEAKNESS, type WeaknessEvent } from '../../shared/messages';
import { type HistoryRow, listHistory } from '../../shared/storage/queries';
import { computeStats } from '../../shared/storage/stats';
import { S } from '../../shared/strings';
import { StatBar } from '../components/StatBar';

type Summary =
  | { kind: 'idle' }
  | { kind: 'running'; text: string }
  | { kind: 'done'; text: string }
  | { kind: 'error'; error: SerializedError };

export function Stats() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [includeRetries, setIncludeRetries] = useState(false);
  const [summary, setSummary] = useState<Summary>({ kind: 'idle' });

  useEffect(() => { void listHistory().then(setRows); }, []);

  const stats = useMemo(
    () => (rows ? computeStats(rows, { includeRetries }) : null),
    [rows, includeRetries],
  );

  function summarise() {
    if (!stats) return;
    setSummary({ kind: 'running', text: '' });

    const port = chrome.runtime.connect({ name: PORT_WEAKNESS });
    port.onMessage.addListener((event: WeaknessEvent) => {
      if (event.type === 'delta') {
        setSummary((s) => (s.kind === 'running' ? { kind: 'running', text: s.text + event.text } : s));
      } else if (event.type === 'done') {
        setSummary({ kind: 'done', text: event.text });
        port.disconnect();
      } else {
        setSummary({ kind: 'error', error: event.error });
        port.disconnect();
      }
    });
    port.postMessage(stats);
  }

  if (stats == null) return null;
  if (rows!.length === 0) return <p className="text-sm text-gray-600">{S.stats.empty}</p>;

  const maxWeekTotal = Math.max(1, ...stats.byWeek.map((w) => w.total));
  const maxTagCount = Math.max(1, ...stats.errorTagCounts.map((t) => t.count));

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-8">
        <div>
          <p className="text-xs text-gray-500">{S.stats.accuracy}</p>
          <p className="text-2xl font-semibold">{Math.round(stats.accuracy * 100)}%</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">{S.stats.attempted}</p>
          <p className="text-2xl font-semibold">{stats.total}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeRetries}
            onChange={(e) => setIncludeRetries(e.target.checked)}
          />
          {S.stats.includeRetries}
        </label>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{S.stats.topMissed}</h3>
        {stats.topMissedTopics.slice(0, 10).map((t) => (
          <StatBar
            key={t.topic}
            label={t.topic}
            value={t.wrong}
            max={t.total}
            caption={S.stats.wrongCount(t.wrong, t.total)}
          />
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{S.stats.reasons}</h3>
        {stats.errorTagCounts.map((t) => (
          <StatBar key={t.tag} label={S.errorTag[t.tag]} value={t.count} max={maxTagCount}
            caption={String(t.count)} />
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{S.stats.byPart}</h3>
        {stats.byPart.map((p) => (
          <StatBar key={p.part} label={S.history.part(p.part)} value={p.correct} max={p.total}
            caption={`${p.correct}/${p.total}`} />
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{S.stats.byWeek}</h3>
        {stats.byWeek.map((w) => (
          <StatBar key={w.weekStart} label={S.stats.weekLabel(w.weekStart)} value={w.correct}
            max={maxWeekTotal} caption={`${w.correct}/${w.total}`} />
        ))}
      </section>

      <section className="space-y-2">
        <button
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          disabled={summary.kind === 'running'}
          onClick={summarise}
        >
          {summary.kind === 'running' ? S.stats.weaknessRunning : S.stats.weaknessButton}
        </button>
        {(summary.kind === 'running' || summary.kind === 'done') && (
          <p className="whitespace-pre-wrap rounded bg-gray-50 p-3 text-sm">{summary.text}</p>
        )}
        {summary.kind === 'error' && (
          <p className="text-sm text-red-600">{errorMessage(deserializeError(summary.error))}</p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `npx vitest run src/app/views/Stats.test.tsx`
Expected: PASS, 7 tests

- [ ] **Step 7: Commit**

```bash
git add src/app src/shared/strings.ts
git commit -m "feat: add the weakness dashboard with a streamed AI summary"
```

---

## Task 8: JSON export and import

**Files:**
- Create: `src/shared/storage/exportImport.ts`
- Modify: `src/app/views/Settings.tsx`, `src/shared/strings.ts`
- Test: `src/shared/storage/exportImport.test.ts`

**Interfaces:**
- Consumes: bulk readers from history; `putSession`, `putQuestions`, `putAnalyses`, `putErrorAnalysis`, `openDb`.
- Produces: `ExportBundle`, `buildExport(includeImages)`, `importBundle(bundle)`, `wipeAll()`.

- [ ] **Step 1: Write the failing test**

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { installChromeMock } from '../../test/chromeMock';
import {
  createSession, getAllQuestions, putAnalyses, putImage, putQuestions, recordAttempt, resetDb,
} from './history';
import { buildExport, importBundle } from './exportImport';
import { DEFAULT_SETTINGS, saveSettings } from './settings';

const mock = installChromeMock();

beforeEach(async () => {
  mock.reset();
  await resetDb();
});

async function seed() {
  const session = await createSession({ origin: 'paste', rawText: 'raw', questionIds: ['q1'] });
  await putQuestions([{
    id: 'q1', sessionId: session.id, order: 1, stem: 'stem', imageIds: [],
    choices: [{ label: 'A', text: 'a' }],
  }]);
  await putAnalyses([{
    questionId: 'q1', correctAnswer: 'A', explanation: 'e', strategy: 's',
    topic: 't', topicCategory: 'grammar',
  }]);
  await recordAttempt({ questionId: 'q1', userAnswer: 'A', correctAnswer: 'A', isRetry: false });
  return session;
}

describe('buildExport', () => {
  it('includes every history store', async () => {
    await seed();
    const bundle = await buildExport(false);
    expect(bundle.version).toBe(1);
    expect(bundle.sessions).toHaveLength(1);
    expect(bundle.questions).toHaveLength(1);
    expect(bundle.analyses).toHaveLength(1);
    expect(bundle.attempts).toHaveLength(1);
  });

  it('never includes settings, so a shared file cannot leak the API key', async () => {
    await saveSettings({ ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'sk-secret', model: 'm' } });
    await seed();
    expect(JSON.stringify(await buildExport(true))).not.toContain('sk-secret');
  });

  it('omits images unless asked', async () => {
    await seed();
    await putImage(new Blob(['x'], { type: 'image/jpeg' }));
    expect((await buildExport(false)).images).toBeUndefined();
    expect((await buildExport(true)).images).toHaveLength(1);
  });
});

describe('importBundle', () => {
  it('adds records that are not already present', async () => {
    const bundle = { version: 1 as const, exportedAt: 0,
      sessions: [], analyses: [], attempts: [], errorAnalyses: [],
      questions: [{ id: 'new', sessionId: 's', order: 1, stem: 'imported', imageIds: [],
        choices: [{ label: 'A', text: 'a' }] }] };
    const result = await importBundle(bundle);
    expect(result.added).toBe(1);
    expect((await getAllQuestions()).map((q) => q.id)).toEqual(['new']);
  });

  it('skips an id that already exists rather than overwriting it', async () => {
    await seed();
    const bundle = { version: 1 as const, exportedAt: 0,
      sessions: [], analyses: [], attempts: [], errorAnalyses: [],
      questions: [{ id: 'q1', sessionId: 's', order: 9, stem: 'OVERWRITTEN', imageIds: [],
        choices: [{ label: 'A', text: 'a' }] }] };
    const result = await importBundle(bundle);
    expect(result.skipped).toBe(1);
    expect((await getAllQuestions())[0].stem).toBe('stem');
  });

  it('rejects a bundle from an unknown version', async () => {
    await expect(importBundle({ version: 99 } as never)).rejects.toMatchObject({ code: 'UNKNOWN' });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/shared/storage/exportImport.test.ts`
Expected: FAIL — `Cannot find module './exportImport'`

- [ ] **Step 3: Implement**

```ts
import { appError } from '../errors';
import type {
  Attempt, ErrorAnalysis, Question, QuestionAnalysis, Session,
} from '../types';
import {
  getAllAnalyses, getAllAttempts, getAllErrorAnalyses, getAllQuestions, getAllSessions, openDb,
} from './history';

export interface ExportBundle {
  version: 1;
  exportedAt: number;
  sessions: Session[];
  questions: Question[];
  analyses: QuestionAnalysis[];
  attempts: Attempt[];
  errorAnalyses: ErrorAnalysis[];
  images?: { id: string; mime: string; dataBase64: string }[];
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBlob(dataBase64: string, mime: string): Blob {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Settings are deliberately absent: an exported file must not carry the API key. */
export async function buildExport(includeImages: boolean): Promise<ExportBundle> {
  const [sessions, questions, analyses, attempts, errorAnalyses] = await Promise.all([
    getAllSessions(), getAllQuestions(), getAllAnalyses(), getAllAttempts(), getAllErrorAnalyses(),
  ]);

  const bundle: ExportBundle = {
    version: 1,
    exportedAt: Date.now(),
    sessions, questions, analyses, attempts, errorAnalyses,
  };

  if (includeImages) {
    const stored = await (await openDb()).getAll('images');
    bundle.images = await Promise.all(
      stored.map(async (row) => ({
        id: row.id,
        mime: row.blob.type || 'image/jpeg',
        dataBase64: await blobToBase64(row.blob),
      })),
    );
  }

  return bundle;
}

export async function importBundle(bundle: ExportBundle): Promise<{ added: number; skipped: number }> {
  if (bundle?.version !== 1) {
    throw appError('UNKNOWN', { detail: `unsupported export version: ${bundle?.version}` });
  }

  const db = await openDb();
  let added = 0;
  let skipped = 0;

  type HistoryStore = 'sessions' | 'questions' | 'analyses' | 'attempts' | 'errorAnalyses';

  async function mergeInto<T>(
    store: HistoryStore,
    records: T[] | undefined,
    keyOf: (record: T) => string,
  ): Promise<void> {
    for (const record of records ?? []) {
      if (await db.get(store, keyOf(record))) {
        skipped += 1;
        continue;
      }
      // The bundle is user-supplied JSON; idb's generics cannot vouch for it,
      // so the cast is unavoidable. zod validation would be overkill for a
      // file the user exported from this same extension.
      await db.put(store, record as never);
      added += 1;
    }
  }

  await mergeInto<Session>('sessions', bundle.sessions, (r) => r.id);
  await mergeInto<Question>('questions', bundle.questions, (r) => r.id);
  await mergeInto<QuestionAnalysis>('analyses', bundle.analyses, (r) => r.questionId);
  await mergeInto<Attempt>('attempts', bundle.attempts, (r) => r.id);
  await mergeInto<ErrorAnalysis>('errorAnalyses', bundle.errorAnalyses, (r) => r.attemptId);

  for (const image of bundle.images ?? []) {
    if (await db.get('images', image.id)) {
      skipped += 1;
      continue;
    }
    await db.put('images', { id: image.id, blob: base64ToBlob(image.dataBase64, image.mime) });
    added += 1;
  }

  return { added, skipped };
}

/** Clears history only. Settings survive, so the user does not have to re-enter their key. */
export async function wipeAll(): Promise<void> {
  const db = await openDb();
  for (const store of ['sessions', 'questions', 'analyses', 'attempts', 'errorAnalyses', 'images'] as const) {
    await db.clear(store);
  }
}
```

- [ ] **Step 4: Add the strings and the Settings controls**

Strings:

```ts
  settings: {
    // …existing keys…
    exportTitle: 'Sao lưu dữ liệu',
    exportButton: 'Xuất file JSON',
    exportWithImages: 'Kèm ảnh (file sẽ rất nặng)',
    importButton: 'Nhập từ file JSON',
    importDone: (added: number, skipped: number) =>
      `Đã thêm ${added} bản ghi, bỏ qua ${skipped} bản ghi trùng.`,
    importFailed: 'File không hợp lệ.',
    wipeButton: 'Xoá toàn bộ lịch sử',
    wipeConfirm: 'Xoá toàn bộ câu hỏi và thống kê? Không khôi phục được. Cài đặt vẫn được giữ.',
    wipeDone: 'Đã xoá toàn bộ lịch sử.',
  },
```

Append to `Settings.tsx` (below the existing save/test row):

```tsx
      <section className="space-y-2 border-t pt-4">
        <h2 className="text-sm font-medium">{S.settings.exportTitle}</h2>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withImages} onChange={(e) => setWithImages(e.target.checked)} />
          {S.settings.exportWithImages}
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded border px-3 py-2 text-sm" onClick={() => void doExport()}>
            {S.settings.exportButton}
          </button>

          <label className="cursor-pointer rounded border px-3 py-2 text-sm">
            {S.settings.importButton}
            <input type="file" accept="application/json" className="hidden"
              onChange={(e) => void doImport(e.target.files?.[0])} />
          </label>

          <button className="rounded border border-red-400 px-3 py-2 text-sm text-red-700"
            onClick={() => void doWipe()}>
            {S.settings.wipeButton}
          </button>
        </div>

        {notice && <p className="text-sm text-gray-700">{notice}</p>}
      </section>
```

with the handlers:

```tsx
  const [withImages, setWithImages] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function doExport() {
    const bundle = await buildExport(withImages);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(bundle)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `imen-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doImport(file: File | undefined) {
    if (!file) return;
    try {
      const result = await importBundle(JSON.parse(await file.text()));
      setNotice(S.settings.importDone(result.added, result.skipped));
    } catch {
      setNotice(S.settings.importFailed);
    }
  }

  async function doWipe() {
    if (!confirm(S.settings.wipeConfirm)) return;
    await wipeAll();
    setNotice(S.settings.wipeDone);
  }
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/shared/storage/exportImport.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 6: Commit**

```bash
git add src/shared/storage/exportImport.ts src/shared/storage/exportImport.test.ts src/app/views/Settings.tsx src/shared/strings.ts
git commit -m "feat: add additive JSON export and import, excluding settings"
```

---

## Task 9: Panel link and the manual acceptance run

**Files:**
- Modify: `src/sidepanel/App.tsx` (a link to the dashboard)
- Modify: `src/shared/strings.ts`
- Create: `docs/superpowers/plans/plan-3-acceptance.md`, `README.md` (dashboard section)

- [ ] **Step 1: Add the strings and the link**

```ts
  common: {
    // …existing keys…
    openDashboard: 'Lịch sử & Thống kê',
  },
```

In `src/sidepanel/App.tsx`, extract the existing `switch` into a helper and wrap it:

```tsx
  function renderBody() {
    switch (state.view) {
      // …every case exactly as it is today, unchanged…
      case 'loading':
        return null;
      // …
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">{renderBody()}</div>
      <button
        className="border-t px-4 py-2 text-left text-xs text-blue-700"
        onClick={() => chrome.runtime.openOptionsPage()}
      >
        {S.common.openDashboard}
      </button>
    </div>
  );
```

The case bodies do not change — only their enclosing function does. Do not rewrite them.

- [ ] **Step 2: Run the whole suite and the type check**

```bash
npm test
npx tsc --noEmit
```

Expected: every suite passes, zero type errors.

- [ ] **Step 3: Build, load and run the manual acceptance checklist**

```bash
npm run build
```

Record results in `docs/superpowers/plans/plan-3-acceptance.md`:

1. With an empty database, open the dashboard → History says "no questions yet", Stats says "not enough data". Neither crashes.
2. Analyse ~10 questions across Plans 1 and 2, getting some deliberately wrong → History lists all of them, newest first.
3. Filter to wrong answers → only the wrong ones remain. Combine with a part filter → the intersection, not the union.
4. Search a word that appears in a choice, not the stem → the question is found.
5. Open a question captured with an image → the image renders from IndexedDB, not a broken icon.
6. Click "Làm lại câu này" → **the correct answer is not visible on screen.** Answer correctly → the "you fixed it" message appears.
7. Go to Stats → accuracy did **not** improve after that retry. Tick "Include retries" → it changes. **This is the anti-inflation rule; do not wave it through.**
8. Check "most-missed topics" names real grammar points, not one-off phrasings. If the model is emitting a different `topic` string for the same concept every time, that is a prompt problem in `analyze.ts` worth reporting.
9. Click "AI tổng kết điểm yếu" → text streams in and names topics that actually appear in the table above it.
10. In DevTools, inspect the request the weakness summary sends → **it contains counts only, no question text.**
11. Export without images → open the JSON in a text editor and search for your API key. **It must not be there.**
12. Export with images → the file is much larger and re-imports cleanly.
13. Import the same file twice → the second import reports everything skipped and the History count does not double.
14. Wipe all history → History empties, but Settings still holds the API key.

Items 7, 10 and 11 are the three that must not be waved through.

- [ ] **Step 4: Extend the README**

Add under Configuration:

```markdown
## Dashboard

The options page has three tabs: History, Stats and Settings.

Statistics count first attempts only by default, so redoing a question you
already know the answer to does not inflate your accuracy. Toggle "Include
retries" to see both.

Export produces a JSON backup of your question history. It never contains
your API key. Import is additive — re-importing the same file changes
nothing.
```

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel src/shared/strings.ts README.md docs/superpowers/plans/plan-3-acceptance.md
git commit -m "feat: link the dashboard from the side panel and record the acceptance run

Completes the spec: capture, analyse, diagnose, and review what you are weak at."
```

---

## Done

With Plans 1–3 complete, every section of `docs/superpowers/specs/2026-08-07-imen-ext-design.md` is implemented except the explicit v1 exclusions in §12: SRS/Anki, cloud sync, Parts 1–4 audio, auto-detecting the answer already ticked on the page, user accounts, and Firefox support.
