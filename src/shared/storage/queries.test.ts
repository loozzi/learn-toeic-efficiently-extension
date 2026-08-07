import { describe, expect, it } from 'vitest';
import { applyFilter, buildRows } from './queries';
import type { Attempt, ErrorAnalysis, Question, QuestionAnalysis } from '../types';
const DAY = 86_400_000;
const question = (id: string, over: Partial<Question> = {}): Question => ({ id, sessionId: 's1', order: 1, stem: `stem ${id}`, imageIds: [], choices: [{ label: 'A', text: 'alpha' }, { label: 'B', text: 'beta' }], ...over });
const analysis = (questionId: string, over: Partial<QuestionAnalysis> = {}): QuestionAnalysis => ({ questionId, correctAnswer: 'B', explanation: 'e', strategy: 's', topic: 'subject-verb agreement', topicCategory: 'grammar', ...over });
const attempt = (id: string, questionId: string, over: Partial<Attempt> = {}): Attempt => ({ id, questionId, userAnswer: 'B', isCorrect: true, createdAt: 1000, isRetry: false, ...over });
const errorAnalysis = (attemptId: string, questionId: string, tags: ErrorAnalysis['userTags']): ErrorAnalysis => ({ attemptId, questionId, userTags: tags, aiDiagnosis: 'd', fixAdvice: 'f' });

describe('buildRows', () => {
  it('joins a question with its analysis, attempts and error tags', () => {
    const rows = buildRows({ questions: [question('q1')], analyses: [analysis('q1')], attempts: [attempt('a1', 'q1')], errorAnalyses: [errorAnalysis('a1', 'q1', ['no_vocab'])] });
    expect(rows).toHaveLength(1);
    expect(rows[0].analysis?.topic).toBe('subject-verb agreement');
    expect(rows[0].attempts).toHaveLength(1);
    expect(rows[0].errorTags).toEqual(['no_vocab']);
  });

  it('orders attempts oldest first and exposes first and latest', () => {
    const rows = buildRows({ questions: [question('q1')], analyses: [], attempts: [attempt('a2', 'q1', { createdAt: 3000, isRetry: true, isCorrect: true }), attempt('a1', 'q1', { createdAt: 1000, isCorrect: false })], errorAnalyses: [] });
    expect(rows[0].attempts.map((row) => row.id)).toEqual(['a1', 'a2']);
    expect(rows[0].firstAttempt?.id).toBe('a1');
    expect(rows[0].latestAttempt?.id).toBe('a2');
  });

  it('deduplicates error tags reported across several attempts', () => {
    const rows = buildRows({ questions: [question('q1')], analyses: [], attempts: [attempt('a1', 'q1'), attempt('a2', 'q1', { createdAt: 2000 })], errorAnalyses: [errorAnalysis('a1', 'q1', ['no_vocab', 'misread']), errorAnalysis('a2', 'q1', ['no_vocab'])] });
    expect(rows[0].errorTags.sort()).toEqual(['misread', 'no_vocab']);
  });

  it('keeps a question that has no analysis yet', () => {
    const rows = buildRows({ questions: [question('q1')], analyses: [], attempts: [], errorAnalyses: [] });
    expect(rows[0].analysis).toBeUndefined();
    expect(rows[0].firstAttempt).toBeUndefined();
  });

  it('sorts newest question first by its first attempt', () => {
    const rows = buildRows({ questions: [question('old'), question('new')], analyses: [], attempts: [attempt('a1', 'old', { createdAt: 1000 }), attempt('a2', 'new', { createdAt: 5000 })], errorAnalyses: [] });
    expect(rows.map((row) => row.question.id)).toEqual(['new', 'old']);
  });
});

describe('applyFilter', () => {
  const rows = buildRows({
    questions: [question('q1', { toeicPart: 5, stem: 'The manager submits the report' }), question('q2', { toeicPart: 7, stem: 'Please contact our team' })],
    analyses: [analysis('q1', { topic: 'subject-verb agreement' }), analysis('q2', { topic: 'business vocabulary', topicCategory: 'vocabulary' })],
    attempts: [attempt('a1', 'q1', { isCorrect: false, createdAt: 1000 }), attempt('a2', 'q2', { isCorrect: true, createdAt: 1000 + 10 * DAY })],
    errorAnalyses: [errorAnalysis('a1', 'q1', ['no_grammar'])],
  });

  it('returns everything with an empty filter', () => { expect(applyFilter(rows, {})).toHaveLength(2); });

  it('filters by first-attempt outcome', () => {
    expect(applyFilter(rows, { outcome: 'wrong' }).map((row) => row.question.id)).toEqual(['q1']);
    expect(applyFilter(rows, { outcome: 'correct' }).map((row) => row.question.id)).toEqual(['q2']);
  });

  it('filters by TOEIC part, topic and error tag', () => {
    expect(applyFilter(rows, { toeicPart: 7 }).map((row) => row.question.id)).toEqual(['q2']);
    expect(applyFilter(rows, { topic: 'business vocabulary' }).map((row) => row.question.id)).toEqual(['q2']);
    expect(applyFilter(rows, { errorTag: 'no_grammar' }).map((row) => row.question.id)).toEqual(['q1']);
  });

  it('filters by date range on the first attempt', () => {
    expect(applyFilter(rows, { from: 1000 + 5 * DAY }).map((row) => row.question.id)).toEqual(['q2']);
    expect(applyFilter(rows, { to: 1000 + 5 * DAY }).map((row) => row.question.id)).toEqual(['q1']);
  });

  it('searches stem, choices and topic case-insensitively', () => {
    expect(applyFilter(rows, { search: 'MANAGER' }).map((row) => row.question.id)).toEqual(['q1']);
    expect(applyFilter(rows, { search: 'alpha' })).toHaveLength(2);
    expect(applyFilter(rows, { search: 'vocabulary' }).map((row) => row.question.id)).toEqual(['q2']);
  });

  it('combines filters conjunctively', () => { expect(applyFilter(rows, { outcome: 'wrong', toeicPart: 7 })).toHaveLength(0); });

  it('treats a question with no attempt as neither correct nor wrong', () => {
    const orphan = buildRows({ questions: [question('q3')], analyses: [], attempts: [], errorAnalyses: [] });
    expect(applyFilter(orphan, { outcome: 'wrong' })).toHaveLength(0);
    expect(applyFilter(orphan, { outcome: 'correct' })).toHaveLength(0);
  });
});
