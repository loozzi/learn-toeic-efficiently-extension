import { AlertCircle, ListChecks, Sparkles, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  type SerializedError,
  deserializeError,
  errorMessage,
} from "../../shared/errors";
import { PORT_WEAKNESS, type WeaknessEvent } from "../../shared/messages";
import { type HistoryRow, listHistory } from "../../shared/storage/queries";
import { getAllSessions } from "../../shared/storage/history";
import { computeStats } from "../../shared/storage/stats";
import { Button } from "../../shared/components/Button";
import { S } from "../../shared/strings";
import { StatBar } from "../components/StatBar";
import type { Session } from "../../shared/types";

type Summary =
  | { kind: "idle" }
  | { kind: "running"; text: string }
  | { kind: "done"; text: string }
  | { kind: "error"; error: SerializedError };

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-1 items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function Stats() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [includeRetries, setIncludeRetries] = useState(false);
  const [summary, setSummary] = useState<Summary>({ kind: "idle" });

  useEffect(() => {
    void Promise.all([listHistory(), getAllSessions()]).then(
      ([history, allSessions]) => {
        setRows(history);
        setSessions(allSessions);
      },
    );
  }, []);

  const stats = useMemo(
    () => (rows ? computeStats(rows, { includeRetries }) : null),
    [rows, includeRetries],
  );
  const tokenUsage = useMemo(() => {
    if (!sessions) return null;
    return sessions.reduce(
      (accumulator, session) => {
        if (!session.analysisUsage) return accumulator;
        accumulator.inputTokens += session.analysisUsage.inputTokens;
        accumulator.outputTokens += session.analysisUsage.outputTokens;
        accumulator.totalTokens += session.analysisUsage.totalTokens;
        return accumulator;
      },
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    );
  }, [sessions]);

  function summarise() {
    if (!stats) return;
    setSummary({ kind: "running", text: "" });

    const port = chrome.runtime.connect({ name: PORT_WEAKNESS });
    port.onMessage.addListener((event: WeaknessEvent) => {
      if (event.type === "delta") {
        setSummary((current) =>
          current.kind === "running"
            ? { kind: "running", text: current.text + event.text }
            : current,
        );
      } else if (event.type === "done") {
        setSummary({ kind: "done", text: event.text });
        port.disconnect();
      } else {
        setSummary({ kind: "error", error: event.error });
        port.disconnect();
      }
    });
    port.postMessage(stats);
  }

  if (rows == null || stats == null) return null;
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">{S.stats.empty}</p>;

  const maxWeekTotal = Math.max(1, ...stats.byWeek.map((week) => week.total));
  const maxTagCount = Math.max(
    1,
    ...stats.errorTagCounts.map((tag) => tag.count),
  );

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold text-foreground">{S.tabs.stats}</h1>

      <div className="flex flex-wrap items-center gap-3">
        <KpiCard
          icon={<Target size={18} strokeWidth={2} />}
          label={S.stats.accuracy}
          value={`${Math.round(stats.accuracy * 100)}%`}
        />
        <KpiCard
          icon={<ListChecks size={18} strokeWidth={2} />}
          label={S.stats.attempted}
          value={stats.total}
        />
        <label className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground shadow-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={includeRetries}
            onChange={(event) => setIncludeRetries(event.target.checked)}
          />
          {S.stats.includeRetries}
        </label>
      </div>

      {tokenUsage && (
        <section className="space-y-2.5 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h3 className="text-sm font-medium text-foreground">
            {S.stats.tokenUsage}
          </h3>
          <div className="grid gap-2 sm:grid-cols-3">
            <KpiCard
              icon={<Sparkles size={18} strokeWidth={2} />}
              label={S.stats.inputTokens}
              value={tokenUsage.inputTokens}
            />
            <KpiCard
              icon={<Sparkles size={18} strokeWidth={2} />}
              label={S.stats.outputTokens}
              value={tokenUsage.outputTokens}
            />
            <KpiCard
              icon={<Sparkles size={18} strokeWidth={2} />}
              label={S.stats.totalTokens}
              value={tokenUsage.totalTokens}
            />
          </div>
        </section>
      )}

      <section className="space-y-2.5 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h3 className="text-sm font-medium text-foreground">
          {S.stats.topMissed}
        </h3>
        {stats.topMissedTopics.slice(0, 10).map((topic) => (
          <StatBar
            key={topic.topic}
            label={topic.topic}
            value={topic.wrong}
            max={topic.total}
            caption={S.stats.wrongCount(topic.wrong, topic.total)}
          />
        ))}
      </section>

      <section className="space-y-2.5 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h3 className="text-sm font-medium text-foreground">
          {S.stats.reasons}
        </h3>
        {stats.errorTagCounts.map((tag) => (
          <StatBar
            key={tag.tag}
            label={S.errorTag[tag.tag]}
            value={tag.count}
            max={maxTagCount}
            caption={String(tag.count)}
          />
        ))}
      </section>

      <section className="space-y-2.5 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h3 className="text-sm font-medium text-foreground">
          {S.stats.byPart}
        </h3>
        {stats.byPart.map((part) => (
          <StatBar
            key={part.part}
            label={S.history.part(part.part)}
            value={part.correct}
            max={part.total}
            caption={`${part.correct}/${part.total}`}
          />
        ))}
      </section>

      <section className="space-y-2.5 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h3 className="text-sm font-medium text-foreground">
          {S.stats.byWeek}
        </h3>
        {stats.byWeek.map((week) => (
          <StatBar
            key={week.weekStart}
            label={S.stats.weekLabel(week.weekStart)}
            value={week.correct}
            max={maxWeekTotal}
            caption={`${week.correct}/${week.total}`}
          />
        ))}
      </section>

      <section className="space-y-2.5">
        <Button
          variant="primary"
          icon={<Sparkles size={15} strokeWidth={2} />}
          disabled={summary.kind === "running"}
          onClick={summarise}
        >
          {summary.kind === "running"
            ? S.stats.weaknessRunning
            : S.stats.weaknessButton}
        </Button>
        {(summary.kind === "running" || summary.kind === "done") && (
          <p className="rounded-xl border border-border bg-surface-muted p-4 text-sm whitespace-pre-wrap text-foreground">
            {summary.text}
          </p>
        )}
        {summary.kind === "error" && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle size={14} strokeWidth={2} />
            {errorMessage(deserializeError(summary.error))}
          </p>
        )}
      </section>
    </div>
  );
}
