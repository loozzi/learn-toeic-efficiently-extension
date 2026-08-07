import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installChromeMock } from '../test/chromeMock';
import { DEFAULT_SETTINGS, saveSettings } from '../shared/storage/settings';
import type { WeaknessEvent } from '../shared/messages';
const stream = vi.fn();
vi.mock('../ai/index', () => ({ createProvider: () => ({ complete: vi.fn(), stream }) }));
const { runWeaknessSummary } = await import('./aiRunner');
const mock = installChromeMock();
const stats = { total: 10, correct: 5, accuracy: 0.5, byWeek: [], topMissedTopics: [], errorTagCounts: [], byPart: [] };
beforeEach(async () => { mock.reset(); stream.mockReset(); await saveSettings({ ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k', model: 'm' } }); });
describe('runWeaknessSummary', () => {
  it('streams deltas then a done event carrying the full text', async () => {
    stream.mockImplementation(async function* () { yield { delta: 'Ôn ' }; yield { delta: 'gerund.' }; });
    const events: WeaknessEvent[] = [];
    for await (const event of runWeaknessSummary(stats)) events.push(event);
    expect(events).toEqual([{ type: 'delta', text: 'Ôn ' }, { type: 'delta', text: 'gerund.' }, { type: 'done', text: 'Ôn gerund.' }]);
  });

  it('emits an error event instead of throwing when unconfigured', async () => {
    mock.reset();
    const events: WeaknessEvent[] = [];
    for await (const event of runWeaknessSummary(stats)) events.push(event);
    expect(events).toEqual([{ type: 'error', error: { code: 'NO_API_KEY', detail: undefined, raw: undefined } }]);
  });
});
