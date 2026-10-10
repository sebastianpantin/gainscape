import type { LastLoggedSet, PlannedExercise, PlannedProgression, ProgressionKind } from '../offline/draft-format.ts';
import { type CacheFirstLoad, isDeviceOffline, loadCacheFirstWhenOffline } from '../offline/cache-first.ts';
import { programListCache, withSavedProgramDoc } from '../offline/program-list-cache.ts';
import { rateLimitedMessage } from './rate-limit.ts';
import { deviceStorage } from './rest-timer-store.ts';
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
      progression: ProgressionKind;
      increment_kg: number | string | null;
      increment_lb: number | string | null;
    }[];
  }[];
}

const PROGRAM_SELECT =
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

function programPayload(doc: ProgramDoc) {
  return {
    ...doc,
    days: doc.days.map((day) => ({ ...day, exercises: day.exercises.map(plannedExercisePayload) })),
  };
}

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
            progression: progressionOf(exercise),
          })),
      })),
  };
}

export function cachedPrograms(userId: string): Program[] | null {
  return programListCache.read(deviceStorage(), userId);
}

export async function fetchPrograms(userId: string): Promise<Program[]> {
  const { data, error } = await supabase.from('programs').select(PROGRAM_SELECT);
  if (error) throw error;
  const programs = (data as ProgramRow[]).map(toProgram).sort((a, b) => a.name.localeCompare(b.name));
  programListCache.save(deviceStorage(), userId, programs);
  return programs;
}

export function loadProgramsCacheFirst(userId: string): Promise<CacheFirstLoad<Program[]>> {
  return loadCacheFirstWhenOffline(
    isDeviceOffline,
    () => cachedPrograms(userId),
    () => fetchPrograms(userId),
  );
}

export function ownPrograms(programs: Program[], userId: string): Program[] {
  return programs.filter((program) => program.ownerUserId === userId);
}

export function templates(programs: Program[]): Program[] {
  return programs.filter((program) => program.ownerUserId === null);
}

async function changeProgramsThenRefresh(
  userId: string,
  name: string,
  args: Record<string, unknown>,
  changeSaved: (programs: Program[]) => Program[] = (programs) => programs,
): Promise<void> {
  const { error } = await supabase.rpc(name, args);
  if (error) throw new Error(rateLimitedMessage(error) ?? error.message);
  const saved = cachedPrograms(userId);
  if (saved) programListCache.save(deviceStorage(), userId, changeSaved(saved));
  await fetchPrograms(userId).catch(() => undefined);
}

export function saveProgram(userId: string, doc: ProgramDoc): Promise<void> {
  return changeProgramsThenRefresh(userId, 'save_program', { program: programPayload(doc) }, (programs) =>
    withSavedProgramDoc(programs, doc),
  );
}

export async function copyProgram(userId: string, sourceId: string, newId: string): Promise<string> {
  await changeProgramsThenRefresh(userId, 'copy_program', { source_program_id: sourceId, new_program_id: newId });
  return newId;
}

export interface PublishedProgram {
  key: string;
  version: number;
}

export async function publishProgram(programId: string): Promise<PublishedProgram> {
  const { data, error } = await supabase.rpc('publish_program', { program_id: programId });
  if (error) throw error;
  return data as PublishedProgram;
}

export function deleteProgram(userId: string, programId: string): Promise<void> {
  return changeProgramsThenRefresh(userId, 'delete_program', { program_id: programId }, (programs) =>
    programs.filter((program) => program.id !== programId),
  );
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
