import { Lightbulb, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getImage } from '../../shared/storage/history';
import type { HistoryRow } from '../../shared/storage/queries';
import { Button } from '../../shared/components/Button';
import { IconButton } from '../../shared/components/IconButton';
import { S } from '../../shared/strings';
import { RetryPanel } from './RetryPanel';

function ImageStrip({ ids }: { ids: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    let created: string[] = [];
    void Promise.all(ids.map(getImage)).then((blobs) => {
      created = blobs.filter((blob): blob is Blob => blob != null).map((blob) => URL.createObjectURL(blob));
      setUrls(created);
    });
    return () => created.forEach(URL.revokeObjectURL);
  }, [ids]);

  if (urls.length === 0) return null;
  return <div className="flex flex-wrap gap-2">{urls.map((url) => <img key={url} src={url} alt="" className="max-h-48 rounded-lg border border-border" />)}</div>;
}

export function QuestionDetail({ row, onClose, onAttemptRecorded }: {
  row: HistoryRow;
  onClose: () => void;
  /** Called after a retry so the list can refresh. */
  onAttemptRecorded: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const { question, analysis, firstAttempt, attempts } = row;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 pt-16 backdrop-blur-[1px]" onClick={onClose}>
      <div className="w-full max-w-lg space-y-3 rounded-xl border border-border bg-surface p-5 shadow-lg" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-muted-foreground">{S.history.attemptCount(attempts.length)}</p>
          <IconButton aria-label={S.history.close} onClick={onClose}>
            <X size={16} strokeWidth={2} />
          </IconButton>
        </div>

        <ImageStrip ids={question.imageIds} />

        {question.passage && <p className="text-xs whitespace-pre-wrap text-muted-foreground">{question.passage}</p>}
        <p className="text-sm text-foreground">{question.stem}</p>

        {/* While retrying, nothing on screen may give the answer away. */}
        <div className="space-y-1 text-sm text-muted-foreground">
          {question.choices.map((choice) => (
            <div key={choice.label} className={!retrying && choice.label === analysis?.correctAnswer ? 'font-medium text-accent' : ''}>{choice.label}. {choice.text}</div>
          ))}
        </div>

        {!retrying && firstAttempt && <p className="text-sm text-foreground">{S.history.yourAnswer} {firstAttempt.userAnswer ?? S.review.notAttempted} · {S.result.correctAnswer} {analysis?.correctAnswer}</p>}

        {analysis && (
          <>
            <div className="text-sm">
              <p className="font-medium text-foreground">{S.result.explanation}</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{analysis.explanation}</p>
            </div>
            <div className="flex gap-1.5 text-sm">
              <Lightbulb size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-warning" />
              <div>
                <p className="font-medium text-foreground">{S.result.strategy}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{analysis.strategy}</p>
              </div>
            </div>
            <p className="inline-block rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted-foreground">{analysis.topic}</p>
          </>
        )}

        {/* A question with no stored analysis has no answer to check against, so it cannot be retried. */}
        {analysis && (retrying
          ? <RetryPanel row={row} onDone={onAttemptRecorded} />
          : <Button icon={<RotateCcw size={14} strokeWidth={2} />} onClick={() => setRetrying(true)}>{S.history.retry}</Button>)}
      </div>
    </div>
  );
}
