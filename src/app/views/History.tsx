import { useEffect, useState } from 'react';
import { type HistoryRow, listHistory } from '../../shared/storage/queries';
import { S } from '../../shared/strings';

export function History() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);

  useEffect(() => { void listHistory().then(setRows); }, []);

  if (rows == null) return null;
  if (rows.length === 0) return <p className="text-sm text-gray-600">{S.history.empty}</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">{S.history.countLabel(rows.length)}</p>
      {rows.map((row) => (
        <div key={row.question.id} className="rounded border p-3 text-sm">
          <span className={row.firstAttempt?.isCorrect ? 'text-green-700' : 'text-red-700'}>{row.firstAttempt?.isCorrect ? S.result.correct : S.result.wrong}</span>
          <span className="ml-2">{row.question.stem}</span>
        </div>
      ))}
    </div>
  );
}
