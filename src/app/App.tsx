import { BarChart3, History as HistoryIcon, Settings as SettingsIcon } from 'lucide-react';
import { useState } from 'react';
import { ThemeToggle } from '../shared/components/ThemeToggle';
import { S } from '../shared/strings';
import { History } from './views/History';
import { Settings } from './views/Settings';
import { Stats } from './views/Stats';

type Tab = 'history' | 'stats' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof HistoryIcon }[] = [
  { id: 'history', label: S.tabs.history, icon: HistoryIcon },
  { id: 'stats', label: S.tabs.stats, icon: BarChart3 },
  { id: 'settings', label: S.tabs.settings, icon: SettingsIcon },
];

export function App() {
  const [tab, setTab] = useState<Tab>('history');

  return (
    <div className="flex min-h-screen bg-background">
      <nav className="flex w-56 shrink-0 flex-col border-r border-border bg-surface px-3 py-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">I</span>
          <span className="font-semibold text-foreground">{S.appName}</span>
        </div>

        <div role="tablist" aria-orientation="vertical" className="flex flex-1 flex-col gap-1">
          {TABS.map((entry) => {
            const Icon = entry.icon;
            const selected = tab === entry.id;
            return (
              <button
                key={entry.id}
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(entry.id)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selected ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground'
                }`}
              >
                <Icon size={17} strokeWidth={2} />
                {entry.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end px-2 pt-2">
          <ThemeToggle />
        </div>
      </nav>

      <main className="min-w-0 flex-1 px-8 py-8">
        <div className="mx-auto max-w-4xl">
          {tab === 'history' && <History />}
          {tab === 'stats' && <Stats />}
          {tab === 'settings' && <Settings />}
        </div>
      </main>
    </div>
  );
}
