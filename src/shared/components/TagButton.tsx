export function TagButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-muted-foreground hover:bg-surface-muted'
      }`}
    >
      {label}
    </button>
  );
}
