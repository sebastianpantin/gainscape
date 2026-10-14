import { MS_PER_DAY } from '@domain/edit-window.ts';
import { FULL_SHARE_BASIS_POINTS } from '@domain/index.ts';
import type { ExerciseSkill } from '../exercises/catalog-rules.ts';
import { BODY_SKILLS, type BodySkill, isBodySkill } from './recovery-rules.ts';

export const VOLUME_TARGET = { min: 10, max: 20 } as const;

export type VolumeBand = 'below' | 'within' | 'above';

export interface VolumeSet {
  exerciseId: string;
  localDate: string;
}

export interface VolumeExercise {
  name: string;
  skillShares: readonly ExerciseSkill[];
}

export interface VolumeContribution {
  exerciseId: string;
  name: string;
  sets: number;
}

export interface MuscleVolume {
  sets: number;
  band: VolumeBand;
  contributions: VolumeContribution[];
}

const BAR_FULL_SETS = 25;

export const VOLUME_BAND_TEXT: Readonly<Record<VolumeBand, string>> = {
  below: 'below target',
  within: 'within target',
  above: 'above target',
};

export function volumeBand(sets: number): VolumeBand {
  if (sets < VOLUME_TARGET.min) return 'below';
  return sets > VOLUME_TARGET.max ? 'above' : 'within';
}

export function volumeBarFraction(sets: number): number {
  return Math.min(1, sets / BAR_FULL_SETS);
}

export function volumeSetsText(sets: number): string {
  return String(Math.round(sets * 10) / 10);
}

export function volumeSetsLabel(sets: number): string {
  const shown = volumeSetsText(sets);
  return `${shown} ${shown === '1' ? 'set' : 'sets'}`;
}

function dayFormat(timeZone: string): Intl.DateTimeFormat {
  const options = { year: 'numeric', month: 'numeric', day: 'numeric' } as const;
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });
  }
}

export function weekStartIn(timeZone: string, now: number): string {
  const parts = Object.fromEntries(
    dayFormat(timeZone)
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  const localMidnight = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const daysSinceMonday = (new Date(localMidnight).getUTCDay() + 6) % 7;
  return new Date(localMidnight - daysSinceMonday * MS_PER_DAY).toISOString().slice(0, 10);
}

function setCountsByExercise(sets: readonly VolumeSet[], weekStart: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const set of sets) {
    if (set.localDate >= weekStart) counts.set(set.exerciseId, (counts.get(set.exerciseId) ?? 0) + 1);
  }
  return counts;
}

export function weeklySetsByMuscle(
  sets: readonly VolumeSet[],
  exercisesById: ReadonlyMap<string, VolumeExercise>,
  weekStart: string,
): Record<BodySkill, MuscleVolume> {
  const basisPoints = Object.fromEntries(BODY_SKILLS.map((skill) => [skill, 0])) as Record<BodySkill, number>;
  const contributions = Object.fromEntries(BODY_SKILLS.map((skill) => [skill, [] as VolumeContribution[]])) as Record<
    BodySkill,
    VolumeContribution[]
  >;
  for (const [exerciseId, count] of setCountsByExercise(sets, weekStart)) {
    const exercise = exercisesById.get(exerciseId);
    if (exercise === undefined) continue;
    for (const { skillKey, shareBasisPoints } of exercise.skillShares) {
      if (!isBodySkill(skillKey)) continue;
      basisPoints[skillKey] += count * shareBasisPoints;
      contributions[skillKey].push({
        exerciseId,
        name: exercise.name,
        sets: (count * shareBasisPoints) / FULL_SHARE_BASIS_POINTS,
      });
    }
  }
  return Object.fromEntries(
    BODY_SKILLS.map((skill) => {
      const total = basisPoints[skill] / FULL_SHARE_BASIS_POINTS;
      const parts = contributions[skill].sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));
      return [skill, { sets: total, band: volumeBand(total), contributions: parts }];
    }),
  ) as Record<BodySkill, MuscleVolume>;
}
