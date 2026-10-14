import { isDeviceOffline, loadCacheFirstWhenOffline } from '../../offline/cache-first.ts';
import {
  type ProgramCache,
  readProgramCache,
  updateProgramCache,
  withEnrollment,
} from '../../offline/program-cache.ts';
import {
  type ProgramFetchers,
  type ProgramRefreshContext,
  refreshProgramCacheWith,
  refreshProgramFactsWith,
} from '../../offline/program-refresh.ts';
import { type EnrollProgramPayload, type ProgramTemplateRow } from './program-enroll-rules.ts';
import { type EnrollmentFactsRows, type EnrollmentRow } from './program-facts-rules.ts';
import { type SetReferenceEvent } from './program-reference-rules.ts';
import { type SkipDayEvent } from './program-skip-rules.ts';
import { fetchExercises } from '../exercises/catalog.ts';
import { readCachedExercises } from '../exercises/catalog-cache.ts';
import { activeExercises, type Exercise } from '../exercises/catalog-rules.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { supabase } from '../platform/supabase.ts';

const ENROLLMENT_COLUMNS =
  'id, template_key, template_version, unit, options, lift_bindings, inputs, rounding, started_at, ended_at';

async function fetchProgramTemplates(): Promise<ProgramTemplateRow[]> {
  const { data, error } = await supabase
    .from('program_templates')
    .select('key, version, name, definition, owner_user_id');
  if (error) throw error;
  return data as ProgramTemplateRow[];
}

async function fetchAndSaveProgramTemplates(userId: string): Promise<ProgramTemplateRow[]> {
  const templates = await fetchProgramTemplates();
  updateProgramCache(localStorage, userId, (cache) => ({ ...cache, templates }));
  return templates;
}

function savedProgramTemplates(storage: Storage | null, userId: string): ProgramTemplateRow[] | null {
  const saved = storage ? readProgramCache(storage, userId).templates : [];
  return saved.length > 0 ? saved : null;
}

export async function loadProgramTemplatesCacheFirst(userId: string): Promise<ProgramTemplateRow[]> {
  const load = await loadCacheFirstWhenOffline(
    isDeviceOffline,
    () => savedProgramTemplates(deviceStorage(), userId),
    () => fetchAndSaveProgramTemplates(userId),
  );
  return load.loaded;
}

export interface EnrollChoices {
  templates: ProgramTemplateRow[];
  exercises: Exercise[];
}

function savedEnrollChoices(userId: string): EnrollChoices | null {
  const storage = deviceStorage();
  const templates = savedProgramTemplates(storage, userId);
  const exercises = storage && readCachedExercises(storage, userId);
  return templates && exercises ? { templates, exercises: activeExercises(exercises) } : null;
}

export async function loadEnrollChoicesCacheFirst(userId: string): Promise<EnrollChoices> {
  const load = await loadCacheFirstWhenOffline(
    isDeviceOffline,
    () => savedEnrollChoices(userId),
    async () => {
      const [templates, exercises] = await Promise.all([
        fetchAndSaveProgramTemplates(userId),
        fetchExercises({ includeArchived: false }),
      ]);
      return { templates, exercises };
    },
  );
  return load.loaded;
}

async function fetchActiveEnrollment(): Promise<EnrollmentRow | null> {
  const { data, error } = await supabase
    .from('program_enrollments')
    .select(ENROLLMENT_COLUMNS)
    .is('ended_at', null)
    .maybeSingle();
  if (error) throw error;
  return data as EnrollmentRow | null;
}

async function fetchEnrollmentFacts(enrollmentId: string): Promise<EnrollmentFactsRows> {
  const { data, error } = await supabase.rpc('enrollment_facts', { enrollment_id: enrollmentId });
  if (error) throw error;
  return data as EnrollmentFactsRows;
}

export async function enrollProgram(payload: EnrollProgramPayload): Promise<string> {
  const { data, error } = await supabase.rpc('enroll_program', { enrollment: payload });
  if (error) throw error;
  return data as string;
}

export async function endEnrollment(enrollmentId: string): Promise<void> {
  const { error } = await supabase.rpc('end_enrollment', { enrollment_id: enrollmentId });
  if (error) throw error;
}

export async function adjustEnrollment(enrollmentId: string, event: SetReferenceEvent | SkipDayEvent): Promise<void> {
  const { error } = await supabase.rpc('adjust_enrollment', { enrollment_id: enrollmentId, event });
  if (error) throw error;
}

const PROGRAM_FETCHERS: ProgramFetchers = {
  templates: fetchProgramTemplates,
  activeEnrollment: fetchActiveEnrollment,
  enrollmentFacts: fetchEnrollmentFacts,
};

function refreshContext(userId: string): ProgramRefreshContext {
  return { storage: localStorage, userId, now: Date.now, fetchers: PROGRAM_FETCHERS };
}

export function refreshProgramFactsOrCached(userId: string, enrollment: EnrollmentRow): Promise<ProgramCache> {
  return refreshProgramFactsWith(refreshContext(userId), enrollment).catch(() =>
    readProgramCache(localStorage, userId),
  );
}

export function refreshProgramCache(userId: string): Promise<ProgramCache> {
  return refreshProgramCacheWith(refreshContext(userId));
}

export function forgetCachedEnrollment(userId: string): void {
  updateProgramCache(localStorage, userId, (cache) => withEnrollment(cache, null));
}
