import { ArrowLeft, CheckCircle2, Lightbulb, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../../shared/components/Button";
import { S } from "../../shared/strings";
import type {
  Question,
  QuestionAnalysis,
  TokenUsage,
} from "../../shared/types";

/** Purely presentational: the shell supplies renderErrorPanel, so this view knows nothing about ports or streaming. */
export function Result({
  questions,
  analyses,
  answers,
  attemptIdByQuestionId,
  renderErrorPanel,
  onRestart,
  usage,
}: {
  questions: Question[];
  analyses: QuestionAnalysis[];
  answers: Record<string, string | undefined>;
  attemptIdByQuestionId: Record<string, string>;
  renderErrorPanel: (questionId: string, attemptId: string) => ReactNode;
  onRestart: () => void;
  usage?: TokenUsage;
}) {
  const byId = new Map(
    analyses.map((analysis) => [analysis.questionId, analysis]),
  );

  return (
    <div className="space-y-4 p-4">
      {usage && (
        <div className="rounded-xl border border-border bg-surface p-3 text-xs text-muted-foreground shadow-sm">
          {S.result.tokenUsage(
            usage.inputTokens,
            usage.outputTokens,
            usage.totalTokens,
          )}
        </div>
      )}
      {questions.map((question) => {
        const analysis = byId.get(question.id);
        if (!analysis) return null;
        const picked = answers[question.id];
        const correct = picked === analysis.correctAnswer;

        return (
          <div
            key={question.id}
            data-testid={`result-${question.id}`}
            className={`space-y-2.5 rounded-lg border p-3 shadow-sm ${correct ? "border-accent/30 bg-accent/5" : "border-destructive/30 bg-destructive/5"}`}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-medium text-foreground">
                {question.order}.
              </span>
              <span
                className={`inline-flex items-center gap-1 font-medium ${correct ? "text-accent" : "text-destructive"}`}
              >
                {correct ? (
                  <CheckCircle2 size={15} strokeWidth={2} />
                ) : (
                  <XCircle size={15} strokeWidth={2} />
                )}
                {correct ? S.result.correct : S.result.wrong}
              </span>
              {!correct && (
                <span className="text-muted-foreground">
                  {S.result.youChose} {picked ?? S.review.notAttempted}
                </span>
              )}
              <span className="text-muted-foreground">
                {S.result.correctAnswer} {analysis.correctAnswer}
              </span>
            </div>

            <p className="text-sm text-foreground">{question.stem}</p>

            <div className="text-sm">
              <p className="font-medium text-foreground">
                {S.result.explanation}
              </p>
              <p className="whitespace-pre-wrap text-muted-foreground">
                {analysis.explanation}
              </p>
            </div>

            <div className="flex gap-1.5 text-sm">
              <Lightbulb
                size={15}
                strokeWidth={2}
                className="mt-0.5 shrink-0 text-warning"
              />
              <div>
                <p className="font-medium text-foreground">
                  {S.result.strategy}
                </p>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {analysis.strategy}
                </p>
              </div>
            </div>

            {analysis.distractorNotes &&
              Object.keys(analysis.distractorNotes).length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {S.result.distractors}
                  </p>
                  {Object.entries(analysis.distractorNotes).map(
                    ([label, note]) => (
                      <div key={label}>
                        {label}. {note}
                      </div>
                    ),
                  )}
                </div>
              )}

            <p className="inline-block rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted-foreground">
              {analysis.topic}
            </p>

            {!correct &&
              renderErrorPanel(question.id, attemptIdByQuestionId[question.id])}
          </div>
        );
      })}

      <Button
        className="w-full"
        icon={<ArrowLeft size={15} strokeWidth={2} />}
        onClick={onRestart}
      >
        {S.result.backToPaste}
      </Button>
    </div>
  );
}
