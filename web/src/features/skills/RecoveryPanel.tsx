import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { BodyMap } from '../../components/BodyMap.tsx';
import { exerciseListQuery, recentSetsQuery } from '../../lib/query/queries.ts';
import {
  type BodySkill,
  recoveryBySkill,
  recoveryGroups,
  type RecoveryState,
} from '../../lib/progress/recovery-rules.ts';

const GROUP_LABELS: Record<RecoveryState, string> = {
  recovering: 'Recovering',
  easing: 'Almost fresh',
  fresh: 'Fresh',
};

interface RecoveryPanelProps {
  userId: string;
  nameOf: (skill: BodySkill) => string;
}

export function RecoveryPanel({ userId, nameOf }: RecoveryPanelProps) {
  const headingId = useId();
  const recent = useQuery(recentSetsQuery(userId));
  const exercises = useQuery(exerciseListQuery(userId));
  const [openedAt] = useState(Date.now);
  if (!recent.data || !exercises.data) {
    if (!recent.isError && !exercises.isError) return null;
    return (
      <section className="panel stack" aria-labelledby={headingId}>
        <h2 id={headingId}>Recovery</h2>
        <p className="muted">Recovery needs a connection to load your recent sets.</p>
      </section>
    );
  }
  const shares = new Map(exercises.data.map((exercise) => [exercise.id, exercise.skillShares]));
  const states = recoveryBySkill(recent.data, shares, Math.max(openedAt, recent.dataUpdatedAt));
  const groups = recoveryGroups(states, nameOf);
  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h2 id={headingId}>Recovery</h2>
      <BodyMap states={states} />
      <ul className="recovery-legend">
        {(Object.keys(GROUP_LABELS) as RecoveryState[])
          .filter((state) => groups[state].length > 0)
          .map((state) => (
            <li key={state}>
              <span className={`recovery-swatch ${state}`} aria-hidden="true" />
              <span>
                <strong>{GROUP_LABELS[state]}:</strong> {groups[state].join(', ')}
              </span>
            </li>
          ))}
      </ul>
      <p className="muted tiny">Hard sets each muscle took in the last week, fading by half every day and a half.</p>
    </section>
  );
}
