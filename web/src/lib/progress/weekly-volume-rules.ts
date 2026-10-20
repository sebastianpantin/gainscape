import { roundTo } from '@domain/math.ts';
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

export const VOLUME_BAND_TEXT: Readonly<Record<VolumeBand, string | null>> = {
  below: null,
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
  return String(roundTo(1, sets));
}

export function volumeSetsLabel(sets: number): string {
  const shown = volumeSetsText(sets);
  return `${shown} ${shown === '1' ? 'set' : 'sets'}`;
}

export function volumeAmountText(sets: number): string {
  if (volumeBand(sets) !== 'below') return volumeSetsLabel(sets);
  return `${volumeSetsText(sets)} of ${VOLUME_TARGET.min} sets`;
}

function setCountsByExercise(sets: readonly VolumeSet[], weekStart: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const set of sets) {
    if (set.localDate >= weekStart) counts.set(set.exerciseId, (counts.get(set.exerciseId) ?? 0) + 1);
  }
  return counts;
}

export function muscleVolumeFromExerciseSets(
  setsByExercise: ReadonlyMap<string, number>,
  exercisesById: ReadonlyMap<string, VolumeExercise>,
): Record<BodySkill, MuscleVolume> {
  const basisPoints = Object.fromEntries(BODY_SKILLS.map((skill) => [skill, 0])) as Record<BodySkill, number>;
  const contributions = Object.fromEntries(BODY_SKILLS.map((skill) => [skill, [] as VolumeContribution[]])) as Record<
    BodySkill,
    VolumeContribution[]
  >;
  for (const [exerciseId, count] of setsByExercise) {
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

export function weeklySetsByMuscle(
  sets: readonly VolumeSet[],
  exercisesById: ReadonlyMap<string, VolumeExercise>,
  weekStart: string,
): Record<BodySkill, MuscleVolume> {
  return muscleVolumeFromExerciseSets(setCountsByExercise(sets, weekStart), exercisesById);
}
