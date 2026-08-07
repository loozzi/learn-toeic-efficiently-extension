import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { installChromeMock } from '../test/chromeMock';
import { DEFAULT_SETTINGS, saveSettings } from '../shared/storage/settings';
import { S } from '../shared/strings';
vi.mock('../shared/messages', () => ({ sendRequest: vi.fn(), PORT_ERROR_PSYCH: 'errorPsych' }));
const { App } = await import('./App');
const mock = installChromeMock();
beforeEach(() => mock.reset());
describe('side panel shell', () => {
  it('shows onboarding when no API key is configured', async () => { render(<App />); expect(await screen.findByText(S.onboarding.title)).toBeInTheDocument(); });
  it('shows the paste view once configured', async () => { await saveSettings({ ai: { ...DEFAULT_SETTINGS.ai, apiKey: 'k', model: 'm' } }); render(<App />); expect(await screen.findByPlaceholderText(S.paste.placeholder)).toBeInTheDocument(); });
});
