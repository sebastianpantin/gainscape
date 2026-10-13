import { type ChallengeDefinition, challengeLoadExerciseIds } from '@domain/challenges.ts';
import { type RoundingSetting, roundLoad } from '@domain/load-rounding.ts';
import { FLOAT_TOLERANCE, roundTo } from '@domain/math.ts';
import { e1rmAtSessionStart } from '@domain/strength.ts';
import type { StrengthState } from '@domain/types.ts';
import { kgToUnit, unitToKg, type WeightUnit } from '@domain/units.ts';
import { z } from 'zod';
import type { DraftChallenge, WorkoutDraft } from '../../offline/draft-format.ts';
import { formatXp } from '../format.ts';

export const CHALLENGE_COLUMNS = 'id,key,name,definition';

export interface CatalogChallenge {
  id: string;
  key: string;
  name: string;
  definition: ChallengeDefinition;
}

export interface ChallengeRow {
  id: string;
  key: string;
  name: string;
  definition: unknown;
}

const challengeExerciseSchema = z.object({
  exerciseId: z.string(),
  reps: z.number(),
  pct: z.number().nullable(),
});

const challengeDefinitionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('prescription'),
    groups: z.array(z.object({ rounds: z.number(), exercises: z.array(challengeExerciseSchema) })),
  }),
  z.object({
    kind: z.literal('volume'),
    metric: z.enum(['reps', 'kg']),
    target: z.number(),
    exerciseId: z.string().nullable(),
    minPct: z.number().nullable(),
  }),
]);

export const catalogChallengeSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  definition: challengeDefinitionSchema,
});

const draftChallengeSchema = z.object({
  challengeId: z.string(),
  name: z.string(),
  definition: challengeDefinitionSchema,
  targetLoadsKg: z.record(z.string(), z.number().nullable()),
});

export function parsedChallengeDefinition(value: unknown): ChallengeDefinition | null {
  const parsed = challengeDefinitionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function toCatalogChallenge(row: ChallengeRow): CatalogChallenge | null {
  const definition = parsedChallengeDefinition(row.definition);
  return definition === null ? null : { id: row.id, key: row.key, name: row.name, definition };
}

export function parsedDraftChallenge(value: unknown): DraftChallenge | null {
  const parsed = draftChallengeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function challengeLoadKg(targetKg: number, rounding: RoundingSetting, unit: WeightUnit, onBar: boolean): number {
  const shown = roundLoad(kgToUnit(targetKg, unit), rounding.increment, 'up');
  const lightest = onBar ? rounding.barWeight : rounding.increment;
  return unitToKg(Math.max(lightest, shown), unit);
}

export function challengeVolumeSoFarKg(draft: WorkoutDraft): number {
  return draft.exercises.reduce((total, exercise) => {
    if (exercise.modality !== 'lift') return total;
    const working = exercise.sets.filter((set) => set.done && !set.isWarmup);
    return total + working.reduce((sum, set) => sum + roundTo(2, set.weightKg) * set.reps, 0);
  }, 0);
}

function volumeInUnit(kg: number, unit: WeightUnit): string {
  return formatXp(Math.round(kgToUnit(kg, unit)));
}

function shownVolumeSoFar(soFarKg: number, targetKg: number, unit: WeightUnit): number {
  const shownTarget = Math.round(kgToUnit(targetKg, unit));
  const roundedDown = Math.floor(kgToUnit(soFarKg, unit) + FLOAT_TOLERANCE);
  return soFarKg + FLOAT_TOLERANCE >= targetKg
    ? Math.max(roundedDown, shownTarget)
    : Math.min(roundedDown, shownTarget - 1);
}

export function challengeVolumeText(draft: WorkoutDraft, targetKg: number, unit: WeightUnit): string {
  const soFar = shownVolumeSoFar(challengeVolumeSoFarKg(draft), targetKg, unit);
  return `Volume so far: ${formatXp(soFar)} / ${volumeInUnit(targetKg, unit)} ${unit}`;
}

export function exercisesWithoutE1rm(definition: ChallengeDefinition, strength: StrengthState): string[] {
  return challengeLoadExerciseIds(definition).filter((exerciseId) => e1rmAtSessionStart(strength, exerciseId) === null);
}

export function missingE1rmText(exerciseNames: readonly string[]): string {
  return `Log ${exerciseNames.join(' and ')} first: this challenge sets its loads from your e1RM.`;
}

export function mentionsE1rm(definition: ChallengeDefinition): boolean {
  if (definition.kind === 'prescription') {
    return definition.groups.some((group) => group.exercises.some((exercise) => exercise.pct !== null));
  }
  return definition.metric === 'reps' && definition.minPct !== null;
}

function prescribedText(reps: number, pct: number | null, name: string): string {
  return pct === null ? `${name} ${reps} reps` : `${name} ${reps} reps at ${pct}% of your e1RM`;
}

export function challengeSummaryText(
  definition: ChallengeDefinition,
  nameOf: (exerciseId: string) => string,
  unit: WeightUnit,
): string {
  if (definition.kind === 'prescription') {
    return definition.groups
      .map(
        (group) =>
          `${group.rounds} rounds: ${group.exercises
            .map(({ exerciseId, reps, pct }) => prescribedText(reps, pct, nameOf(exerciseId)))
            .join(', then ')}`,
      )
      .join('; ');
  }
  if (definition.metric === 'kg') return `Lift ${volumeInUnit(definition.target, unit)} ${unit} in one workout`;
  const exercise = definition.exerciseId === null ? 'any lift' : nameOf(definition.exerciseId);
  const load = mentionsE1rm(definition) ? ` at ${definition.minPct}% of your e1RM or more` : '';
  return `${formatXp(definition.target)} reps of ${exercise}${load}`;
}
