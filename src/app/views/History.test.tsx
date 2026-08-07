import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { S } from '../../shared/strings';
import type { HistoryRow } from '../../shared/storage/queries';
import type { Attempt } from '../../shared/types';
const wrong: Attempt = { id: 'a1', questionId: 'q1', userAnswer: 'A', isCorrect: false, createdAt: 1000, isRetry: false };
const right: Attempt = { id: 'a2', questionId: 'q2', userAnswer: 'A', isCorrect: true, createdAt: 2000, isRetry: false };
const rows: HistoryRow[] = [
  {
    question: { id: 'q1', sessionId: 's', order: 1, stem: 'The manager submits it', imageIds: [], choices: [{ label: 'A', text: 'a' }], toeicPart: 5 },
    analysis: { questionId: 'q1', correctAnswer: 'B', explanation: 'e', strategy: 's', topic: 'subject-verb agreement', topicCategory: 'grammar' },
    attempts: [wrong], firstAttempt: wrong, latestAttempt: wrong, errorTags: ['no_grammar'],
  },
  {
    question: { id: 'q2', sessionId: 's', order: 2, stem: 'Please contact us', imageIds: [], choices: [{ label: 'A', text: 'a' }], toeicPart: 7 },
    analysis: { questionId: 'q2', correctAnswer: 'A', explanation: 'e2', strategy: 's2', topic: 'business vocabulary', topicCategory: 'vocabulary' },
    attempts: [right], firstAttempt: right, latestAttempt: right, errorTags: [],
  },
];
vi.mock('../../shared/storage/queries', async (original) => ({ ...(await original<Record<string, unknown>>()), listHistory: async () => rows }));
vi.mock('../../shared/storage/history', () => ({ getImage: async () => undefined, recordAttempt: vi.fn() }));
const { History } = await import('./History');
describe('History view', () => {
  it('lists every question by default', async () => {
    render(<History />);
    expect(await screen.findByText(/The manager submits it/)).toBeInTheDocument();
    expect(screen.getByText(/Please contact us/)).toBeInTheDocument();
  });

  it('filters to wrong answers only', async () => {
    render(<History />);
    await screen.findByText(/The manager submits it/);
    await userEvent.selectOptions(screen.getByLabelText(S.history.outcomeLabel), 'wrong');
    expect(screen.queryByText(/Please contact us/)).not.toBeInTheDocument();
  });

  it('searches the question text', async () => {
    render(<History />);
    await screen.findByText(/The manager submits it/);
    await userEvent.type(screen.getByPlaceholderText(S.history.searchPlaceholder), 'contact');
    expect(screen.queryByText(/The manager submits it/)).not.toBeInTheDocument();
    expect(screen.getByText(/Please contact us/)).toBeInTheDocument();
  });

  it('offers only the topics actually present', async () => {
    render(<History />);
    await screen.findByText(/The manager submits it/);
    const options = Array.from(screen.getByLabelText(S.history.allTopics).querySelectorAll('option'));
    expect(options.map((option) => option.textContent)).toEqual([S.history.allTopics, 'business vocabulary', 'subject-verb agreement']);
  });

  it('says so when nothing matches', async () => {
    render(<History />);
    await screen.findByText(/The manager submits it/);
    await userEvent.type(screen.getByPlaceholderText(S.history.searchPlaceholder), 'zzzz');
    expect(screen.getByText(S.history.noMatch)).toBeInTheDocument();
  });

  it('clears every filter at once', async () => {
    render(<History />);
    await screen.findByText(/The manager submits it/);
    await userEvent.type(screen.getByPlaceholderText(S.history.searchPlaceholder), 'zzzz');
    await userEvent.click(screen.getByRole('button', { name: S.history.clearFilters }));
    expect(screen.getByText(/The manager submits it/)).toBeInTheDocument();
  });

  it('opens the detail view showing the explanation and the recorded answer', async () => {
    render(<History />);
    await userEvent.click(await screen.findByText(/The manager submits it/));
    expect(await screen.findByText('e')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${S.history.yourAnswer}.*A`))).toBeInTheDocument();
  });
});
