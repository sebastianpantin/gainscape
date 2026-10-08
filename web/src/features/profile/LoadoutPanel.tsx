import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { fetchSkills } from '../../lib/catalog.ts';
import { bonusRows, loadoutBySlot } from '../../lib/gear-rules.ts';
import { useLoadout } from './use-loadout.ts';

interface LoadoutPanelProps {
  userId: string;
}

export function LoadoutPanel({ userId }: LoadoutPanelProps) {
  const headingId = useId();
  const bonusHeadingId = useId();
  const loadout = useLoadout(userId);
  const skills = useQuery({ queryKey: ['skills'], queryFn: fetchSkills });

  if (loadout.isSuccess && loadout.data === null) return null;

  const slots = loadout.data?.slots ?? [];
  const bonus = bonusRows(slots, skills.data ?? []);

  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h2 id={headingId}>Loadout</h2>
      {loadout.isPending ? (
        <p className="muted">Loading loadout…</p>
      ) : loadout.isError ? (
        <p className="muted">Couldn't load the loadout.</p>
      ) : (
        <>
          <dl className="body-stats">
            {loadoutBySlot(slots).map((row) => (
              <div className="body-stat" key={row.slot}>
                <dt className="muted tiny">{row.label}</dt>
                <dd>{row.gear?.name ?? 'Empty'}</dd>
              </div>
            ))}
          </dl>
          <span className="muted tiny" id={bonusHeadingId}>
            Gear bonus
          </span>
          {bonus.length === 0 ? (
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
