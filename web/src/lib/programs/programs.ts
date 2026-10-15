import type { LastLoggedSet } from '../../offline/draft-edits.ts';
import type { PlannedExercise } from '../../offline/draft-starts.ts';
import { type CacheFirstLoad, isDeviceOffline, loadCacheFirstWhenOffline } from '../../offline/cache-first.ts';
import { programListCache, withSavedProgramDoc } from '../../offline/program-list-cache.ts';
import { PROGRAM_SELECT, programPayload, programRowSchema, toProgram } from './program-row-rules.ts';
import { z } from 'zod';
import { numericColumn, parsedRows } from '../rows.ts';
import { rateLimitedMessage } from '../platform/rate-limit.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { supabase } from '../platform/supabase.ts';

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

export function cachedPrograms(userId: string): Program[] | null {
  return programListCache.read(deviceStorage(), userId);
}

export async function fetchPrograms(userId: string): Promise<Program[]> {
  const { data, error } = await supabase.from('programs').select(PROGRAM_SELECT);
  if (error) throw error;
  const programs = parsedRows(programRowSchema, data)
    .map(toProgram)
    .sort((a, b) => a.name.localeCompare(b.name));
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

const lastLoggedSetRowSchema = z.object({
  exercise_id: z.string(),
  weight_kg: numericColumn,
  reps: z.number().nullable(),
});

export async function fetchLastLoggedSets(exerciseIds: string[]): Promise<Map<string, LastLoggedSet>> {
  const { data, error } = await supabase.rpc('last_logged_sets', { exercise_ids: exerciseIds });
  if (error) throw error;
  return new Map(
    parsedRows(lastLoggedSetRowSchema, data).map((row) => [
      row.exercise_id,
      { weightKg: Number(row.weight_kg), reps: row.reps ?? 0 },
    ]),
  );
}
