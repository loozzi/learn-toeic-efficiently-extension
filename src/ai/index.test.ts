import { describe, expect, it } from 'vitest';
import { createProvider } from './index';
import { isAppError } from '../shared/errors';
import { DEFAULT_SETTINGS } from '../shared/storage/settings';
describe('provider factory', () => {
  it('refuses to build a provider without an API key', () => { try { createProvider(DEFAULT_SETTINGS.ai); expect.unreachable('should throw'); } catch (error) { expect(isAppError(error) && error.code).toBe('NO_API_KEY'); } });
  it('builds a provider for each supported vendor', () => { for (const provider of ['openai', 'gemini', 'ollama'] as const) { const built = createProvider({ provider, apiKey: 'k', model: 'm', supportsVision: true }); expect(typeof built.complete).toBe('function'); expect(typeof built.stream).toBe('function'); } });
  it('builds an ollama provider without an API key', () => { const built = createProvider({ provider: 'ollama', apiKey: '', model: 'llama3', supportsVision: false }); expect(typeof built.complete).toBe('function'); });
});
