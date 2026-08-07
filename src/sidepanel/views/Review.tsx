import { useState } from 'react';
import type { SerializedError } from '../../shared/errors';
import { sendRequest } from '../../shared/messages';
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
    <div className="space-y-4 p-4">
      <header className="space-y-1">
        <h2 className="font-semibold">{S.review.title}</h2>
        <p className="text-xs text-gray-600">{S.review.hint}</p>
        {visionSkipped && <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">{S.review.visionSkipped}</p>}
      </header>

      {kept.map((question) => (
        <div key={question.id} data-testid={`question-${question.id}`} className="space-y-2 rounded border p-3">
          {question.passage && <p className="text-xs whitespace-pre-wrap text-gray-500">{question.passage}</p>}
          <p className="text-sm"><span className="mr-1 font-medium">{question.order}.</span>{question.stem}</p>
          <div className="flex flex-wrap gap-2">
            {question.choices.map((choice) => (
              <button key={choice.label} aria-pressed={answers[question.id] === choice.label} className={`rounded border px-3 py-1 text-sm ${answers[question.id] === choice.label ? 'border-blue-600 bg-blue-600 text-white' : ''}`} onClick={() => pick(question.id, choice.label)}>{choice.label}</button>
            ))}
            <span className="self-center text-xs text-gray-500">{answers[question.id] == null ? S.review.notAttempted : ''}</span>
          </div>
          <div className="text-xs text-gray-500">
            {question.choices.map((choice) => <div key={choice.label}>{choice.label}. {choice.text}</div>)}
          </div>
          <button className="text-xs text-gray-500 underline" onClick={() => setSkipped((current) => [...current, question.id])}>{S.review.skip}</button>
        </div>
      ))}

      {error && <ErrorBanner error={error} onRetry={() => void analyze()} />}

      <div className="sticky bottom-0 space-y-2 bg-white pt-2">
        <p className="text-xs text-gray-600">{S.review.counter(ticked, kept.length)}</p>
        <button className="w-full rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50" disabled={busy} onClick={() => void analyze()}>{busy ? S.review.analyzing : S.review.analyzeButton}</button>
      </div>
    </div>
  );
}
