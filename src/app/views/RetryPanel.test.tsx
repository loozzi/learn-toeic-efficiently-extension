import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { S } from '../../shared/strings';
import type { HistoryRow } from '../../shared/storage/queries';
import type { Attempt } from '../../shared/types';
const recordAttempt = vi.fn().mockResolvedValue({ id: 'new' });
vi.mock('../../shared/storage/history', () => ({ recordAttempt: (...args: unknown[]) => recordAttempt(...args), getImage: async () => undefined }));
const sendRequest = vi.fn();
vi.mock('../../shared/messages', () => ({ sendRequest: (...args: unknown[]) => sendRequest(...args) }));
const { RetryPanel } = await import('./RetryPanel');
const missed: Attempt = { id: 'a1', questionId: 'q1', userAnswer: 'A', isCorrect: false, createdAt: 1, isRetry: false };
const row: HistoryRow = {
  question: { id: 'q1', sessionId: 's', order: 1, stem: 'stem', imageIds: [], choices: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }] },
  analysis: { questionId: 'q1', correctAnswer: 'B', explanation: 'e', strategy: 's', topic: 't', topicCategory: 'grammar' },
  attempts: [missed], firstAttempt: missed, latestAttempt: missed, errorTags: [],
};
describe('RetryPanel', () => {
  it('hides the correct answer until the user commits', () => {
    render(<RetryPanel row={row} onDone={vi.fn()} />);
    expect(screen.getByText(S.history.retryHint)).toBeInTheDocument();
    expect(screen.queryByText(S.result.correctAnswer)).not.toBeInTheDocument();
  });

  it('records an attempt marked as a retry', async () => {
    render(<RetryPanel row={row} onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    await userEvent.click(screen.getByRole('button', { name: S.history.retrySubmit }));
    expect(recordAttempt).toHaveBeenCalledWith({ questionId: 'q1', userAnswer: 'B', correctAnswer: 'B', isRetry: true });
  });

  it('never calls the AI — the analysis already exists', async () => {
    render(<RetryPanel row={row} onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    await userEvent.click(screen.getByRole('button', { name: S.history.retrySubmit }));
    expect(sendRequest).not.toHaveBeenCalled();
  });

  it('says the weakness looks fixed when a previously-wrong question is now right', async () => {
    render(<RetryPanel row={row} onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    await userEvent.click(screen.getByRole('button', { name: S.history.retrySubmit }));
    expect(await screen.findByText(S.history.retryCorrect)).toBeInTheDocument();
  });

  it('says it is still wrong when the user misses again', async () => {
    render(<RetryPanel row={row} onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'A' }));
    await userEvent.click(screen.getByRole('button', { name: S.history.retrySubmit }));
    expect(await screen.findByText(S.history.retryStillWrong)).toBeInTheDocument();
  });

  it('will not submit without a choice', () => {
    render(<RetryPanel row={row} onDone={vi.fn()} />);
    expect(screen.getByRole('button', { name: S.history.retrySubmit })).toBeDisabled();
  });
});
