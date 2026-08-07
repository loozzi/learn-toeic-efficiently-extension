import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { S } from '../../shared/strings';
import type { HistoryRow } from '../../shared/storage/queries';
import type { Attempt } from '../../shared/types';
const attempt = (id: string, questionId: string, isCorrect: boolean, isRetry = false): Attempt => ({ id, questionId, userAnswer: 'A', isCorrect, createdAt: Date.UTC(2026, 0, 5), isRetry });
const rows: HistoryRow[] = [
  {
    question: { id: 'q1', sessionId: 's', order: 1, stem: 'x', imageIds: [], choices: [{ label: 'A', text: 'a' }], toeicPart: 5 },
    analysis: { questionId: 'q1', correctAnswer: 'B', explanation: 'e', strategy: 's', topic: 'gerund vs infinitive', topicCategory: 'grammar' },
    attempts: [attempt('a1', 'q1', false), attempt('a2', 'q1', true, true)],
    firstAttempt: attempt('a1', 'q1', false),
    latestAttempt: attempt('a2', 'q1', true, true),
    errorTags: ['no_grammar'],
  },
];
vi.mock('../../shared/storage/queries', async (original) => ({ ...(await original<Record<string, unknown>>()), listHistory: async () => rows }));
let emit: (event: unknown) => void = () => {};
const postMessage = vi.fn();
beforeEach(() => {
  postMessage.mockReset();
  (globalThis as any).chrome = { runtime: { connect: () => ({ postMessage, disconnect: vi.fn(), onMessage: { addListener: (fn: (event: unknown) => void) => { emit = fn; } }, onDisconnect: { addListener: vi.fn() } }) } };
});
const { Stats } = await import('./Stats');
describe('Stats view', () => {
  it('counts first attempts only by default', async () => { render(<Stats />); expect(await screen.findByText('0%')).toBeInTheDocument(); });

  it('recounts when retries are included', async () => {
    render(<Stats />);
    await screen.findByText('0%');
    await userEvent.click(screen.getByLabelText(S.stats.includeRetries));
    expect(await screen.findByText('50%')).toBeInTheDocument();
  });

  it('lists the most-missed topics with their counts', async () => {
    render(<Stats />);
    expect(await screen.findByText('gerund vs infinitive')).toBeInTheDocument();
    expect(screen.getByText(S.stats.wrongCount(1, 1))).toBeInTheDocument();
  });

  it('shows the mistake-reason breakdown', async () => { render(<Stats />); expect(await screen.findByText(S.errorTag.no_grammar)).toBeInTheDocument(); });

  it('shows accuracy per TOEIC part', async () => { render(<Stats />); expect(await screen.findByText(S.history.part(5))).toBeInTheDocument(); });

  it('sends the aggregated stats over the port and streams the summary back', async () => {
    render(<Stats />);
    await screen.findByText('0%');
    await userEvent.click(screen.getByRole('button', { name: S.stats.weaknessButton }));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ total: 1 }));
    emit({ type: 'delta', text: 'Ôn gerund' });
    expect(await screen.findByText(/Ôn gerund/)).toBeInTheDocument();
  });

  it('surfaces a streaming failure instead of hanging', async () => {
    render(<Stats />);
    await screen.findByText('0%');
    await userEvent.click(screen.getByRole('button', { name: S.stats.weaknessButton }));
    emit({ type: 'error', error: { code: 'NO_API_KEY' } });
    expect(await screen.findByText(/chưa cấu hình API key/i)).toBeInTheDocument();
  });
});
