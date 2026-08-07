import type { ReactNode } from 'react';
import { S } from '../../shared/strings';
import type { Question, QuestionAnalysis } from '../../shared/types';

/** Purely presentational: the shell supplies renderErrorPanel, so this view knows nothing about ports or streaming. */
export function Result({ questions, analyses, answers, attemptIdByQuestionId, renderErrorPanel, onRestart }: {
  questions: Question[];
  analyses: QuestionAnalysis[];
  answers: Record<string, string | undefined>;
  attemptIdByQuestionId: Record<string, string>;
  renderErrorPanel: (questionId: string, attemptId: string) => ReactNode;
  onRestart: () => void;
}) {
  const byId = new Map(analyses.map((analysis) => [analysis.questionId, analysis]));

  return (
    <div className="space-y-4 p-4">
      {questions.map((question) => {
        const analysis = byId.get(question.id);
        if (!analysis) return null;
        const picked = answers[question.id];
        const correct = picked === analysis.correctAnswer;

        return (
          <div key={question.id} data-testid={`result-${question.id}`} className="space-y-2 rounded border p-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{question.order}.</span>
              <span className={correct ? 'text-green-700' : 'text-red-700'}>{correct ? S.result.correct : S.result.wrong}</span>
              {!correct && <span className="text-gray-600">{S.result.youChose} {picked ?? S.review.notAttempted}</span>}
              <span className="text-gray-600">{S.result.correctAnswer} {analysis.correctAnswer}</span>
            </div>

            <p className="text-sm">{question.stem}</p>

            <div className="text-sm">
              <p className="font-medium">{S.result.explanation}</p>
              <p className="whitespace-pre-wrap text-gray-700">{analysis.explanation}</p>
            </div>

            <div className="text-sm">
              <p className="font-medium">{S.result.strategy}</p>
              <p className="whitespace-pre-wrap text-gray-700">{analysis.strategy}</p>
            </div>

            {analysis.distractorNotes && Object.keys(analysis.distractorNotes).length > 0 && (
              <div className="text-xs text-gray-600">
                <p className="font-medium">{S.result.distractors}</p>
                {Object.entries(analysis.distractorNotes).map(([label, note]) => <div key={label}>{label}. {note}</div>)}
              </div>
            )}

            <p className="text-xs text-gray-400">{analysis.topic}</p>

            {!correct && renderErrorPanel(question.id, attemptIdByQuestionId[question.id])}
          </div>
        );
      })}

      <button className="w-full rounded border px-3 py-2" onClick={onRestart}>{S.result.backToPaste}</button>
    </div>
  );
}
