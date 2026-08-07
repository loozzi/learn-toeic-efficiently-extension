import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeMock } from '../test/chromeMock';
import { getAnalysis, getQuestionsBySession, getSession, resetDb } from '../shared/storage/history';
import { DEFAULT_SETTINGS, saveSettings } from '../shared/storage/settings';
const complete = vi.fn(); const stream = vi.fn();
vi.mock('../ai/index', () => ({ createProvider: () => ({ complete, stream }) }));
const { runAnalyze, runErrorPsych, runParse } = await import('./aiRunner');
const mock = installChromeMock();
beforeEach(async () => { mock.reset(); await resetDb(); complete.mockReset(); stream.mockReset(); await saveSettings({ ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k', model: 'm' } }); });
const parseReply = JSON.stringify({ questions: [{ order: 1, stem: 'Q one', choices: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }] }, { order: 2, stem: 'Q two', choices: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }] }] });
describe('runParse', () => {
  it('persists a session and its questions', async () => { complete.mockResolvedValue({ text: parseReply }); const out = await runParse({ rawText: 'raw', images: [], origin: 'paste' }); expect(out.questions).toHaveLength(2); expect(await getQuestionsBySession(out.sessionId)).toHaveLength(2); });
  it('rejects when the model returns no questions', async () => { complete.mockResolvedValue({ text: JSON.stringify({ questions: [] }) }); await expect(runParse({ rawText: 'raw', images: [], origin: 'paste' })).rejects.toMatchObject({ code: 'PARSE_EMPTY' }); });
  it('rejects more than 20 questions rather than truncating silently', async () => { complete.mockResolvedValue({ text: JSON.stringify({ questions: Array.from({ length: 21 }, (_, index) => ({ order: index + 1, stem: `Q${index}`, choices: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }] })) }) }); await expect(runParse({ rawText: 'raw', images: [], origin: 'paste' })).rejects.toMatchObject({ code: 'TOO_MANY' }); });
  it('drops images and flags it when the model has no vision support', async () => { await saveSettings({ ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k', model: 'm', supportsVision: false } }); complete.mockResolvedValue({ text: parseReply }); const out = await runParse({ rawText: 'raw', origin: 'paste', images: [{ mime: 'image/jpeg', dataBase64: 'QUJD' }] }); expect(out.visionSkipped).toBe(true); expect(complete.mock.calls[0][0].userParts.some((part: any) => part.type === 'image')).toBe(false); });
});
describe('runAnalyze', () => {
  it('maps analyses back by order, deletes skipped questions and records attempts', async () => {
    complete.mockResolvedValueOnce({ text: parseReply, usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } });
    const parsed = await runParse({ rawText: 'raw', images: [], origin: 'paste' });
    const [first, second] = parsed.questions;
    complete.mockResolvedValueOnce({ text: JSON.stringify({ analyses: [{ order: 1, correctAnswer: 'B', explanation: 'e', strategy: 's', topic: 'subject-verb agreement', topicCategory: 'grammar' }] }), usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } });
    const out = await runAnalyze({ requestId: crypto.randomUUID(), sessionId: parsed.sessionId, answers: [{ questionId: first.id, userAnswer: 'A' }], skippedQuestionIds: [second.id] });
    expect(out.analyses[0].questionId).toBe(first.id);
    expect((await getAnalysis(first.id))?.correctAnswer).toBe('B');
    expect(await getQuestionsBySession(parsed.sessionId)).toHaveLength(1);
    expect(out.attemptIdByQuestionId[first.id]).toBeTruthy();
    expect(out.usage).toEqual({ inputTokens: 10, outputTokens: 20, totalTokens: 30 });
    expect((await getSession(parsed.sessionId))?.analysisUsage).toEqual(out.usage);
  });
});
describe('runErrorPsych', () => {
  it('streams deltas then persists the split diagnosis', async () => {
    complete.mockResolvedValueOnce({ text: parseReply });
    const parsed = await runParse({ rawText: 'raw', images: [], origin: 'paste' });
    const question = parsed.questions[0];
    complete.mockResolvedValueOnce({ text: JSON.stringify({ analyses: [{ order: 1, correctAnswer: 'B', explanation: 'e', strategy: 's', topic: 't', topicCategory: 'grammar' }] }) });
    const analyzed = await runAnalyze({ requestId: crypto.randomUUID(), sessionId: parsed.sessionId, answers: [{ questionId: question.id, userAnswer: 'A' }], skippedQuestionIds: [] });
    stream.mockImplementation(async function* () { yield { delta: 'why' }; yield { delta: '\n---FIX---\nhow' }; });
    const seen: string[] = []; let final: { aiDiagnosis: string; fixAdvice: string } | undefined;
    for await (const event of runErrorPsych({ questionId: question.id, attemptId: analyzed.attemptIdByQuestionId[question.id], userTags: ['no_grammar'] })) {
      if (event.type === 'delta') seen.push(event.text);
      if (event.type === 'done') final = { aiDiagnosis: event.aiDiagnosis, fixAdvice: event.fixAdvice };
    }
    expect(seen.join('')).toContain('why');
    expect(final).toEqual({ aiDiagnosis: 'why', fixAdvice: 'how' });
  });
});
describe('configuration guard', () => {
  it('refuses every run when no API key is configured', async () => { mock.reset(); await expect(runParse({ rawText: 'raw', images: [], origin: 'paste' })).rejects.toMatchObject({ code: 'NO_API_KEY' }); });
});
