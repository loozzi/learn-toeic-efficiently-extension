export type ChatPart = { type: 'text'; text: string } | { type: 'image'; mime: string; dataBase64: string };
export interface ChatRequest { system: string; userParts: ChatPart[]; json: boolean; temperature?: number; }
export interface AIProvider { complete(request: ChatRequest, signal: AbortSignal): Promise<string>; stream(request: ChatRequest, signal: AbortSignal): AsyncIterable<{ delta: string }>; }
