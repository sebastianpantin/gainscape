import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
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
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      {(!skills || !rows) && !problem && <p>Loading…</p>}
      {skills && rows && (
        <>
          <div className="row muted">
            Rank yourself against your friends <TermHelp glossaryKey="hiscores" />
          </div>
          <div className="metric-grid" role="radiogroup" aria-label="Rank by">
            {metrics.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="radio"
                aria-checked={metric === entry.key}
                className="button chip"
                onClick={() => setMetric(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <ol className="panel hiscores" aria-label={`Ranked by ${metricLabel}`}>
            {ranked.map(({ row, value }, index) => (
              <li className={row.isSelf ? 'hiscore-row me' : 'hiscore-row'} key={row.userId}>
                <span className="hiscore-rank">{index + 1}</span>
                <span className="hiscore-name">{row.isSelf ? `${row.username} (you)` : row.username}</span>
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
