import { appError } from '../shared/errors';
import type { ProviderConfig } from '../shared/types';
import { createGeminiProvider } from './gemini';
import { createOllamaProvider } from './ollama';
import { createOpenAIProvider } from './openai';
import type { AIProvider } from './types';

export function createProvider(config: ProviderConfig): AIProvider {
  if (!config.model.trim()) throw appError('NO_API_KEY');
  if (config.provider !== 'ollama' && !config.apiKey.trim()) throw appError('NO_API_KEY');
  if (config.provider === 'gemini') return createGeminiProvider(config);
  if (config.provider === 'ollama') return createOllamaProvider(config);
  return createOpenAIProvider(config);
}
