import { getAllAnalyses, getAllAttempts, getAllErrorAnalyses, getAllQuestions } from './history';
import type { Attempt, ErrorAnalysis, ErrorTag, Question, QuestionAnalysis } from '../types';

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
  const analysisByQuestion = new Map(stores.analyses.map((analysis) => [analysis.questionId, analysis]));

  const attemptsByQuestion = new Map<string, Attempt[]>();
  for (const attempt of stores.attempts) {
    const list = attemptsByQuestion.get(attempt.questionId) ?? [];
    list.push(attempt);
    attemptsByQuestion.set(attempt.questionId, list);
  }

  const tagsByQuestion = new Map<string, Set<ErrorTag>>();
  for (const errorAnalysis of stores.errorAnalyses) {
    const tags = tagsByQuestion.get(errorAnalysis.questionId) ?? new Set<ErrorTag>();
    for (const tag of errorAnalysis.userTags) tags.add(tag);
    tagsByQuestion.set(errorAnalysis.questionId, tags);
  }

  const rows: HistoryRow[] = stores.questions.map((question) => {
    const attempts = (attemptsByQuestion.get(question.id) ?? []).slice().sort((left, right) => left.createdAt - right.createdAt);
    return { question, analysis: analysisByQuestion.get(question.id), attempts, firstAttempt: attempts[0], latestAttempt: attempts.at(-1), errorTags: [...(tagsByQuestion.get(question.id) ?? [])] };
  });

  return rows.sort((left, right) => (right.firstAttempt?.createdAt ?? 0) - (left.firstAttempt?.createdAt ?? 0));
}

function haystack(row: HistoryRow): string {
  return [row.question.stem, row.question.passage ?? '', ...row.question.choices.map((choice) => choice.text), row.analysis?.topic ?? ''].join(' ').toLowerCase();
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
  const [questions, analyses, attempts, errorAnalyses] = await Promise.all([getAllQuestions(), getAllAnalyses(), getAllAttempts(), getAllErrorAnalyses()]);
  return applyFilter(buildRows({ questions, analyses, attempts, errorAnalyses }), filter);
}

export async function getRow(questionId: string): Promise<HistoryRow | undefined> {
  return (await listHistory()).find((row) => row.question.id === questionId);
}
