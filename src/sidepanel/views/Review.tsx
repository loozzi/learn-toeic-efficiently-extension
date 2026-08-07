import { CheckCircle2, X } from 'lucide-react';
import { useState } from 'react';
import type { SerializedError } from '../../shared/errors';
import { sendRequest } from '../../shared/messages';
import { Button } from '../../shared/components/Button';
import { ChoiceButton } from '../../shared/components/ChoiceButton';
import { S } from '../../shared/strings';
import type { Question, QuestionAnalysis } from '../../shared/types';
import { ErrorBanner } from '../components/ErrorBanner';

export interface AnalyzedPayload {
  questions: Question[];
  analyses: QuestionAnalysis[];
  answers: Record<string, string | undefined>;
  attemptIdByQuestionId: Record<string, string>;
}

export function Review({ sessionId, questions, visionSkipped, onAnalyzed }: { sessionId: string; questions: Question[]; visionSkipped: boolean; onAnalyzed: (payload: AnalyzedPayload) => void }) {
  const [answers, setAnswers] = useState<Record<string, string | undefined>>({});
  const [skipped, setSkipped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SerializedError | null>(null);

  const kept = questions.filter((question) => !skipped.includes(question.id));
  const ticked = kept.filter((question) => answers[question.id] != null).length;

  function pick(questionId: string, label: string) { setAnswers((current) => ({ ...current, [questionId]: current[questionId] === label ? undefined : label })); }

  async function analyze() {
    setError(null);
    setBusy(true);
    const reply = await sendRequest('ANALYZE', { sessionId, answers: kept.map((question) => ({ questionId: question.id, userAnswer: answers[question.id] })), skippedQuestionIds: skipped });
    setBusy(false);
    if (reply.ok) onAnalyzed({ questions: kept, answers, ...reply.data }); else setError(reply.error);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-auto p-4 pb-2">
        <header className="space-y-1">
          <h2 className="font-semibold text-foreground">{S.review.title}</h2>
          <p className="text-xs text-muted-foreground">{S.review.hint}</p>
          {visionSkipped && (
            <p className="rounded-lg border border-warning-border bg-warning-bg p-2 text-xs text-warning">{S.review.visionSkipped}</p>
          )}
        </header>

        {kept.map((question) => {
          const answered = answers[question.id] != null;
          return (
            <div key={question.id} data-testid={`question-${question.id}`} className="space-y-2.5 rounded-lg border border-border bg-surface p-3 shadow-sm">
              {question.passage && <p className="text-xs whitespace-pre-wrap text-muted-foreground">{question.passage}</p>}
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-foreground"><span className="mr-1 font-medium">{question.order}.</span>{question.stem}</p>
                {answered && <CheckCircle2 size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {question.choices.map((choice) => (
                  <ChoiceButton key={choice.label} label={choice.label} active={answers[question.id] === choice.label} onClick={() => pick(question.id, choice.label)} />
                ))}
                {!answered && <span className="self-center text-xs text-muted-foreground">{S.review.notAttempted}</span>}
              </div>

              <div className="space-y-0.5 text-xs text-muted-foreground">
                {question.choices.map((choice) => <div key={choice.label}>{choice.label}. {choice.text}</div>)}
              </div>

              <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground" onClick={() => setSkipped((current) => [...current, question.id])}>
                <X size={11} strokeWidth={2} />
                {S.review.skip}
              </button>
            </div>
          );
        })}

        {error && <ErrorBanner error={error} onRetry={() => void analyze()} />}
      </div>

      <div className="shrink-0 space-y-2 border-t border-border bg-surface p-3">
        <p className="text-xs text-muted-foreground">{S.review.counter(ticked, kept.length)}</p>
        <Button variant="primary" className="w-full" disabled={busy} onClick={() => void analyze()}>{busy ? S.review.analyzing : S.review.analyzeButton}</Button>
      </div>
    </div>
  );
}
