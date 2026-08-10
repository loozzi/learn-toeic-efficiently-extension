import type { Settings } from '../types';

const KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  ai: { provider: 'openai', apiKey: '', model: '', supportsVision: true },
  explanationLanguage: 'vi',
  captureImages: true,
  minSelectionChars: 15,
};

function normalise(settings: Settings): Settings {
  const baseUrl = settings.ai.baseUrl?.trim();
  return { ...settings, ai: { ...settings.ai, baseUrl: baseUrl ? baseUrl.replace(/\/+$/, '') : undefined } };
}

export async function getSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(KEY);
  const stored = raw[KEY] as Partial<Settings> | undefined;
  if (!stored) return DEFAULT_SETTINGS;
  return normalise({ ...DEFAULT_SETTINGS, ...stored, ai: { ...DEFAULT_SETTINGS.ai, ...stored.ai } });
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = normalise({ ...current, ...patch, ai: { ...current.ai, ...patch.ai } });
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function isConfigured(settings: Settings): boolean {
  if (settings.ai.model.trim().length === 0) return false;
  return settings.ai.provider === 'ollama' || settings.ai.apiKey.trim().length > 0;
}
