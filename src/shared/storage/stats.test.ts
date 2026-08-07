import { describe, expect, it } from 'vitest';
import { computeStats, startOfWeek } from './stats';
import type { HistoryRow } from './queries';
import type { Attempt } from '../types';
const MON = Date.UTC(2026, 0, 5); // a Monday
const DAY = 86_400_000;
const attempt = (over: Partial<Attempt>): Attempt => ({ id: crypto.randomUUID(), questionId: 'q', userAnswer: 'B', isCorrect: true, createdAt: MON, isRetry: false, ...over });
// The computed fields come after the spread: derived from `over.attempts`, and
// declaring them before it would make them dead assignments.
const row = (over: Partial<HistoryRow> & { attempts: Attempt[] }): HistoryRow => ({
  question: { id: 'q', sessionId: 's', order: 1, stem: 'x', imageIds: [], choices: [{ label: 'A', text: 'a' }] },
  errorTags: [],
  ...over,
  attempts: over.attempts,
  firstAttempt: over.attempts[0],
  latestAttempt: over.attempts.at(-1),
});

describe('startOfWeek', () => {
  it('snaps every day of a week back to its Monday', () => { for (let day = 0; day < 7; day++) expect(startOfWeek(MON + day * DAY)).toBe(MON); });
  it('rolls a Sunday back six days, not forward one', () => { expect(startOfWeek(MON + 6 * DAY)).toBe(MON); });
});

describe('computeStats', () => {
  it('reports zeroes for an empty history without dividing by zero', () => {
    const stats = computeStats([], { includeRetries: false });
    expect(stats).toMatchObject({ total: 0, correct: 0, accuracy: 0 });
    expect(stats.topMissedTopics).toEqual([]);
  });

  it('counts only first attempts by default', () => {
    const rows = [row({ attempts: [attempt({ isCorrect: false }), attempt({ isCorrect: true, isRetry: true, createdAt: MON + DAY })] })];
    expect(computeStats(rows, { includeRetries: false })).toMatchObject({ total: 1, correct: 0 });
  });

  it('counts retries too when asked', () => {
    const rows = [row({ attempts: [attempt({ isCorrect: false }), attempt({ isCorrect: true, isRetry: true, createdAt: MON + DAY })] })];
    expect(computeStats(rows, { includeRetries: true })).toMatchObject({ total: 2, correct: 1 });
  });

  it('computes accuracy as a fraction', () => {
    const rows = [row({ attempts: [attempt({ isCorrect: true })] }), row({ attempts: [attempt({ isCorrect: true })] }), row({ attempts: [attempt({ isCorrect: false })] }), row({ attempts: [attempt({ isCorrect: false })] })];
    expect(computeStats(rows, { includeRetries: false }).accuracy).toBeCloseTo(0.5);
  });

  it('buckets by week and sorts oldest week first', () => {
    const rows = [row({ attempts: [attempt({ createdAt: MON, isCorrect: true })] }), row({ attempts: [attempt({ createdAt: MON + 8 * DAY, isCorrect: false })] })];
    const weeks = computeStats(rows, { includeRetries: false }).byWeek;
    expect(weeks.map((week) => week.weekStart)).toEqual([MON, MON + 7 * DAY]);
    expect(weeks[0]).toMatchObject({ total: 1, correct: 1 });
  });

  it('ranks topics by wrong count, most missed first', () => {
    const grammar = { questionId: 'q', correctAnswer: 'B', explanation: 'e', strategy: 's', topic: 'gerund vs infinitive', topicCategory: 'grammar' as const };
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
    const analysis = { questionId: 'q', correctAnswer: 'B', explanation: 'e', strategy: 's', topic: 'always right', topicCategory: 'grammar' as const };
    expect(computeStats([row({ analysis, attempts: [attempt({ isCorrect: true })] })], { includeRetries: false }).topMissedTopics).toEqual([]);
  });

  it('counts error tags per question, not per attempt', () => {
    const rows = [row({ errorTags: ['no_vocab', 'misread'], attempts: [attempt({ isCorrect: false })] }), row({ errorTags: ['no_vocab'], attempts: [attempt({ isCorrect: false })] })];
    const counts = computeStats(rows, { includeRetries: false }).errorTagCounts;
    expect(counts[0]).toEqual({ tag: 'no_vocab', count: 2 });
    expect(counts).toContainEqual({ tag: 'misread', count: 1 });
  });

  it('breaks accuracy down by TOEIC part and skips unlabelled questions', () => {
    const withPart = (part: 5 | 7, isCorrect: boolean) => row({ question: { id: 'q', sessionId: 's', order: 1, stem: 'x', imageIds: [], choices: [{ label: 'A', text: 'a' }], toeicPart: part }, attempts: [attempt({ isCorrect })] });
    const rows = [withPart(5, true), withPart(5, false), withPart(7, true), row({ attempts: [attempt({ isCorrect: false })] })];
    expect(computeStats(rows, { includeRetries: false }).byPart).toEqual([{ part: 5, total: 2, correct: 1 }, { part: 7, total: 1, correct: 1 }]);
  });
});
