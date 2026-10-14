import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { exerciseListQuery, profileQuery, recentSetsQuery } from '../../lib/query/queries.ts';
import { BODY_SKILLS, type BodySkill } from '../../lib/progress/recovery-rules.ts';
import {
  type MuscleVolume,
  VOLUME_BAND_TEXT,
  VOLUME_TARGET,
  volumeBarFraction,
  volumeSetsLabel,
  weeklySetsByMuscle,
  weekStartIn,
} from '../../lib/progress/weekly-volume-rules.ts';

interface WeeklyVolumePanelProps {
  userId: string;
  nameOf: (skill: BodySkill) => string;
}

function percent(sets: number): string {
  return `${Math.round(volumeBarFraction(sets) * 100)}%`;
}

interface MuscleRowProps {
  name: string;
  volume: MuscleVolume;
  open: boolean;
  onToggle: () => void;
}

function MuscleRow({ name, volume, open, onToggle }: MuscleRowProps) {
  const listId = useId();
  return (
    <li className="volume-row">
      <button type="button" className="volume-toggle" aria-expanded={open} aria-controls={listId} onClick={onToggle}>
        <span className="row spread">
          <span>{name}</span>
          <span className="muted">
            {volumeSetsLabel(volume.sets)}
            <span className="visually-hidden"> this week</span> · {VOLUME_BAND_TEXT[volume.band]}
          </span>
        </span>
        <span className="volume-bar" aria-hidden="true">
          <span
            className="volume-band"
            style={{ left: percent(VOLUME_TARGET.min), right: `calc(100% - ${percent(VOLUME_TARGET.max)})` }}
          />
          <span className={`volume-fill ${volume.band}`} style={{ width: percent(volume.sets) }} />
        </span>
      </button>
      <ul id={listId} className="volume-contributions" aria-label={`Exercises counted for ${name}`} hidden={!open}>
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
    </li>
  );
}

export function WeeklyVolumePanel({ userId, nameOf }: WeeklyVolumePanelProps) {
  const headingId = useId();
  const recent = useQuery(recentSetsQuery(userId));
  const exercises = useQuery(exerciseListQuery(userId));
  const profile = useQuery(profileQuery(userId));
  const [openedAt] = useState(Date.now);
  const [openSkill, setOpenSkill] = useState<BodySkill | null>(null);
  if (!recent.data || !exercises.data || !profile.data) {
    if (!recent.isError && !exercises.isError && !profile.isError) return null;
    return (
      <section className="panel stack" aria-labelledby={headingId}>
        <h2 id={headingId}>Sets this week</h2>
        <p className="muted">Weekly sets need a connection to load your recent sets.</p>
      </section>
    );
  }
  const volume = weeklySetsByMuscle(
    recent.data,
    new Map(exercises.data.map((exercise) => [exercise.id, exercise])),
    weekStartIn(profile.data.loaded.timezone, Math.max(openedAt, recent.dataUpdatedAt)),
  );
  return (
    <section className="panel stack" aria-labelledby={headingId}>
      <h2 id={headingId}>Sets this week</h2>
      <ul className="volume-list">
        {BODY_SKILLS.map((skill) => (
          <MuscleRow
            key={skill}
            name={nameOf(skill)}
            volume={volume[skill]}
            open={openSkill === skill}
            onToggle={() => setOpenSkill(openSkill === skill ? null : skill)}
          />
        ))}
      </ul>
      <p className="muted tiny">
        Working sets since Monday, split across the muscles each exercise trains. The marked band is a target of{' '}
        {VOLUME_TARGET.min} to {VOLUME_TARGET.max} sets a week per muscle.
      </p>
    </section>
  );
}
