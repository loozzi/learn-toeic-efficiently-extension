import { useState } from 'react';
import { S } from '../shared/strings';
import { History } from './views/History';
import { Settings } from './views/Settings';
import { Stats } from './views/Stats';

type Tab = 'history' | 'stats' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'history', label: S.tabs.history },
  { id: 'stats', label: S.tabs.stats },
  { id: 'settings', label: S.tabs.settings },
];

export function App() {
  const [tab, setTab] = useState<Tab>('history');

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div role="tablist" className="mb-6 flex gap-1 border-b">
        {TABS.map((entry) => (
          <button key={entry.id} role="tab" aria-selected={tab === entry.id} className={`px-4 py-2 text-sm ${tab === entry.id ? 'border-b-2 border-blue-600 font-medium text-blue-700' : 'text-gray-600'}`} onClick={() => setTab(entry.id)}>{entry.label}</button>
        ))}
      </div>

      {tab === 'history' && <History />}
      {tab === 'stats' && <Stats />}
      {tab === 'settings' && <Settings />}
    </div>
  );
}
