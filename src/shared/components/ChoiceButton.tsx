export function ChoiceButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-foreground hover:bg-surface-muted'
      }`}
    >
      {label}
    </button>
  );
}
