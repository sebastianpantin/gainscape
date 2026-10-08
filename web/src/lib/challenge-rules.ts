import type { ChallengeDefinition } from '@domain/challenges.ts';
import { type RoundingSetting, roundLoad } from '@domain/load-rounding.ts';
import { kgToUnit, unitToKg, type WeightUnit } from '@domain/units.ts';
import { z } from 'zod';
import type { DraftChallenge, WorkoutDraft } from '../offline/draft-format.ts';
import { formatXp } from './format.ts';

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

export function challengeLoadKg(targetKg: number, rounding: RoundingSetting, unit: WeightUnit): number {
  const shown = roundLoad(kgToUnit(targetKg, unit), rounding.increment, 'up');
  return unitToKg(Math.max(rounding.barWeight, shown), unit);
}

export function challengeVolumeSoFarKg(draft: WorkoutDraft): number {
  return draft.exercises.reduce((total, exercise) => {
    if (exercise.modality !== 'lift' || exercise.loadType !== 'external') return total;
    const working = exercise.sets.filter((set) => set.done && !set.isWarmup);
    return total + working.reduce((sum, set) => sum + set.weightKg * set.reps, 0);
  }, 0);
}

export function challengeVolumeText(draft: WorkoutDraft, targetKg: number): string {
  return `Volume so far: ${formatXp(Math.round(challengeVolumeSoFarKg(draft)))} / ${formatXp(targetKg)} kg`;
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

export function challengeSummaryText(definition: ChallengeDefinition, nameOf: (exerciseId: string) => string): string {
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
  if (definition.metric === 'kg') return `Lift ${formatXp(definition.target)} kg in one workout`;
  const exercise = definition.exerciseId === null ? 'any lift' : nameOf(definition.exerciseId);
  const load = mentionsE1rm(definition) ? ` at ${definition.minPct}% of your e1RM or more` : '';
  return `${formatXp(definition.target)} reps of ${exercise}${load}`;
}
