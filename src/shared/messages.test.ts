import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerHandlers, sendRequest } from './messages';

type Listener = (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean;
let listener: Listener;

beforeEach(() => {
  listener = () => false;
  (globalThis as unknown as { chrome: unknown }).chrome = { runtime: { onMessage: { addListener: (fn: Listener) => { listener = fn; } }, sendMessage: (message: unknown) => new Promise((resolve) => { listener(message, {}, resolve); }) } };
});

describe('message layer', () => {
  it('routes a request to its handler and wraps the result', async () => {
    registerHandlers({ TEST_CONNECTION: async () => ({ ok: true, message: 'fine' }) });
    expect(await sendRequest('TEST_CONNECTION', { config: {} as never })).toEqual({ ok: true, data: { ok: true, message: 'fine' } });
  });
  it('serialises a thrown AppError instead of losing it across the boundary', async () => {
    registerHandlers({ TEST_CONNECTION: async () => { throw Object.assign(new Error('x'), { isAppError: true, code: 'AUTH' }); } });
    const response = await sendRequest('TEST_CONNECTION', { config: {} as never });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe('AUTH');
  });
  it('ignores messages whose type it has no handler for', () => {
    registerHandlers({ TEST_CONNECTION: async () => ({ ok: true, message: '' }) });
    expect(listener({ type: 'SOMETHING_ELSE' }, {}, vi.fn())).toBe(false);
  });
});
