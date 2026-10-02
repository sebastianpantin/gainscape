import { useEffect, useState } from 'react';
import { fetchSkills } from '../../lib/catalog.ts';
import type { Skill } from '../../lib/catalog-rules.ts';
import { fetchHiscores } from '../../lib/social.ts';
import { type HiscoreMetric, type HiscoreRow, rankHiscores, skillMetric } from '../../lib/social-rules.ts';
import { FriendsTabs } from './FriendsTabs.tsx';

export function HiscoresScreen() {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [rows, setRows] = useState<HiscoreRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [metric, setMetric] = useState<HiscoreMetric>('total');

  useEffect(() => {
    let active = true;
    Promise.all([fetchSkills(), fetchHiscores()]).then(
      ([loadedSkills, loadedRows]) => {
        if (!active) return;
        setSkills(loadedSkills);
        setRows(loadedRows);
      },
      (error: Error) => active && setProblem(error.message),
    );
    return () => {
      active = false;
    };
  }, []);

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
          <div className="metric-grid" role="radiogroup" aria-label="Rank by">
            {metrics.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="radio"
                aria-checked={metric === entry.key}
                className={`effort-option ${metric === entry.key ? 'selected' : ''}`}
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
