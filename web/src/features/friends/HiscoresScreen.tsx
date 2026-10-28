import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState.tsx';
import { SegmentedChoice } from '../../components/SegmentedChoice.tsx';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { hiscoresQuery, skillsQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { type HiscoreMetric, rankHiscores, skillMetric } from '../../lib/social/social-rules.ts';
import { TermHelp } from '../../components/TermHelp.tsx';
import { FriendsTabs } from './FriendsTabs.tsx';

export function HiscoresScreen() {
  const skillsLoad = useQuery(skillsQuery);
  const hiscores = useQuery(hiscoresQuery);
  const [metric, setMetric] = useState<HiscoreMetric>('total');
  const load = loadedState(
    skillsLoad.data && hiscores.data ? { skills: skillsLoad.data, rows: hiscores.data } : undefined,
    skillsLoad.isFetching || hiscores.isFetching ? null : (skillsLoad.error ?? hiscores.error),
  );
  const skills = load.status === 'ready' ? load.data.skills : null;
  const rows = load.status === 'ready' ? load.data.rows : null;
  const problem = load.status === 'failed' ? load.problem : null;

  const metrics: { key: HiscoreMetric; label: string }[] = [
    { key: 'total', label: 'Total' },
    { key: 'combat', label: 'Combat' },
    { key: 'collection', label: 'Collection' },
    ...(skills ?? []).map((skill) => ({ key: skillMetric(skill.key), label: skill.name })),
  ];
  const ranked = skills && rows ? rankHiscores(rows, skills, metric) : [];
  const metricLabel = metrics.find((entry) => entry.key === metric)?.label ?? 'Total';

  return (
    <main className="screen stack">
      <h1 className="title">Friends</h1>
      <FriendsTabs />
      {problem && (
        <ProblemWithRetry problem={problem} onRetry={() => Promise.all([skillsLoad.refetch(), hiscores.refetch()])} />
      )}
      {load.status === 'loading' && <ListSkeleton panels={1} />}
      {rows && rows.length <= 1 && (
        <EmptyState text="Add friends to rank yourself against them." startLabel="Add a friend" to="/friends" />
      )}
      {skills && rows && rows.length > 1 && (
        <>
          <div className="row muted">
            Rank yourself against your friends <TermHelp glossaryKey="hiscores" />
          </div>
          <SegmentedChoice
            label="Rank by"
            options={metrics.map((entry) => ({ value: entry.key, label: entry.label }))}
            current={metric}
            wrapped
            onPick={setMetric}
          />
          <ol className="panel hiscores" aria-label={`Ranked by ${metricLabel}`}>
            {ranked.map(({ row, value }, index) => (
              <li className={row.isSelf ? 'hiscore-row me' : 'hiscore-row'} key={row.userId}>
                <span className="hiscore-rank">{index + 1}</span>
                <Link className="hiscore-name" to={row.isSelf ? '/profile' : `/friends/${row.userId}`}>
                  {row.isSelf ? `${row.username} (you)` : row.username}
                </Link>
                <span className="hiscore-value">{metric === 'collection' ? `${value}%` : value}</span>
              </li>
            ))}
          </ol>
          <p className="muted">Only you and your friends. Hiscores rank levels, never weights.</p>
        </>
      )}
    </main>
  );
}
