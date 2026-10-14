import { type MuscleVolume, volumeSetsLabel } from '../../lib/progress/weekly-volume-rules.ts';

interface VolumeContributionListProps {
  name: string;
  volume: MuscleVolume;
}

export function VolumeContributionList({ name, volume }: VolumeContributionListProps) {
  return (
    <ul className="volume-contributions" aria-label={`Exercises counted for ${name}`}>
      {volume.contributions.length === 0 ? (
        <li className="muted">No sets yet this week.</li>
      ) : (
        volume.contributions.map((part) => (
          <li key={part.exerciseId} className="row spread">
            <span>{part.name}</span>
            <span className="muted">{volumeSetsLabel(part.sets)}</span>
          </li>
        ))
      )}
    </ul>
  );
}
