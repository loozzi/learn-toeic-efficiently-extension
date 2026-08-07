import { useEffect, useState } from 'react';
import { getImage } from '../../shared/storage/history';
import type { HistoryRow } from '../../shared/storage/queries';
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
  return <div className="flex flex-wrap gap-2">{urls.map((url) => <img key={url} src={url} alt="" className="max-h-48 rounded border" />)}</div>;
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
    <div className="space-y-3 rounded border bg-white p-4">
      <ImageStrip ids={question.imageIds} />

      {question.passage && <p className="text-xs whitespace-pre-wrap text-gray-500">{question.passage}</p>}
      <p className="text-sm">{question.stem}</p>

      {/* While retrying, nothing on screen may give the answer away. */}
      <div className="text-sm text-gray-700">
        {question.choices.map((choice) => <div key={choice.label} className={!retrying && choice.label === analysis?.correctAnswer ? 'font-medium' : ''}>{choice.label}. {choice.text}</div>)}
      </div>

      {!retrying && firstAttempt && <p className="text-sm">{S.history.yourAnswer} {firstAttempt.userAnswer ?? S.review.notAttempted} · {S.result.correctAnswer} {analysis?.correctAnswer}</p>}

      {analysis && (
        <>
          <div className="text-sm">
            <p className="font-medium">{S.result.explanation}</p>
            <p className="whitespace-pre-wrap text-gray-700">{analysis.explanation}</p>
          </div>
          <div className="text-sm">
            <p className="font-medium">{S.result.strategy}</p>
            <p className="whitespace-pre-wrap text-gray-700">{analysis.strategy}</p>
          </div>
          <p className="text-xs text-gray-400">{analysis.topic}</p>
        </>
      )}

      <p className="text-xs text-gray-500">{S.history.attemptCount(attempts.length)}</p>

      {/* A question with no stored analysis has no answer to check against, so it cannot be retried. */}
      {analysis && (retrying
        ? <RetryPanel row={row} onDone={onAttemptRecorded} />
        : <button className="rounded border px-3 py-1 text-sm" onClick={() => setRetrying(true)}>{S.history.retry}</button>)}

      <button className="rounded border px-3 py-1 text-sm" onClick={onClose}>{S.history.close}</button>
    </div>
  );
}
