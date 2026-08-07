import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installChromeMock } from '../../test/chromeMock';
import { S } from '../../shared/strings';
const sendRequest = vi.fn();
vi.mock('../../shared/messages', () => ({ sendRequest: (...args: unknown[]) => sendRequest(...args) }));
const { Settings } = await import('./Settings');
const mock = installChromeMock();
beforeEach(() => { mock.reset(); sendRequest.mockReset(); });
describe('Settings view', () => {
  it('shows the unencrypted-key warning', async () => { render(<Settings />); expect(await screen.findByText(S.settings.apiKeyWarning)).toBeInTheDocument(); });

  it('saves the provider config and reloads it', async () => {
    render(<Settings />);
    await userEvent.type(await screen.findByLabelText(S.settings.apiKey), 'sk-abc');
    await userEvent.type(screen.getByLabelText(S.settings.model), 'gpt-test');
    await userEvent.click(screen.getByRole('button', { name: S.settings.save }));
    await waitFor(() => expect(screen.getByText(S.settings.saved)).toBeInTheDocument());
    expect((mock.store.settings as { ai: { apiKey: string; model: string } }).ai).toMatchObject({ apiKey: 'sk-abc', model: 'gpt-test' });
  });

  it('blocks saving until apiKey and model are both filled in', async () => {
    render(<Settings />);
    await userEvent.click(await screen.findByRole('button', { name: S.settings.save }));
    expect(await screen.findAllByText(S.settings.required)).toHaveLength(2);
    expect(mock.store.settings).toBeUndefined();
  });

  it('reports the result of a connection test', async () => {
    sendRequest.mockResolvedValue({ ok: true, data: { ok: true, message: '' } });
    render(<Settings />);
    await userEvent.type(await screen.findByLabelText(S.settings.apiKey), 'k');
    await userEvent.type(screen.getByLabelText(S.settings.model), 'm');
    await userEvent.click(screen.getByRole('button', { name: S.settings.testConnection }));
    expect(await screen.findByText(S.settings.testOk)).toBeInTheDocument();
    expect(sendRequest).toHaveBeenCalledWith('TEST_CONNECTION', expect.anything());
  });

  // The model is filled in too because saving is blocked without it; the point of
  // the test is that saving alone never routes the key through sendRequest.
  it('never sends the API key anywhere except storage and the background', async () => {
    render(<Settings />);
    await userEvent.type(await screen.findByLabelText(S.settings.apiKey), 'sk-secret');
    await userEvent.type(screen.getByLabelText(S.settings.model), 'm');
    await userEvent.click(screen.getByRole('button', { name: S.settings.save }));
    await waitFor(() => expect(mock.store.settings).toBeDefined());
    expect(sendRequest).not.toHaveBeenCalled();
  });
});
