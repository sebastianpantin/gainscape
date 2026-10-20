import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { bonusRows, loadoutBySlot } from '../../lib/collection/gear-rules.ts';
import { loadoutQuery, skillsQuery } from '../../lib/query/queries.ts';
import { TermHelp } from '../../components/TermHelp.tsx';

interface LoadoutPanelProps {
  userId: string;
}

export function LoadoutPanel({ userId }: LoadoutPanelProps) {
  const headingId = useId();
  const bonusHeadingId = useId();
  const loadout = useQuery(loadoutQuery(userId));
  const skills = useQuery(skillsQuery);

  if (loadout.isSuccess && loadout.data === null) return null;

  const slots = loadout.data?.slots ?? [];
  const bonus = bonusRows(slots, skills.data ?? []);

  return (
    <section className="panel stack" aria-labelledby={headingId} aria-busy={loadout.isPending}>
      <h2 id={headingId}>Loadout</h2>
      {loadout.isPending && <p className="visually-hidden">Loading loadout…</p>}
      {loadout.isError ? (
        <p className="muted">Couldn't load the loadout.</p>
      ) : (
        <>
          <dl className="body-stats">
            {loadoutBySlot(slots).map((row) => (
              <div className="body-stat" key={row.slot}>
                <dt className="muted tiny">{row.label}</dt>
                <dd>{loadout.isPending ? <span aria-hidden="true">…</span> : (row.gear?.name ?? 'Empty')}</dd>
              </div>
            ))}
          </dl>
          <span className="row">
            <span className="muted tiny" id={bonusHeadingId}>
              Gear bonus
            </span>
            <TermHelp glossaryKey="gearBonus" />
          </span>
          {loadout.isPending ? (
            <p className="muted" aria-hidden="true">
              …
            </p>
          ) : bonus.length === 0 ? (
            <p className="muted">No gear bonus</p>
          ) : (
            <ul className="gear-bonus-list" aria-labelledby={bonusHeadingId}>
              {bonus.map((row) => (
                <li key={row.skillKey}>
                  {row.skillName} <span className="accent-text">{row.percent}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
