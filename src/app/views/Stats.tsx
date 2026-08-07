import { useEffect, useState } from 'react';
import { listHistory } from '../../shared/storage/queries';
import { type Stats as StatsData, computeStats } from '../../shared/storage/stats';
import { S } from '../../shared/strings';

export function Stats() {
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => { void listHistory().then((rows) => setStats(computeStats(rows, { includeRetries: false }))); }, []);

  if (stats == null) return null;
  if (stats.total === 0) return <p className="text-sm text-gray-600">{S.stats.empty}</p>;

  return (
    <div className="flex gap-8">
      <div>
        <p className="text-xs text-gray-500">{S.stats.accuracy}</p>
        <p className="text-2xl font-semibold">{Math.round(stats.accuracy * 100)}%</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">{S.stats.attempted}</p>
        <p className="text-2xl font-semibold">{stats.total}</p>
      </div>
    </div>
  );
}
