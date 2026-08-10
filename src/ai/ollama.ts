import type { ProviderConfig } from "../shared/types";
import { createOpenAIProvider } from "./openai";
import type { AIProvider } from "./types";

const DEFAULT_BASE = "http://localhost:11434/v1";

/** Ollama serves an OpenAI-compatible /v1/chat/completions endpoint; it ignores the bearer token, so a missing key falls back to a placeholder. */
export function createOllamaProvider(config: ProviderConfig): AIProvider {
  return createOpenAIProvider({
    ...config,
    baseUrl: config.baseUrl ?? DEFAULT_BASE,
    apiKey: config.apiKey.trim() || "ollama",
  });
}
