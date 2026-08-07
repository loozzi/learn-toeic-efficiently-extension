// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, deleteQuestions, getAnalysis, getImage, getQuestionsBySession, putAnalyses, putImage, putQuestions, recordAttempt, resetDb } from './history';

beforeEach(async () => { await resetDb(); });

function question(sessionId: string, order: number) {
  return { id: `q${order}`, sessionId, order, stem: `stem ${order}`, choices: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }], imageIds: [] };
}

describe('history storage', () => {
  it('creates a session and reads its questions back in order', async () => {
    const session = await createSession({ origin: 'paste', rawText: 'raw', questionIds: ['q1', 'q2'] });
    await putQuestions([question(session.id, 2), question(session.id, 1)]);
    expect((await getQuestionsBySession(session.id)).map((item) => item.order)).toEqual([1, 2]);
  });
  it('deletes skipped questions', async () => {
    const session = await createSession({ origin: 'paste', rawText: '', questionIds: [] });
    await putQuestions([question(session.id, 1), question(session.id, 2)]);
    await deleteQuestions(['q1']);
    expect((await getQuestionsBySession(session.id)).map((item) => item.id)).toEqual(['q2']);
  });
  it('stores an analysis keyed by questionId', async () => {
    await putAnalyses([{ questionId: 'q1', correctAnswer: 'B', explanation: 'e', strategy: 's', topic: 'subject-verb agreement', topicCategory: 'grammar' }]);
    expect((await getAnalysis('q1'))?.correctAnswer).toBe('B');
  });
  it('derives isCorrect when recording an attempt', async () => {
    const hit = await recordAttempt({ questionId: 'q1', userAnswer: 'B', correctAnswer: 'B', isRetry: false });
    const miss = await recordAttempt({ questionId: 'q1', userAnswer: 'C', correctAnswer: 'B', isRetry: true });
    const blank = await recordAttempt({ questionId: 'q1', correctAnswer: 'B', isRetry: false });
    expect(hit.isCorrect).toBe(true); expect(miss.isCorrect).toBe(false); expect(miss.isRetry).toBe(true); expect(blank.isCorrect).toBe(false); expect(blank.userAnswer).toBeUndefined();
  });
  it('round-trips an image as a Blob, never as base64', async () => {
    const id = await putImage(new Blob(['x'], { type: 'image/jpeg' }));
    const back = await getImage(id);
    expect(back).toBeInstanceOf(Blob); expect(back?.type).toBe('image/jpeg');
  });
});
