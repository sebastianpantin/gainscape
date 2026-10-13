import type { PlannedExercise, PlannedProgression, ProgressionKind } from '../../offline/draft-format.ts';
import type { Program, ProgramDoc } from './programs.ts';

export interface ProgramRow {
  id: string;
  key: string | null;
  name: string;
  owner_user_id: string | null;
  copied_from_id: string | null;
  program_days: {
    id: string;
    name: string;
    position: number;
    program_day_exercises: {
      position: number;
      exercise_id: string;
      target_sets: number;
      target_reps_min: number;
      target_reps_max: number;
      progression: ProgressionKind;
      increment_kg: number | string | null;
      increment_lb: number | string | null;
    }[];
  }[];
}

export const PROGRAM_SELECT =
  'id,key,name,owner_user_id,copied_from_id,program_days(id,name,position,program_day_exercises(position,exercise_id,target_sets,target_reps_min,target_reps_max,progression,increment_kg,increment_lb))';

type ProgramExerciseRow = ProgramRow['program_days'][number]['program_day_exercises'][number];

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
