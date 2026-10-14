import { useId } from 'react';
import { BodyMap } from '../../components/BodyMap.tsx';
import { type LoadedState } from '../../lib/query/query-state-rules.ts';
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
  recovery: LoadedState<Record<BodySkill, number>>;
  nameOf: (skill: BodySkill) => string;
}

export function RecoveryPanel({ recovery, nameOf }: RecoveryPanelProps) {
  const headingId = useId();
  if (recovery.status === 'loading') return null;
  if (recovery.status === 'failed')
    return (
      <section className="panel stack" aria-labelledby={headingId}>
        <h2 id={headingId}>Recovery</h2>
        <p className="muted">Recovery needs a connection to load your recent sets.</p>
      </section>
    );
  const groups = recoveryGroups(recovery.data, nameOf);
  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h2 id={headingId}>Recovery</h2>
      <BodyMap states={recoveryBySkill(recovery.data)} />
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
      <p className="muted tiny">
        Hard sets each muscle took in the last week, fading by half every day and a half. Times show how long until each
        muscle is fresh.
      </p>
    </section>
  );
}
