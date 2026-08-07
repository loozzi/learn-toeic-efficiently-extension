// @vitest-environment node
// Node's Blob survives fake-indexeddb's structured clone; jsdom's comes back as
// a plain object, which would make the image round-trip untestable.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { installChromeMock } from '../../test/chromeMock';
import { createSession, getAllQuestions, putAnalyses, putImage, putQuestions, recordAttempt, resetDb } from './history';
import { buildExport, importBundle } from './exportImport';
import { DEFAULT_SETTINGS, saveSettings } from './settings';
const mock = installChromeMock();
beforeEach(async () => { mock.reset(); await resetDb(); });
async function seed() {
  const session = await createSession({ origin: 'paste', rawText: 'raw', questionIds: ['q1'] });
  await putQuestions([{ id: 'q1', sessionId: session.id, order: 1, stem: 'stem', imageIds: [], choices: [{ label: 'A', text: 'a' }] }]);
  await putAnalyses([{ questionId: 'q1', correctAnswer: 'A', explanation: 'e', strategy: 's', topic: 't', topicCategory: 'grammar' }]);
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
    const bundle = { version: 1 as const, exportedAt: 0, sessions: [], analyses: [], attempts: [], errorAnalyses: [], questions: [{ id: 'new', sessionId: 's', order: 1, stem: 'imported', imageIds: [], choices: [{ label: 'A', text: 'a' }] }] };
    expect((await importBundle(bundle)).added).toBe(1);
    expect((await getAllQuestions()).map((question) => question.id)).toEqual(['new']);
  });

  it('skips an id that already exists rather than overwriting it', async () => {
    await seed();
    const bundle = { version: 1 as const, exportedAt: 0, sessions: [], analyses: [], attempts: [], errorAnalyses: [], questions: [{ id: 'q1', sessionId: 's', order: 9, stem: 'OVERWRITTEN', imageIds: [], choices: [{ label: 'A', text: 'a' }] }] };
    expect((await importBundle(bundle)).skipped).toBe(1);
    expect((await getAllQuestions())[0].stem).toBe('stem');
  });

  it('rejects a bundle from an unknown version', async () => {
    await expect(importBundle({ version: 99 } as never)).rejects.toMatchObject({ code: 'UNKNOWN' });
  });
});
