import { type ReactNode, useId } from 'react';
import { type LoadedState } from '../../lib/query/query-state-rules.ts';
import { type BodySkill, muscleRecoveryText } from '../../lib/progress/recovery-rules.ts';
import {
  type MuscleVolume,
  VOLUME_BAND_TEXT,
  VOLUME_TARGET,
  volumeSetsLabel,
} from '../../lib/progress/weekly-volume-rules.ts';
import { useBodyStatus } from './body-status.ts';
import { VolumeBar } from './VolumeBar.tsx';
import { VolumeContributionList } from './VolumeContributionList.tsx';

interface StatusSectionProps<T> {
  title: string;
  state: LoadedState<T>;
  children: (data: T) => ReactNode;
}

function StatusSection<T>({ title, state, children }: StatusSectionProps<T>) {
  const headingId = useId();
  if (state.status === 'loading') return null;
  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {state.status === 'failed' ? (
        <p className="muted">This needs a connection to load your recent sets.</p>
      ) : (
        children(state.data)
      )}
    </section>
  );
}

function MuscleWeek({ name, volume }: { name: string; volume: MuscleVolume }) {
  return (
    <>
      <p className="row spread">
        <span>{volumeSetsLabel(volume.sets)}</span>
        <span className="muted">{VOLUME_BAND_TEXT[volume.band]}</span>
      </p>
      <VolumeBar volume={volume} />
      <VolumeContributionList name={name} volume={volume} />
      <p className="muted tiny">
        Working sets since Monday. The marked band is a target of {VOLUME_TARGET.min} to {VOLUME_TARGET.max} sets a
        week.
      </p>
    </>
  );
}

interface MuscleStatusProps {
  userId: string;
  skill: BodySkill;
  name: string;
}

export function MuscleStatus({ userId, skill, name }: MuscleStatusProps) {
  const status = useBodyStatus(userId);
  return (
    <>
      <StatusSection title="Recovery" state={status.recovery}>
        {(load) => <p>{muscleRecoveryText(load[skill])}</p>}
      </StatusSection>
      <StatusSection title="Sets this week" state={status.volume}>
        {(volume) => <MuscleWeek name={name} volume={volume[skill]} />}
      </StatusSection>
    </>
  );
}
