import type { PlannedExercise, PlannedProgression, ProgressionKind } from '../../offline/draft-starts.ts';
import type { Program, ProgramDoc } from './programs.ts';
import { z } from 'zod';
import { columnsOf, numericColumn } from '../rows.ts';

const PROGRESSION_KINDS = ['none', 'fixed', 'linear'] as const satisfies readonly ProgressionKind[];

const programDayExerciseRowSchema = z.object({
  position: z.number(),
  exercise_id: z.string(),
  target_sets: z.number(),
  target_reps_min: z.number(),
  target_reps_max: z.number(),
  progression: z.enum(PROGRESSION_KINDS),
  increment_kg: numericColumn.nullable(),
  increment_lb: numericColumn.nullable(),
});

const programDayRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number(),
  program_day_exercises: z.array(programDayExerciseRowSchema),
});

export const programRowSchema = z.object({
  id: z.string(),
  key: z.string().nullable(),
  name: z.string(),
  owner_user_id: z.string().nullable(),
  copied_from_id: z.string().nullable(),
  program_days: z.array(programDayRowSchema),
});

export type ProgramRow = z.infer<typeof programRowSchema>;

export const PROGRAM_SELECT = columnsOf(programRowSchema, {
  program_days: columnsOf(programDayRowSchema, { program_day_exercises: columnsOf(programDayExerciseRowSchema) }),
});

type ProgramExerciseRow = z.infer<typeof programDayExerciseRowSchema>;

function progressionOf(row: ProgramExerciseRow): PlannedProgression {
  if (row.progression === 'linear')
    return { kind: 'linear', incrementKg: Number(row.increment_kg), incrementLb: Number(row.increment_lb) };
  return { kind: row.progression };
}

function plannedExercisePayload({ progression, ...planned }: PlannedExercise) {
  const linear = progression.kind === 'linear';
  return {
    ...planned,
    progression: progression.kind,
    incrementKg: linear ? progression.incrementKg : null,
    incrementLb: linear ? progression.incrementLb : null,
  };
}

export function programPayload(doc: ProgramDoc) {
  return {
    ...doc,
    days: doc.days.map((day) => ({ ...day, exercises: day.exercises.map(plannedExercisePayload) })),
  };
}

export function toProgram(row: ProgramRow): Program {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    ownerUserId: row.owner_user_id,
    copiedFromId: row.copied_from_id,
    days: [...row.program_days]
      .sort((a, b) => a.position - b.position)
      .map((day) => ({
        id: day.id,
        name: day.name,
        position: day.position,
        exercises: [...day.program_day_exercises]
          .sort((a, b) => a.position - b.position)
          .map((exercise) => ({
            exerciseId: exercise.exercise_id,
            targetSets: exercise.target_sets,
            targetRepsMin: exercise.target_reps_min,
            targetRepsMax: exercise.target_reps_max,
            progression: progressionOf(exercise),
          })),
      })),
  };
}
