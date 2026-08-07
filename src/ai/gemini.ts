import { appError } from "../shared/errors";
import type { ProviderConfig } from "../shared/types";
import { mapHttpError, sseLines } from "./openai";
import type { AIProvider, ChatPart, ChatRequest, ChatUsage } from "./types";

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";
type GeminiChunk = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};
function toParts(parts: ChatPart[]) {
  return parts.map((part) =>
    part.type === "text"
      ? { text: part.text }
      : { inlineData: { mimeType: part.mime, data: part.dataBase64 } },
  );
}
function textOf(chunk: GeminiChunk): string {
  return (
    chunk.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("") ?? ""
  );
}
/** No responseSchema: the schema lives in the prompt text and zod enforces it. See the deviation note in the plan. */
export function createGeminiProvider(config: ProviderConfig): AIProvider {
  const base = config.baseUrl ?? DEFAULT_BASE;
  async function post(
    request: ChatRequest,
    stream: boolean,
    signal: AbortSignal,
  ): Promise<Response> {
    const url = new URL(
      `${base}/models/${config.model}:${stream ? "streamGenerateContent" : "generateContent"}`,
    );
    url.searchParams.set("key", config.apiKey);
    if (stream) url.searchParams.set("alt", "sse");
    const generationConfig: Record<string, unknown> = {};
    if (request.json) generationConfig.responseMimeType = "application/json";
    if (request.temperature != null)
      generationConfig.temperature = request.temperature;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: "user", parts: toParts(request.userParts) }],
          generationConfig,
        }),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw appError("NETWORK", {
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    if (!response.ok)
      throw mapHttpError(response.status, await response.text());
    return response;
  }
  return {
    async complete(request, signal) {
      const response = await post(request, false, signal);
      const json = (await response.json()) as GeminiChunk & {
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      };
      const usage: ChatUsage | undefined = json.usageMetadata
        ? {
            inputTokens: json.usageMetadata.promptTokenCount ?? 0,
            outputTokens: json.usageMetadata.candidatesTokenCount ?? 0,
            totalTokens:
              json.usageMetadata.totalTokenCount ??
              (json.usageMetadata.promptTokenCount ?? 0) +
                (json.usageMetadata.candidatesTokenCount ?? 0),
          }
        : undefined;
      return { text: textOf(json), usage };
    },
    async *stream(request, signal) {
      const response = await post(request, true, signal);
      for await (const payload of sseLines(response)) {
        if (!payload) continue;
        try {
          const delta = textOf(JSON.parse(payload) as GeminiChunk);
          if (delta) yield { delta };
        } catch {
          /* Ignore malformed SSE fragments. */
        }
      }
    },
  };
}
