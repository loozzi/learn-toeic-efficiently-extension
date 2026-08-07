import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { installChromeMock } from '../test/chromeMock';
import { DEFAULT_SETTINGS, saveSettings } from '../shared/storage/settings';
import { S } from '../shared/strings';
// The shell now claims a pending capture and opens a panel port on mount, so
// the port and a resolvable sendRequest both have to exist.
const sendRequest = vi.fn();
vi.mock('../shared/messages', async (original) => ({ ...(await original<Record<string, unknown>>()), sendRequest: (...args: unknown[]) => sendRequest(...args) }));
const { App } = await import('./App');
const mock = installChromeMock();
beforeEach(() => {
  mock.reset();
  sendRequest.mockReset().mockResolvedValue({ ok: true, data: { capture: null } });
  (globalThis as any).chrome.runtime.connect = () => ({ postMessage: vi.fn(), disconnect: vi.fn(), onMessage: { addListener: vi.fn() }, onDisconnect: { addListener: vi.fn() } });
});
describe('side panel shell', () => {
  it('shows onboarding when no API key is configured', async () => { render(<App />); expect(await screen.findByText(S.onboarding.title)).toBeInTheDocument(); });
  it('shows the paste view once configured', async () => { await saveSettings({ ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k', model: 'm' } }); render(<App />); expect(await screen.findByPlaceholderText(S.paste.placeholder)).toBeInTheDocument(); });
});
