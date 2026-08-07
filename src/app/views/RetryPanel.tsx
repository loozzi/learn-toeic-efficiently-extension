import { useState } from 'react';
import { recordAttempt } from '../../shared/storage/history';
import type { HistoryRow } from '../../shared/storage/queries';
import { S } from '../../shared/strings';

export function RetryPanel({ row, onDone }: { row: HistoryRow; onDone: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);

  const correctAnswer = row.analysis?.correctAnswer;

  async function submit() {
    if (!picked || !correctAnswer) return;

    // No AI call: the analysis is already stored, so a retry is free.
    await recordAttempt({ questionId: row.question.id, userAnswer: picked, correctAnswer, isRetry: true });

    const nowCorrect = picked === correctAnswer;
    const wasCorrect = row.firstAttempt?.isCorrect === true;
    setVerdict(nowCorrect ? (wasCorrect ? S.history.retryAgainRight : S.history.retryCorrect) : S.history.retryStillWrong);
    onDone();
  }

  if (verdict) return <p className="text-sm font-medium">{verdict}</p>;

  return (
    <div className="space-y-2 rounded bg-gray-50 p-3">
      <p className="text-xs text-gray-600">{S.history.retryHint}</p>
      <div className="flex flex-wrap gap-2">
        {row.question.choices.map((choice) => (
          <button key={choice.label} aria-pressed={picked === choice.label} className={`rounded border px-3 py-1 text-sm ${picked === choice.label ? 'border-blue-600 bg-blue-600 text-white' : ''}`} onClick={() => setPicked(choice.label)}>{choice.label}</button>
        ))}
      </div>
      <button className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50" disabled={!picked} onClick={() => void submit()}>{S.history.retrySubmit}</button>
    </div>
  );
}
