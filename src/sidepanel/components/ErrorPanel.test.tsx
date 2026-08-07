import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ERROR_TAG_ORDER, S } from '../../shared/strings';
import type { ErrorPsychEvent } from '../../shared/messages';
let posted: unknown[] = [];
let emit: (event: ErrorPsychEvent) => void = () => {};
let disconnected = false;
beforeEach(() => {
  posted = []; disconnected = false;
  (globalThis as any).chrome = { runtime: { connect: () => ({ name: 'errorPsych', postMessage: (message: unknown) => posted.push(message), disconnect: () => { disconnected = true; }, onMessage: { addListener: (fn: (event: ErrorPsychEvent) => void) => { emit = fn; } }, onDisconnect: { addListener: () => {} } }) } };
});
const { ErrorPanel } = await import('./ErrorPanel');
describe('ErrorPanel', () => {
  it('offers all seven reasons with the four primary ones first', async () => {
    render(<ErrorPanel questionId="q1" attemptId="a1" />);
    await userEvent.click(screen.getByRole('button', { name: S.result.analyzeMistake }));
    const labels = screen.getAllByRole('button').map((button) => button.textContent).filter((text) => Object.values(S.errorTag).includes(text as string));
    expect(labels.slice(0, 4)).toEqual(ERROR_TAG_ORDER.slice(0, 4).map((tag) => S.errorTag[tag]));
    expect(labels).toHaveLength(7);
  });

  it('requires at least one reason before submitting', async () => {
    render(<ErrorPanel questionId="q1" attemptId="a1" />);
    await userEvent.click(screen.getByRole('button', { name: S.result.analyzeMistake }));
    expect(screen.getByRole('button', { name: S.errorPanel.submit })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: S.errorTag.no_grammar }));
    expect(screen.getByRole('button', { name: S.errorPanel.submit })).toBeEnabled();
  });

  it('sends the tags and note over the port, then renders streamed deltas', async () => {
    render(<ErrorPanel questionId="q1" attemptId="a1" />);
    await userEvent.click(screen.getByRole('button', { name: S.result.analyzeMistake }));
    await userEvent.click(screen.getByRole('button', { name: S.errorTag.no_vocab }));
    await userEvent.type(screen.getByPlaceholderText(S.errorPanel.notePlaceholder), 'ghi chú');
    await userEvent.click(screen.getByRole('button', { name: S.errorPanel.submit }));
    expect(posted[0]).toEqual({ questionId: 'q1', attemptId: 'a1', userTags: ['no_vocab'], userNote: 'ghi chú' });
    emit({ type: 'delta', text: 'phần một' });
    expect(await screen.findByText(/phần một/)).toBeInTheDocument();
  });

  it('splits the final text into diagnosis and fix advice', async () => {
    render(<ErrorPanel questionId="q1" attemptId="a1" />);
    await userEvent.click(screen.getByRole('button', { name: S.result.analyzeMistake }));
    await userEvent.click(screen.getByRole('button', { name: S.errorTag.misclick }));
    await userEvent.click(screen.getByRole('button', { name: S.errorPanel.submit }));
    emit({ type: 'done', aiDiagnosis: 'chẩn đoán', fixAdvice: 'cách sửa' });
    expect(await screen.findByText('chẩn đoán')).toBeInTheDocument();
    expect(screen.getByText('cách sửa')).toBeInTheDocument();
    expect(disconnected).toBe(true);
  });

  it('shows an error banner when the stream fails', async () => {
    render(<ErrorPanel questionId="q1" attemptId="a1" />);
    await userEvent.click(screen.getByRole('button', { name: S.result.analyzeMistake }));
    await userEvent.click(screen.getByRole('button', { name: S.errorTag.misread }));
    await userEvent.click(screen.getByRole('button', { name: S.errorPanel.submit }));
    emit({ type: 'error', error: { code: 'RATE_LIMIT' } });
    expect(await screen.findByRole('button', { name: S.common.retry })).toBeInTheDocument();
  });
});
