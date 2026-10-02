import { type ProgramTemplateRow } from '../lib/program-enroll-rules.ts';
import { type EnrollmentFactsRows, type EnrollmentRow } from '../lib/program-facts-rules.ts';
import { type ProgramCache } from './program-cache.ts';

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

export function refreshProgramFactsWith(
  context: ProgramRefreshContext,
  enrollment: EnrollmentRow,
): Promise<ProgramCache> {
  void context;
  void enrollment;
  throw new Error('not implemented');
}

export function refreshProgramCacheWith(context: ProgramRefreshContext): Promise<ProgramCache> {
  void context;
  throw new Error('not implemented');
}
