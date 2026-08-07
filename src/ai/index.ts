import { appError } from '../shared/errors';
import type { ProviderConfig } from '../shared/types';
import { createGeminiProvider } from './gemini';
import { createOpenAIProvider } from './openai';
import type { AIProvider } from './types';

export function createProvider(config: ProviderConfig): AIProvider {
  if (!config.apiKey.trim() || !config.model.trim()) throw appError('NO_API_KEY');
  return config.provider === 'gemini' ? createGeminiProvider(config) : createOpenAIProvider(config);
}
