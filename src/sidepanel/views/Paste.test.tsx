import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { S } from '../../shared/strings';
const sendRequest = vi.fn();
vi.mock('../../shared/messages', () => ({ sendRequest: (...args: unknown[]) => sendRequest(...args) }));
const { Paste } = await import('./Paste');
const questions = [{ id: 'q1', sessionId: 's1', order: 1, stem: 'Q', choices: [], imageIds: [] }];
describe('Paste view', () => {
  it('does not call the background with empty input', async () => { render(<Paste onParsed={vi.fn()} />); await userEvent.click(screen.getByRole('button', { name: S.paste.submit })); expect(await screen.findByText(S.paste.empty)).toBeInTheDocument(); expect(sendRequest).not.toHaveBeenCalled(); });

  it('sends the text and hands the parsed questions upward', async () => {
    sendRequest.mockResolvedValue({ ok: true, data: { sessionId: 's1', questions, visionSkipped: false } });
    const onParsed = vi.fn();
    render(<Paste onParsed={onParsed} />);
    await userEvent.type(screen.getByPlaceholderText(S.paste.placeholder), '101. The manager ___');
    await userEvent.click(screen.getByRole('button', { name: S.paste.submit }));
    expect(sendRequest).toHaveBeenCalledWith('PARSE_TEXT', expect.objectContaining({ rawText: '101. The manager ___', origin: 'paste' }));
    expect(onParsed).toHaveBeenCalledWith({ sessionId: 's1', questions, visionSkipped: false });
  });

  it('shows an error banner with a retry when parsing fails', async () => {
    sendRequest.mockResolvedValue({ ok: false, error: { code: 'PARSE_EMPTY' } });
    render(<Paste onParsed={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText(S.paste.placeholder), 'nonsense');
    await userEvent.click(screen.getByRole('button', { name: S.paste.submit }));
    expect(await screen.findByRole('button', { name: S.common.retry })).toBeInTheDocument();
  });

  it('shows a message when START_SNIP fails to reach the content script', async () => {
    sendRequest.mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', detail: 'Could not establish connection' } });
    render(<Paste onParsed={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: S.paste.snip }));
    expect(await screen.findByText(S.paste.snipStartFailed)).toBeInTheDocument();
  });

  it('shows a message when START_SNIP finds no active tab', async () => {
    sendRequest.mockResolvedValue({ ok: true, data: { started: false } });
    render(<Paste onParsed={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: S.paste.snip }));
    expect(await screen.findByText(S.paste.snipStartFailed)).toBeInTheDocument();
  });

  it('surfaces a snipFailed panel event as a capture-failed message', async () => {
    const { rerender } = render(<Paste onParsed={vi.fn()} snipFailed={0} />);
    rerender(<Paste onParsed={vi.fn()} snipFailed={1} />);
    expect(await screen.findByText(S.content.snipFailed)).toBeInTheDocument();
  });

  // jsdom has no DataTransfer, so the clipboard payload is handed to React's
  // synthetic paste event directly rather than through a real ClipboardEvent.
  it('attaches images pasted from the clipboard', async () => {
    sendRequest.mockResolvedValue({ ok: true, data: { sessionId: 's1', questions, visionSkipped: false } });
    render(<Paste onParsed={vi.fn()} />);
    const box = screen.getByPlaceholderText(S.paste.placeholder);
    await userEvent.type(box, 'q');
    fireEvent.paste(box, { clipboardData: { files: [new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' })] } });
    expect(await screen.findByText(S.paste.imageCount(1))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: S.paste.submit }));
    expect(sendRequest.mock.calls.at(-1)?.[1].images).toEqual([{ mime: 'image/png', dataBase64: 'AQID' }]);
  });
});
