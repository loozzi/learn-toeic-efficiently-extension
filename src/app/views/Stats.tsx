import { useEffect, useMemo, useState } from 'react';
import { type SerializedError, deserializeError, errorMessage } from '../../shared/errors';
import { PORT_WEAKNESS, type WeaknessEvent } from '../../shared/messages';
import { type HistoryRow, listHistory } from '../../shared/storage/queries';
import { computeStats } from '../../shared/storage/stats';
import { S } from '../../shared/strings';
import { StatBar } from '../components/StatBar';

type Summary =
  | { kind: 'idle' }
  | { kind: 'running'; text: string }
  | { kind: 'done'; text: string }
  | { kind: 'error'; error: SerializedError };

export function Stats() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [includeRetries, setIncludeRetries] = useState(false);
  const [summary, setSummary] = useState<Summary>({ kind: 'idle' });

  useEffect(() => { void listHistory().then(setRows); }, []);

  const stats = useMemo(() => (rows ? computeStats(rows, { includeRetries }) : null), [rows, includeRetries]);

  function summarise() {
    if (!stats) return;
    setSummary({ kind: 'running', text: '' });

    const port = chrome.runtime.connect({ name: PORT_WEAKNESS });
    port.onMessage.addListener((event: WeaknessEvent) => {
      if (event.type === 'delta') {
        setSummary((current) => current.kind === 'running' ? { kind: 'running', text: current.text + event.text } : current);
      } else if (event.type === 'done') {
        setSummary({ kind: 'done', text: event.text });
        port.disconnect();
      } else {
        setSummary({ kind: 'error', error: event.error });
        port.disconnect();
      }
    });
    port.postMessage(stats);
  }

  if (rows == null || stats == null) return null;
  if (rows.length === 0) return <p className="text-sm text-gray-600">{S.stats.empty}</p>;

  const maxWeekTotal = Math.max(1, ...stats.byWeek.map((week) => week.total));
  const maxTagCount = Math.max(1, ...stats.errorTagCounts.map((tag) => tag.count));

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-8">
        <div>
          <p className="text-xs text-gray-500">{S.stats.accuracy}</p>
          <p className="text-2xl font-semibold">{Math.round(stats.accuracy * 100)}%</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">{S.stats.attempted}</p>
          <p className="text-2xl font-semibold">{stats.total}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeRetries} onChange={(event) => setIncludeRetries(event.target.checked)} />
          {S.stats.includeRetries}
        </label>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{S.stats.topMissed}</h3>
        {stats.topMissedTopics.slice(0, 10).map((topic) => <StatBar key={topic.topic} label={topic.topic} value={topic.wrong} max={topic.total} caption={S.stats.wrongCount(topic.wrong, topic.total)} />)}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{S.stats.reasons}</h3>
        {stats.errorTagCounts.map((tag) => <StatBar key={tag.tag} label={S.errorTag[tag.tag]} value={tag.count} max={maxTagCount} caption={String(tag.count)} />)}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{S.stats.byPart}</h3>
        {stats.byPart.map((part) => <StatBar key={part.part} label={S.history.part(part.part)} value={part.correct} max={part.total} caption={`${part.correct}/${part.total}`} />)}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{S.stats.byWeek}</h3>
        {stats.byWeek.map((week) => <StatBar key={week.weekStart} label={S.stats.weekLabel(week.weekStart)} value={week.correct} max={maxWeekTotal} caption={`${week.correct}/${week.total}`} />)}
      </section>

      <section className="space-y-2">
        <button className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={summary.kind === 'running'} onClick={summarise}>{summary.kind === 'running' ? S.stats.weaknessRunning : S.stats.weaknessButton}</button>
        {(summary.kind === 'running' || summary.kind === 'done') && <p className="whitespace-pre-wrap rounded bg-gray-50 p-3 text-sm">{summary.text}</p>}
        {summary.kind === 'error' && <p className="text-sm text-red-600">{errorMessage(deserializeError(summary.error))}</p>}
      </section>
    </div>
  );
}
