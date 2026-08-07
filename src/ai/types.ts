export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image"; mime: string; dataBase64: string };
export interface ChatRequest {
  system: string;
  userParts: ChatPart[];
  json: boolean;
  temperature?: number;
}
export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}
export interface ChatResponse {
  text: string;
  usage?: ChatUsage;
}
export interface AIProvider {
  complete(request: ChatRequest, signal: AbortSignal): Promise<ChatResponse>;
  stream(
    request: ChatRequest,
    signal: AbortSignal,
  ): AsyncIterable<{ delta: string }>;
}
