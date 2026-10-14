import { BodyMap } from '../../components/BodyMap.tsx';
import { type LoadedState } from '../../lib/query/query-state-rules.ts';
import {
  type BodySkill,
  recoveryBySkill,
  recoveryGroups,
  type RecoveryState,
} from '../../lib/progress/recovery-rules.ts';
import { StatusSection } from './StatusSection.tsx';

const GROUP_LABELS: Record<RecoveryState, string> = {
  recovering: 'Recovering',
  easing: 'Almost fresh',
  fresh: 'Fresh',
};

interface RecoveryPanelProps {
  recovery: LoadedState<Record<BodySkill, number>>;
  nameOf: (skill: BodySkill) => string;
}

function RecoveryDetails({ load, nameOf }: { load: Record<BodySkill, number>; nameOf: (skill: BodySkill) => string }) {
  const groups = recoveryGroups(load, nameOf);
  return (
    <>
      <BodyMap states={recoveryBySkill(load)} />
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
    </>
  );
}

export function RecoveryPanel({ recovery, nameOf }: RecoveryPanelProps) {
  return (
    <StatusSection title="Recovery" state={recovery}>
      {(load) => <RecoveryDetails load={load} nameOf={nameOf} />}
    </StatusSection>
  );
}
