import { CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { recordAttempt } from '../../shared/storage/history';
import type { HistoryRow } from '../../shared/storage/queries';
import { Button } from '../../shared/components/Button';
import { ChoiceButton } from '../../shared/components/ChoiceButton';
import { S } from '../../shared/strings';

export function RetryPanel({ row, onDone }: { row: HistoryRow; onDone: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [nowCorrect, setNowCorrect] = useState(false);

  const correctAnswer = row.analysis?.correctAnswer;

  async function submit() {
    if (!picked || !correctAnswer) return;

    // No AI call: the analysis is already stored, so a retry is free.
    await recordAttempt({ questionId: row.question.id, userAnswer: picked, correctAnswer, isRetry: true });

    const correct = picked === correctAnswer;
    const wasCorrect = row.firstAttempt?.isCorrect === true;
    setNowCorrect(correct);
    setVerdict(correct ? (wasCorrect ? S.history.retryAgainRight : S.history.retryCorrect) : S.history.retryStillWrong);
    onDone();
  }

  if (verdict) {
    return (
      <p className={`flex items-center gap-1.5 text-sm font-medium ${nowCorrect ? 'text-accent' : 'text-destructive'}`}>
        {nowCorrect ? <CheckCircle2 size={16} strokeWidth={2} /> : <XCircle size={16} strokeWidth={2} />}
        {verdict}
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-muted p-3">
      <p className="text-xs text-muted-foreground">{S.history.retryHint}</p>
      <div className="flex flex-wrap gap-2">
        {row.question.choices.map((choice) => (
          <ChoiceButton key={choice.label} label={choice.label} active={picked === choice.label} onClick={() => setPicked(choice.label)} />
        ))}
      </div>
      <Button variant="primary" size="sm" disabled={!picked} onClick={() => void submit()}>{S.history.retrySubmit}</Button>
    </div>
  );
}
