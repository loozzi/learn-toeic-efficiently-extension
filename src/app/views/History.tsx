import { CheckCircle2, Search, X, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ERROR_TAG_ORDER, S } from '../../shared/strings';
import { type HistoryFilter, type HistoryRow, applyFilter, listHistory } from '../../shared/storage/queries';
import { Button } from '../../shared/components/Button';
import type { ErrorTag } from '../../shared/types';
import { QuestionDetail } from './QuestionDetail';

const EMPTY: HistoryFilter = {};

const selectClass = 'rounded-lg border border-border bg-surface p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function History() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY);
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = () => listHistory().then(setRows);
  useEffect(() => { void reload(); }, []);

  const topics = useMemo(() => [...new Set((rows ?? []).map((row) => row.analysis?.topic).filter(Boolean) as string[])].sort(), [rows]);
  const parts = useMemo(() => [...new Set((rows ?? []).map((row) => row.question.toeicPart).filter(Boolean) as number[])].sort(), [rows]);

  if (rows == null) return null;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{S.history.empty}</p>;

  const visible = applyFilter(rows, filter);
  const open = visible.find((row) => row.question.id === openId);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">{S.tabs.history}</h1>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} strokeWidth={2} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${selectClass} pl-8`}
            placeholder={S.history.searchPlaceholder}
            value={filter.search ?? ''}
            onChange={(event) => setFilter((current) => ({ ...current, search: event.target.value || undefined }))}
          />
        </div>

        <select aria-label={S.history.outcomeLabel} className={selectClass} value={filter.outcome ?? ''} onChange={(event) => setFilter((current) => ({ ...current, outcome: (event.target.value || undefined) as HistoryFilter['outcome'] }))}>
          <option value="">{S.history.allOutcomes}</option>
          <option value="correct">{S.history.onlyCorrect}</option>
          <option value="wrong">{S.history.onlyWrong}</option>
        </select>

        <select aria-label={S.history.allParts} className={selectClass} value={filter.toeicPart ?? ''} onChange={(event) => setFilter((current) => ({ ...current, toeicPart: event.target.value ? Number(event.target.value) : undefined }))}>
          <option value="">{S.history.allParts}</option>
          {parts.map((part) => <option key={part} value={part}>{S.history.part(part)}</option>)}
        </select>

        <select aria-label={S.history.allTopics} className={selectClass} value={filter.topic ?? ''} onChange={(event) => setFilter((current) => ({ ...current, topic: event.target.value || undefined }))}>
          <option value="">{S.history.allTopics}</option>
          {topics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
        </select>

        <select aria-label={S.history.allTags} className={selectClass} value={filter.errorTag ?? ''} onChange={(event) => setFilter((current) => ({ ...current, errorTag: (event.target.value || undefined) as ErrorTag | undefined }))}>
          <option value="">{S.history.allTags}</option>
          {ERROR_TAG_ORDER.map((tag) => <option key={tag} value={tag}>{S.errorTag[tag]}</option>)}
        </select>

        <Button size="sm" icon={<X size={13} strokeWidth={2} />} onClick={() => setFilter(EMPTY)}>{S.history.clearFilters}</Button>
      </div>

      <p className="text-xs text-muted-foreground">{S.history.countLabel(visible.length)}</p>

      {visible.length === 0 && <p className="text-sm text-muted-foreground">{S.history.noMatch}</p>}

      {open && <QuestionDetail row={open} onClose={() => setOpenId(null)} onAttemptRecorded={() => void reload()} />}

      <div className="space-y-2">
        {visible.map((row) => {
          const correct = row.firstAttempt?.isCorrect;
          return (
            <button
              key={row.question.id}
              className="flex w-full items-start gap-3 rounded-lg border border-border bg-surface p-3 text-left text-sm shadow-sm transition-colors duration-150 hover:border-primary/40 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setOpenId(row.question.id)}
            >
              {correct
                ? <CheckCircle2 size={17} strokeWidth={2} className="mt-0.5 shrink-0 text-accent" />
                : <XCircle size={17} strokeWidth={2} className="mt-0.5 shrink-0 text-destructive" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-foreground">{row.question.stem}</span>
                {row.analysis && <span className="mt-0.5 inline-block rounded-full bg-surface-muted px-2 py-0.5 text-xs text-muted-foreground">{row.analysis.topic}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
