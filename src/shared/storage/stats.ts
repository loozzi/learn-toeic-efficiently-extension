import type { Attempt, ErrorTag } from '../types';
import type { HistoryRow } from './queries';

const DAY = 86_400_000;

export interface StatsOptions { includeRetries: boolean }
export interface WeekBucket { weekStart: number; total: number; correct: number }
export interface TopicStat { topic: string; wrong: number; total: number }
export interface PartStat { part: number; total: number; correct: number }

export interface Stats {
  total: number;
  correct: number;
  accuracy: number; // 0..1, and 0 when there is nothing to divide
  byWeek: WeekBucket[];
  topMissedTopics: TopicStat[];
  errorTagCounts: { tag: ErrorTag; count: number }[];
  byPart: PartStat[];
}

/** Monday 00:00 UTC of the week containing `timestamp`. */
export function startOfWeek(timestamp: number): number {
  const date = new Date(timestamp);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const dayOfWeek = new Date(midnight).getUTCDay(); // 0 = Sunday
  return midnight - ((dayOfWeek + 6) % 7) * DAY;
}

function countedAttempts(row: HistoryRow, options: StatsOptions): Attempt[] {
  return options.includeRetries ? row.attempts : row.attempts.filter((attempt) => !attempt.isRetry);
}

export function computeStats(rows: HistoryRow[], options: StatsOptions): Stats {
  let total = 0;
  let correct = 0;

  const weeks = new Map<number, WeekBucket>();
  const topics = new Map<string, TopicStat>();
  const tags = new Map<ErrorTag, number>();
  const parts = new Map<number, PartStat>();

  for (const row of rows) {
    const attempts = countedAttempts(row, options);

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
    if (attempts.length > 0) for (const tag of row.errorTags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
  }

  return {
    total,
    correct,
    accuracy: total === 0 ? 0 : correct / total,
    byWeek: [...weeks.values()].sort((left, right) => left.weekStart - right.weekStart),
    topMissedTopics: [...topics.values()].filter((topic) => topic.wrong > 0).sort((left, right) => right.wrong - left.wrong || left.topic.localeCompare(right.topic)),
    errorTagCounts: [...tags.entries()].map(([tag, count]) => ({ tag, count })).sort((left, right) => right.count - left.count),
    byPart: [...parts.values()].sort((left, right) => left.part - right.part),
  };
}
