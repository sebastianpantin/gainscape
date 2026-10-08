import { type ProgramTemplateRow } from '../lib/program-enroll-rules.ts';
import { type EnrollmentFactsRows, type EnrollmentRow, programFactsFromRows } from '../lib/program-facts-rules.ts';
import { type ProgramCache, readProgramCache, updateProgramCache, withEnrollment } from './program-cache.ts';
import { beginFactsFetch, emptyProgramFactsCache, mergeFetchedFacts } from './program-facts-cache.ts';

export interface ProgramFetchers {
  templates(): Promise<ProgramTemplateRow[]>;
  activeEnrollment(): Promise<EnrollmentRow | null>;
  enrollmentFacts(enrollmentId: string): Promise<EnrollmentFactsRows>;
}

export interface ProgramRefreshContext {
  storage: Storage;
  userId: string;
  now: () => number;
  fetchers: ProgramFetchers;
}

export async function refreshProgramFactsWith(
  context: ProgramRefreshContext,
  enrollment: EnrollmentRow,
): Promise<ProgramCache> {
  const { storage, userId } = context;
  const starting = updateProgramCache(storage, userId, (cache) => withEnrollment(cache, enrollment));
  const ticket = beginFactsFetch(starting.facts ?? emptyProgramFactsCache(enrollment.id), context.now());
  const facts = programFactsFromRows(await context.fetchers.enrollmentFacts(enrollment.id));
  return updateProgramCache(storage, userId, (latest) =>
    latest.facts ? { ...latest, facts: mergeFetchedFacts(latest.facts, ticket, facts) } : latest,
  );
}

export async function refreshProgramCacheWith(context: ProgramRefreshContext): Promise<ProgramCache> {
  const { storage, userId, fetchers } = context;
  const [templates, enrollment] = await Promise.all([fetchers.templates(), fetchers.activeEnrollment()]);
  updateProgramCache(storage, userId, (cache) => withEnrollment({ ...cache, templates, refreshed: true }, enrollment));
  if (enrollment === null) return readProgramCache(storage, userId);
  return refreshProgramFactsWith(context, enrollment);
}
