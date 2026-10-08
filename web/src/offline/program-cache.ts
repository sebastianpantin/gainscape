import { z } from 'zod';
import { type EnrollmentRow, programFactSchema, sessionFactSchema } from '../lib/program-facts-rules.ts';
import { type ProgramTemplateRow } from '../lib/program-enroll-rules.ts';
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
const CACHE_KEY_PREFIX = 'gainscape.powerlifting-programs.v1.';

export interface ProgramCache {
  templates: ProgramTemplateRow[];
  enrollment: EnrollmentRow | null;
  facts: ProgramFactsCache | null;
  refreshed?: true;
}

export const EMPTY_PROGRAM_CACHE: ProgramCache = { templates: [], enrollment: null, facts: null };

const numberRecord = z.record(z.string(), z.number());

const enrollmentSchema = z.object({
  id: z.string(),
  template_key: z.string(),
  template_version: z.number(),
  unit: z.enum(['kg', 'lb']),
  options: z.record(z.string(), z.union([z.string(), z.number()])),
  lift_bindings: z.record(z.string(), z.string().nullable()),
  inputs: z.record(z.string(), numberRecord),
  rounding: z.object({ increment: z.number(), mode: z.enum(['nearest', 'down']), barWeight: z.number() }),
  started_at: z.string(),
  ended_at: z.string().nullable(),
});

const cachedProgramsSchema = z.object({
  v: z.literal(CACHE_VERSION),
  userId: z.string(),
  templates: z.array(z.object({ key: z.string(), version: z.number(), name: z.string(), definition: z.unknown() })),
  enrollment: enrollmentSchema.nullable(),
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

export function programCacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

export function readProgramCache(storage: Storage, userId: string): ProgramCache {
  try {
    const raw = storage.getItem(programCacheKey(userId));
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
  } catch {
    return EMPTY_PROGRAM_CACHE;
  }
}

export function saveProgramCache(storage: Storage, userId: string, cache: ProgramCache): void {
  try {
    storage.setItem(programCacheKey(userId), JSON.stringify({ v: CACHE_VERSION, userId, ...cache }));
  } catch {
    return;
  }
}

export function updateProgramCache(
  storage: Storage,
  userId: string,
  change: (cache: ProgramCache) => ProgramCache,
): ProgramCache {
  const changed = change(readProgramCache(storage, userId));
  saveProgramCache(storage, userId, changed);
  return changed;
}

export function forgetProgramCache(storage: Storage, userId: string): void {
  try {
    storage.removeItem(programCacheKey(userId));
  } catch {
    return;
  }
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
