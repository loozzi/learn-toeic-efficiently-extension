import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { installChromeMock } from '../test/chromeMock';
import { DEFAULT_SETTINGS, saveSettings } from '../shared/storage/settings';
import { S } from '../shared/strings';
const sendRequest = vi.fn();
vi.mock('../shared/messages', async (original) => ({ ...(await original<Record<string, unknown>>()), sendRequest: (...args: unknown[]) => sendRequest(...args) }));
const { App } = await import('./App');
const mock = installChromeMock();
let emit: (event: unknown) => void = () => {};
beforeEach(async () => {
  mock.reset();
  sendRequest.mockReset();
  await saveSettings({ ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k', model: 'm' } });
  (globalThis as any).chrome.runtime.connect = () => ({ postMessage: vi.fn(), disconnect: vi.fn(), onMessage: { addListener: (fn: (event: unknown) => void) => { emit = fn; } }, onDisconnect: { addListener: vi.fn() } });
});
const questions = [{ id: 'q1', sessionId: 's1', order: 1, stem: 'Q', choices: [], imageIds: [] }];
describe('side panel capture handoff', () => {
  it('claims a pending capture on mount and parses it straight away', async () => {
    sendRequest.mockImplementation(async (type: string) => {
      if (type === 'CLAIM_PENDING_CAPTURE') return { ok: true, data: { capture: { rawText: '101. The manager ___', images: [], sourceUrl: 'https://site', sourceTitle: 'Site' } } };
      return { ok: true, data: { sessionId: 's1', questions, visionSkipped: false } };
    });

    render(<App />);

    await waitFor(() => expect(sendRequest).toHaveBeenCalledWith('PARSE_TEXT', expect.objectContaining({ rawText: '101. The manager ___', origin: 'selection', sourceUrl: 'https://site' })));
    expect(await screen.findByText(S.review.title)).toBeInTheDocument();
  });

  it('shows the paste view when there is nothing pending', async () => {
    sendRequest.mockResolvedValue({ ok: true, data: { capture: null } });
    render(<App />);
    expect(await screen.findByPlaceholderText(S.paste.placeholder)).toBeInTheDocument();
  });

  it('reacts to a capture that arrives while the panel is already open', async () => {
    sendRequest.mockResolvedValue({ ok: true, data: { capture: null } });
    render(<App />);
    await screen.findByPlaceholderText(S.paste.placeholder);

    sendRequest.mockImplementation(async (type: string) => type === 'CLAIM_PENDING_CAPTURE'
      ? { ok: true, data: { capture: { rawText: 'later', images: [], sourceUrl: '', sourceTitle: '' } } }
      : { ok: true, data: { sessionId: 's1', questions, visionSkipped: false } });

    emit({ type: 'pendingCapture' });

    await waitFor(() => expect(sendRequest).toHaveBeenCalledWith('PARSE_TEXT', expect.objectContaining({ rawText: 'later' })));
  });

  it('surfaces a snipFailed panel event in the paste view', async () => {
    sendRequest.mockResolvedValue({ ok: true, data: { capture: null } });
    render(<App />);
    await screen.findByPlaceholderText(S.paste.placeholder);

    emit({ type: 'snipFailed' });

    expect(await screen.findByText(S.content.snipFailed)).toBeInTheDocument();
  });
});
