import { z } from 'zod';
import { keyedStore } from '../lib/platform/keyed-store.ts';
import {
  type EnrollmentRow,
  enrollmentRowSchema,
  programFactSchema,
  sessionFactSchema,
} from '../lib/programs/program-facts-rules.ts';
import { type ProgramTemplateRow, programTemplateRowSchema } from '../lib/programs/program-enroll-rules.ts';
import { type WorkoutDraft } from './draft-format.ts';
import { type SendOutcome } from './finish-lock.ts';
import {
  appendFinishedSession,
  emptyProgramFactsCache,
  type FinishOutcomeForFacts,
  forgetDeletedSession,
  type ProgramFactsCache,
} from './program-facts-cache.ts';

const CACHE_VERSION = 1;

export interface ProgramCache {
  templates: ProgramTemplateRow[];
  enrollment: EnrollmentRow | null;
  facts: ProgramFactsCache | null;
  refreshed?: true;
}

export const EMPTY_PROGRAM_CACHE: ProgramCache = { templates: [], enrollment: null, facts: null };

const cachedProgramsSchema = z.object({
  v: z.literal(CACHE_VERSION),
  userId: z.string(),
  templates: z.array(programTemplateRowSchema),
  enrollment: enrollmentRowSchema.nullable(),
  facts: z
    .object({
      enrollmentId: z.string(),
      generation: z.number(),
      serverFacts: z.array(programFactSchema),
      localAppends: z.array(z.object({ fact: sessionFactSchema, appendedAt: z.number() })),
    })
    .nullable(),
  refreshed: z.literal(true).optional(),
});

export const {
  key: programCacheKey,
  read: readProgramCache,
  save: saveProgramCache,
  forget: forgetProgramCache,
} = keyedStore<ProgramCache>(
  'gainscape.powerlifting-programs.v1.',
  (raw, userId) => {
    if (!raw) return EMPTY_PROGRAM_CACHE;
    const parsed = cachedProgramsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.userId !== userId) return EMPTY_PROGRAM_CACHE;
    const { templates, enrollment, facts, refreshed } = parsed.data;
    return {
      templates: templates.map((template) => ({ ...template, definition: template.definition ?? null })),
      enrollment,
      facts,
      refreshed,
    };
  },
  (cache, userId) => ({ v: CACHE_VERSION, userId, ...cache }),
);

export function updateProgramCache(
  storage: Storage,
  userId: string,
  change: (cache: ProgramCache) => ProgramCache,
): ProgramCache {
  const changed = change(readProgramCache(storage, userId));
  saveProgramCache(storage, userId, changed);
  return changed;
}

export function withEnrollment(cache: ProgramCache, enrollment: EnrollmentRow | null): ProgramCache {
  if (enrollment === null) return { ...cache, enrollment: null, facts: null };
  const facts = cache.facts?.enrollmentId === enrollment.id ? cache.facts : emptyProgramFactsCache(enrollment.id);
  return { ...cache, enrollment, facts };
}

export function rememberFinishedSession(
  storage: Storage,
  userId: string,
  draft: WorkoutDraft,
  outcome: FinishOutcomeForFacts,
  appendedAt = Date.now(),
): void {
  if (!draft.program) return;
  updateProgramCache(storage, userId, (cache) =>
    cache.facts ? { ...cache, facts: appendFinishedSession(cache.facts, draft, outcome, appendedAt) } : cache,
  );
}

export function forgetDeletedProgramSession(storage: Storage, userId: string, sessionId: string): void {
  updateProgramCache(storage, userId, (cache) =>
    cache.facts ? { ...cache, facts: forgetDeletedSession(cache.facts, sessionId) } : cache,
  );
}

export function factsOutcomeOf(outcome: SendOutcome): FinishOutcomeForFacts | null {
  if (outcome.kind !== 'synced') return null;
  const { programLinked, completedAt } = outcome.summary;
  if (typeof programLinked !== 'boolean' || typeof completedAt !== 'string') return null;
  return { kind: 'synced', summary: { programLinked, completedAt } };
}
