import type { LastLoggedSet, PlannedExercise } from '../offline/draft-format.ts';
import { supabase } from './supabase.ts';

export interface ProgramDay {
  id: string;
  name: string;
  position: number;
  exercises: PlannedExercise[];
}

export interface Program {
  id: string;
  key: string | null;
  name: string;
  ownerUserId: string | null;
  copiedFromId: string | null;
  days: ProgramDay[];
}

export interface ProgramDoc {
  id: string;
  name: string;
  days: { id: string; name: string; exercises: PlannedExercise[] }[];
}

interface ProgramRow {
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
    }[];
  }[];
}

const PROGRAM_SELECT =
  'id,key,name,owner_user_id,copied_from_id,program_days(id,name,position,program_day_exercises(position,exercise_id,target_sets,target_reps_min,target_reps_max))';

const programsByUser = new Map<string, Program[]>();

function toProgram(row: ProgramRow): Program {
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
          })),
      })),
  };
}

export function cachedPrograms(userId: string): Program[] | null {
  return programsByUser.get(userId) ?? null;
}

export async function fetchPrograms(userId: string): Promise<Program[]> {
  const { data, error } = await supabase.from('programs').select(PROGRAM_SELECT);
  if (error) throw error;
  const programs = (data as ProgramRow[]).map(toProgram).sort((a, b) => a.name.localeCompare(b.name));
  programsByUser.set(userId, programs);
  return programs;
}

export function ownPrograms(programs: Program[], userId: string): Program[] {
  return programs.filter((program) => program.ownerUserId === userId);
}

export function templates(programs: Program[]): Program[] {
  return programs.filter((program) => program.ownerUserId === null);
}

export async function saveProgram(userId: string, doc: ProgramDoc): Promise<void> {
  const { error } = await supabase.rpc('save_program', { program: doc });
  if (error) throw new Error(error.message);
  await fetchPrograms(userId).catch(() => undefined);
}

export async function copyProgram(userId: string, sourceId: string, newId: string): Promise<string> {
  const { error } = await supabase.rpc('copy_program', { source_program_id: sourceId, new_program_id: newId });
  if (error) throw new Error(error.message);
  await fetchPrograms(userId).catch(() => undefined);
  return newId;
}

export async function deleteProgram(userId: string, programId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_program', { program_id: programId });
  if (error) throw new Error(error.message);
  await fetchPrograms(userId).catch(() => undefined);
}

export async function fetchLastLoggedSets(exerciseIds: string[]): Promise<Map<string, LastLoggedSet>> {
  const { data, error } = await supabase.rpc('last_logged_sets', { exercise_ids: exerciseIds });
  if (error) throw error;
  return new Map(
    (data as { exercise_id: string; weight_kg: number; reps: number }[]).map((row) => [
      row.exercise_id,
      { weightKg: Number(row.weight_kg), reps: row.reps },
    ]),
  );
}
