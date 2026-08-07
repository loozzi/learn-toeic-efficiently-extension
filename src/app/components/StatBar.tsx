export function StatBar({ label, value, max, caption }: { label: string; value: number; max: number; caption?: string }) {
  const percent = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-56 shrink-0 truncate text-foreground">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <span className="block h-2 rounded-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </span>
      {caption && <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">{caption}</span>}
    </div>
  );
}
