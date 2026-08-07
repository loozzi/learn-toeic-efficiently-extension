import { type AppError, appError } from '../shared/errors';
import type { ProviderConfig } from '../shared/types';
import type { AIProvider, ChatPart, ChatRequest } from './types';

const DEFAULT_BASE = 'https://api.openai.com/v1';
export function mapHttpError(status: number, body: string): AppError { if (status === 401 || status === 403) return appError('AUTH', { detail: body.slice(0, 300) }); if (status === 429) return appError('RATE_LIMIT', { detail: body.slice(0, 300) }); return appError('UNKNOWN', { detail: `HTTP ${status}: ${body.slice(0, 300)}` }); }
function toContent(parts: ChatPart[]) { return parts.map((part) => part.type === 'text' ? { type: 'text', text: part.text } : { type: 'image_url', image_url: { url: `data:${part.mime};base64,${part.dataBase64}` } }); }
export async function* sseLines(response: Response): AsyncGenerator<string> { const reader = response.body!.getReader(); const decoder = new TextDecoder(); let buffer = ''; while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); let cut: number; while ((cut = buffer.indexOf('\n')) !== -1) { const line = buffer.slice(0, cut).trim(); buffer = buffer.slice(cut + 1); if (line.startsWith('data:')) yield line.slice(5).trim(); } } }
export function createOpenAIProvider(config: ProviderConfig): AIProvider {
  const base = config.baseUrl ?? DEFAULT_BASE;
  async function post(request: ChatRequest, stream: boolean, signal: AbortSignal): Promise<Response> {
    const body: Record<string, unknown> = { model: config.model, messages: [{ role: 'system', content: request.system }, { role: 'user', content: toContent(request.userParts) }], stream };
    if (request.json) body.response_format = { type: 'json_object' }; if (request.temperature != null) body.temperature = request.temperature;
    let response: Response; try { response = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` }, body: JSON.stringify(body), signal }); } catch (error) { if (signal.aborted) throw error; throw appError('NETWORK', { detail: error instanceof Error ? error.message : String(error) }); }
    if (!response.ok) throw mapHttpError(response.status, await response.text()); return response;
  }
  return { async complete(request, signal) { const response = await post(request, false, signal); const json = (await response.json()) as { choices?: { message?: { content?: string } }[] }; return json.choices?.[0]?.message?.content ?? ''; }, async *stream(request, signal) { const response = await post(request, true, signal); for await (const payload of sseLines(response)) { if (payload === '[DONE]') return; try { const chunk = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] }; const delta = chunk.choices?.[0]?.delta?.content; if (delta) yield { delta }; } catch { /* Ignore malformed SSE fragments. */ } } } };
}
