import { ScreenSkeleton } from '../../components/ScreenSkeleton.tsx';
import { type BodySkill } from '../../lib/progress/recovery-rules.ts';
import { useStanding } from '../../lib/progress/standing.ts';
import { BackToSkills } from './BackToSkills.tsx';
import { useBodyStatus } from './body-status.ts';
import { RecoveryPanel } from './RecoveryPanel.tsx';
import { WeeklyVolumePanel } from './WeeklyVolumePanel.tsx';

interface BodyScreenProps {
  userId: string;
}

export function BodyScreen({ userId }: BodyScreenProps) {
  const standing = useStanding(userId);
  const { recovery, volume } = useBodyStatus(userId);
  if (standing.status === 'failed')
    return (
      <main className="screen stack">
        <BackToSkills />
        <h1 className="title">Body</h1>
        <p className="problem" role="alert">
          {standing.problem}
        </p>
      </main>
    );
  if (standing.status === 'loading' || (recovery.status === 'loading' && volume.status === 'loading'))
    return <ScreenSkeleton title="Body" panels={2} />;

  const { skills } = standing.standing;
  const nameOf = (key: BodySkill) => skills.find(({ skill }) => skill.key === key)?.skill.name ?? key;

  return (
    <main className="screen stack">
      <div className="stack" style={{ gap: 4 }}>
        <BackToSkills />
        <h1 className="title">Body</h1>
      </div>
      {standing.notice && (
        <p className="notice" role="status">
          {standing.notice}
        </p>
      )}
      <RecoveryPanel recovery={recovery} nameOf={nameOf} />
      <WeeklyVolumePanel volume={volume} nameOf={nameOf} />
    </main>
  );
}
