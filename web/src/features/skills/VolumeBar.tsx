import { type MuscleVolume, VOLUME_TARGET, volumeBarFraction } from '../../lib/progress/weekly-volume-rules.ts';

function percent(sets: number): string {
  return `${Math.round(volumeBarFraction(sets) * 100)}%`;
}

export function VolumeBar({ volume }: { volume: MuscleVolume }) {
  return (
    <span className="volume-bar" aria-hidden="true">
      <span
        className="volume-band"
        style={{ left: percent(VOLUME_TARGET.min), right: `calc(100% - ${percent(VOLUME_TARGET.max)})` }}
      />
      <span className={`volume-fill ${volume.band}`} style={{ width: percent(volume.sets) }} />
    </span>
  );
}
