import { useQuery } from '@tanstack/react-query';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { lootStatsQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { type LootStatsRow, lootStatsView, NO_LOOT_ROLLS_TEXT } from '../../lib/stats/loot-stats-rules.ts';

function LootStatsList({ stats }: { stats: LootStatsRow }) {
  const view = lootStatsView(stats);
  if (view === null) return <p className="muted">{NO_LOOT_ROLLS_TEXT}</p>;
  return (
    <>
      <dl className="stack">
        {view.entries.map((entry) => (
          <div key={entry.label} className="row spread">
            <dt>{entry.label}</dt>
            <dd>{entry.value}</dd>
          </div>
        ))}
      </dl>
      {view.luckText !== null && <p className="muted">{view.luckText}</p>}
    </>
  );
}

export function LootStatsSection({ userId }: { userId: string }) {
  const lootStats = useQuery(lootStatsQuery(userId));
  const loaded = loadedState(lootStats.data?.loaded, lootStats.error);

  return (
    <section className="panel stack" aria-labelledby="stats-loot">
      <h2 id="stats-loot">Loot</h2>
      {loaded.status === 'loading' && <ListSkeleton panels={1} />}
      {loaded.status === 'failed' && <ProblemWithRetry problem={loaded.problem} onRetry={lootStats.refetch} />}
      {loaded.status === 'ready' && <LootStatsList stats={loaded.data} />}
    </section>
  );
}
