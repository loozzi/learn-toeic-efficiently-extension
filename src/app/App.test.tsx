import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installChromeMock } from '../test/chromeMock';
import { S } from '../shared/strings';
vi.mock('../shared/messages', () => ({ sendRequest: vi.fn() }));
vi.mock('../shared/storage/queries', () => ({ listHistory: async () => [] }));
const { App } = await import('./App');
const mock = installChromeMock();
beforeEach(() => mock.reset());
describe('options shell', () => {
  it('opens on the history tab', async () => { render(<App />); expect(await screen.findByText(S.history.empty)).toBeInTheDocument(); });

  it('switches tabs on click', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: S.tabs.settings }));
    // The tab label and the view heading are the same Vietnamese string, so this
    // asks for the heading specifically rather than any node with that text.
    expect(await screen.findByRole('heading', { name: S.settings.title })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: S.tabs.stats }));
    expect(await screen.findByText(S.stats.empty)).toBeInTheDocument();
  });

  it('marks exactly one tab selected', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('tab', { name: S.tabs.stats }));
    const selected = screen.getAllByRole('tab').filter((tab) => tab.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent(S.tabs.stats);
  });
});
