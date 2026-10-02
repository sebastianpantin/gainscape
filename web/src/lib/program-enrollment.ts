import { beginFactsFetch, emptyProgramFactsCache, mergeFetchedFacts } from '../offline/program-facts-cache.ts';
import {
  type ProgramCache,
  readProgramCache,
  saveProgramCache,
  updateProgramCache,
  withEnrollment,
} from '../offline/program-cache.ts';
import { type EnrollProgramPayload, type ProgramTemplateRow } from './program-enroll-rules.ts';
import { type EnrollmentFactsRows, type EnrollmentRow, programFactsFromRows } from './program-facts-rules.ts';
import { type SetReferenceEvent } from './program-reference-rules.ts';
import { rateLimitedMessage } from './rate-limit.ts';
import { supabase } from './supabase.ts';

const ENROLLMENT_COLUMNS =
  'id, template_key, template_version, unit, options, lift_bindings, inputs, rounding, started_at, ended_at';

export async function fetchProgramTemplates(): Promise<ProgramTemplateRow[]> {
  const { data, error } = await supabase.from('program_templates').select('key, version, name, definition');
  if (error) throw error;
  return data as ProgramTemplateRow[];
}

export async function fetchActiveEnrollment(): Promise<EnrollmentRow | null> {
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

function rpcError(error: { message: string }): Error {
  return new Error(rateLimitedMessage(error) ?? error.message);
}

export async function enrollProgram(payload: EnrollProgramPayload): Promise<string> {
  const { data, error } = await supabase.rpc('enroll_program', { enrollment: payload });
  if (error) throw rpcError(error);
  return data as string;
}

export async function adjustEnrollment(enrollmentId: string, event: SetReferenceEvent): Promise<void> {
  const { error } = await supabase.rpc('adjust_enrollment', { enrollment_id: enrollmentId, event });
  if (error) throw rpcError(error);
}

export async function refreshProgramFacts(userId: string, enrollment: EnrollmentRow): Promise<ProgramCache> {
  const startingCache = withEnrollment(readProgramCache(localStorage, userId), enrollment);
  saveProgramCache(localStorage, userId, startingCache);
  const ticket = beginFactsFetch(startingCache.facts ?? emptyProgramFactsCache(enrollment.id), Date.now());
  const facts = programFactsFromRows(await fetchEnrollmentFacts(enrollment.id));
  return updateProgramCache(localStorage, userId, (latest) =>
    latest.facts ? { ...latest, facts: mergeFetchedFacts(latest.facts, ticket, facts) } : latest,
  );
}

export async function refreshProgramCache(userId: string): Promise<ProgramCache> {
  const [templates, enrollment] = await Promise.all([fetchProgramTemplates(), fetchActiveEnrollment()]);
  updateProgramCache(localStorage, userId, (cache) => withEnrollment({ ...cache, templates }, enrollment));
  if (enrollment === null) return readProgramCache(localStorage, userId);
  return refreshProgramFacts(userId, enrollment);
}
