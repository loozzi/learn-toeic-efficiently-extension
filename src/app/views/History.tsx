import { useEffect, useMemo, useState } from 'react';
import { ERROR_TAG_ORDER, S } from '../../shared/strings';
import { type HistoryFilter, type HistoryRow, applyFilter, listHistory } from '../../shared/storage/queries';
import type { ErrorTag } from '../../shared/types';
import { QuestionDetail } from './QuestionDetail';

const EMPTY: HistoryFilter = {};

export function History() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY);
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = () => listHistory().then(setRows);
  useEffect(() => { void reload(); }, []);

  const topics = useMemo(() => [...new Set((rows ?? []).map((row) => row.analysis?.topic).filter(Boolean) as string[])].sort(), [rows]);
  const parts = useMemo(() => [...new Set((rows ?? []).map((row) => row.question.toeicPart).filter(Boolean) as number[])].sort(), [rows]);

  if (rows == null) return null;
  if (rows.length === 0) return <p className="text-sm text-gray-600">{S.history.empty}</p>;

  const visible = applyFilter(rows, filter);
  const open = visible.find((row) => row.question.id === openId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className="rounded border p-2 text-sm" placeholder={S.history.searchPlaceholder} value={filter.search ?? ''} onChange={(event) => setFilter((current) => ({ ...current, search: event.target.value || undefined }))} />

        <select aria-label={S.history.outcomeLabel} className="rounded border p-2 text-sm" value={filter.outcome ?? ''} onChange={(event) => setFilter((current) => ({ ...current, outcome: (event.target.value || undefined) as HistoryFilter['outcome'] }))}>
          <option value="">{S.history.allOutcomes}</option>
          <option value="correct">{S.history.onlyCorrect}</option>
          <option value="wrong">{S.history.onlyWrong}</option>
        </select>

        <select aria-label={S.history.allParts} className="rounded border p-2 text-sm" value={filter.toeicPart ?? ''} onChange={(event) => setFilter((current) => ({ ...current, toeicPart: event.target.value ? Number(event.target.value) : undefined }))}>
          <option value="">{S.history.allParts}</option>
          {parts.map((part) => <option key={part} value={part}>{S.history.part(part)}</option>)}
        </select>

        <select aria-label={S.history.allTopics} className="rounded border p-2 text-sm" value={filter.topic ?? ''} onChange={(event) => setFilter((current) => ({ ...current, topic: event.target.value || undefined }))}>
          <option value="">{S.history.allTopics}</option>
          {topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
        </select>

        <select aria-label={S.history.allTags} className="rounded border p-2 text-sm" value={filter.errorTag ?? ''} onChange={(event) => setFilter((current) => ({ ...current, errorTag: (event.target.value || undefined) as ErrorTag | undefined }))}>
          <option value="">{S.history.allTags}</option>
          {ERROR_TAG_ORDER.map((tag) => <option key={tag} value={tag}>{S.errorTag[tag]}</option>)}
        </select>

        <button className="rounded border px-3 py-2 text-sm" onClick={() => setFilter(EMPTY)}>{S.history.clearFilters}</button>
      </div>

      <p className="text-xs text-gray-500">{S.history.countLabel(visible.length)}</p>

      {visible.length === 0 && <p className="text-sm text-gray-600">{S.history.noMatch}</p>}

      {open && <QuestionDetail row={open} onClose={() => setOpenId(null)} onAttemptRecorded={() => void reload()} />}

      <div className="space-y-2">
        {visible.map((row) => (
          <button key={row.question.id} className="block w-full rounded border p-3 text-left text-sm hover:bg-gray-50" onClick={() => setOpenId(row.question.id)}>
            <span className={row.firstAttempt?.isCorrect ? 'text-green-700' : 'text-red-700'}>{row.firstAttempt?.isCorrect ? S.result.correct : S.result.wrong}</span>
            <span className="ml-2">{row.question.stem}</span>
            {row.analysis && <span className="ml-2 text-xs text-gray-400">{row.analysis.topic}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
