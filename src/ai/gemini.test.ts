import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { createGeminiProvider } from './gemini';
import { isAppError } from '../shared/errors';
import type { ProviderConfig } from '../shared/types';
const config: ProviderConfig = { provider: 'gemini', apiKey: 'g-key', model: 'gemini-test', supportsVision: true };
let lastBody: any; let lastUrl: URL;
// Regex paths, not string paths: msw parses `:generateContent` as a path parameter,
// so a string handler for it also swallows `:streamGenerateContent`. msw matches a
// regex against the URL with the query string already stripped, hence the `$`.
const COMPLETE_URL = /models\/gemini-test:generateContent$/;
const STREAM_URL = /models\/gemini-test:streamGenerateContent$/;
const server = setupServer(
  http.post(COMPLETE_URL, async ({ request }) => { lastBody = await request.json(); lastUrl = new URL(request.url); return HttpResponse.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }); }),
  http.post(STREAM_URL, () => new HttpResponse(['data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}', 'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]}}]}'].join('\n\n') + '\n\n', { headers: { 'Content-Type': 'text/event-stream' } })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' })); afterEach(() => server.resetHandlers()); afterAll(() => server.close());
describe('gemini adapter', () => {
  it('passes the key as a query param and the system prompt as systemInstruction', async () => { server.use(http.post(COMPLETE_URL, async ({ request }) => { lastBody = await request.json(); lastUrl = new URL(request.url); return HttpResponse.json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 } }); })); expect(await createGeminiProvider(config).complete({ system: 'sys', userParts: [{ type: 'text', text: 'hi' }], json: true }, new AbortController().signal)).toEqual({ text: '{"ok":true}', usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 } }); expect(lastUrl.searchParams.get('key')).toBe('g-key'); expect(lastBody.systemInstruction.parts[0].text).toBe('sys'); expect(lastBody.generationConfig.responseMimeType).toBe('application/json'); });
  it('omits responseMimeType when json is false', async () => { await createGeminiProvider(config).complete({ system: 's', userParts: [{ type: 'text', text: 'hi' }], json: false }, new AbortController().signal); expect(lastBody.generationConfig?.responseMimeType).toBeUndefined(); });
  it('encodes images as inlineData parts', async () => { await createGeminiProvider(config).complete({ system: 's', userParts: [{ type: 'text', text: 'look' }, { type: 'image', mime: 'image/jpeg', dataBase64: 'QUJD' }], json: false }, new AbortController().signal); expect(lastBody.contents[0].parts).toEqual([{ text: 'look' }, { inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } }]); });
  it('streams deltas in order', async () => { const chunks: string[] = []; for await (const chunk of createGeminiProvider(config).stream({ system: 's', userParts: [{ type: 'text', text: 'hi' }], json: false }, new AbortController().signal)) chunks.push(chunk.delta); expect(chunks.join('')).toBe('Hello'); });
  it('maps 401 to AUTH', async () => { server.use(http.post(COMPLETE_URL, () => HttpResponse.text('bad key', { status: 401 }))); try { await createGeminiProvider(config).complete({ system: 's', userParts: [], json: false }, new AbortController().signal); expect.unreachable('should throw'); } catch (error) { expect(isAppError(error) && error.code).toBe('AUTH'); } });
});
