import { type BodySkill, muscleRecoveryText } from '../../lib/progress/recovery-rules.ts';
import {
  type MuscleVolume,
  VOLUME_TARGET,
  volumeAmountText,
  volumeBandText,
} from '../../lib/progress/weekly-volume-rules.ts';
import { useBodyStatus } from './body-status.ts';
import { StatusSection } from './StatusSection.tsx';
import { VolumeBar } from './VolumeBar.tsx';
import { VolumeContributionList } from './VolumeContributionList.tsx';

function MuscleWeek({ name, volume }: { name: string; volume: MuscleVolume }) {
  return (
    <>
      <p className="row spread">
        <span>{volumeAmountText(volume.sets)}</span>
        <span className="muted">{volumeBandText(volume.band)}</span>
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
