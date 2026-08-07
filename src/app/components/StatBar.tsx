export function StatBar({ label, value, max, caption }: { label: string; value: number; max: number; caption?: string }) {
  const percent = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-56 shrink-0 truncate">{label}</span>
      <span className="h-2 flex-1 rounded bg-gray-200">
        <span className="block h-2 rounded bg-blue-600" style={{ width: `${percent}%` }} />
      </span>
      {caption && <span className="w-24 shrink-0 text-right text-xs text-gray-500">{caption}</span>}
    </div>
  );
}
