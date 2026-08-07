import { beforeEach, describe, expect, it } from 'vitest';
import { installChromeMock } from '../../test/chromeMock';
import { DEFAULT_SETTINGS, getSettings, isConfigured, saveSettings } from './settings';

const mock = installChromeMock();
beforeEach(() => mock.reset());

describe('settings storage', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.explanationLanguage).toBe('vi');
    expect(DEFAULT_SETTINGS.minSelectionChars).toBe(15);
    expect(DEFAULT_SETTINGS.ai.supportsVision).toBe(true);
  });
  it('merges a partial patch over what is stored', async () => {
    await saveSettings({ ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k', model: 'm' } });
    await saveSettings({ explanationLanguage: 'bilingual' });
    const settings = await getSettings();
    expect(settings.ai.apiKey).toBe('k');
    expect(settings.explanationLanguage).toBe('bilingual');
  });
  it('writes to storage.local and never to storage.sync', async () => {
    await saveSettings({ captureImages: false });
    expect(mock.store).toHaveProperty('settings');
  });
  it('treats settings as unconfigured until both apiKey and model are set', () => {
    expect(isConfigured(DEFAULT_SETTINGS)).toBe(false);
    expect(isConfigured({ ...DEFAULT_SETTINGS, ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k' } })).toBe(false);
    expect(isConfigured({ ...DEFAULT_SETTINGS, ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k', model: 'm' } })).toBe(true);
  });
  it('ignores a blank baseUrl rather than storing an empty string', async () => {
    await saveSettings({ ai: { ...DEFAULT_SETTINGS.ai, baseUrl: '   ' } });
    expect((await getSettings()).ai.baseUrl).toBeUndefined();
  });
});
