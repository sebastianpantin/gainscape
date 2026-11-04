import { z } from 'zod';
import { type ProgramFact } from '@domain/index.ts';
import { keyedStore } from '../lib/platform/keyed-store.ts';
import { type ProgramTemplateRow, programTemplateRowSchema } from '../lib/programs/program-enroll-rules.ts';
import {
  type EnrollmentFactsRows,
  type EnrollmentRow,
  enrollmentRowSchema,
  programFactSchema,
  programFactsFromRows,
  sessionFactSchema,
} from '../lib/programs/program-facts-rules.ts';
import { dayDrafts, type SavedDay } from './draft-days.ts';
import { type WorkoutDraft } from './draft-format.ts';
import {
  appendFinishedSession,
  beginFactsFetch,
  cachedProgramFacts,
  emptyProgramFactsCache,
  forgetDeletedSession,
  mergeFetchedFacts,
  type ProgramFactsCache,
} from './program-facts-cache.ts';

export interface EnrollmentServer {
  templates(): Promise<ProgramTemplateRow[]>;
  activeEnrollment(): Promise<EnrollmentRow | null>;
  enrollmentFacts(enrollmentId: string): Promise<EnrollmentFactsRows>;
}

export interface EnrollmentIo {
  device: Storage | null;
  server: EnrollmentServer;
  now: () => number;
}

export interface StoredEnrollment {
  templates: ProgramTemplateRow[];
  enrollment: EnrollmentRow | null;
  facts: ProgramFact[];
  refreshed: boolean;
}

export interface FinishedWorkout {
  programLinked?: boolean;
  completedAt?: string;
  days?: readonly SavedDay[];
}

interface ProgramCache {
  templates: ProgramTemplateRow[];
  enrollment: EnrollmentRow | null;
  facts: ProgramFactsCache | null;
  refreshed?: true;
}

type Watcher = (userId: string, stored: StoredEnrollment) => void;

const CACHE_VERSION = 1;
const EMPTY_PROGRAM_CACHE: ProgramCache = { templates: [], enrollment: null, facts: null };
const watchers = new Set<Watcher>();

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

const programCache = keyedStore<ProgramCache>(
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

function shown({ templates, enrollment, facts, refreshed }: ProgramCache): StoredEnrollment {
  return { templates, enrollment, facts: facts ? cachedProgramFacts(facts) : [], refreshed: refreshed === true };
}

function update(device: Storage | null, userId: string, change: (cache: ProgramCache) => ProgramCache): ProgramCache {
  const changed = change(programCache.read(device, userId));
  programCache.save(device, userId, changed);
  return changed;
}

function told(userId: string, cache: ProgramCache): StoredEnrollment {
  const stored = shown(cache);
  for (const watcher of watchers) watcher(userId, stored);
  return stored;
}

function updateAndTell(
  device: Storage | null,
  userId: string,
  change: (cache: ProgramCache) => ProgramCache,
): StoredEnrollment {
  return told(userId, update(device, userId, change));
}

function withEnrollment(cache: ProgramCache, enrollment: EnrollmentRow | null): ProgramCache {
  if (enrollment === null) return { ...cache, enrollment: null, facts: null };
  const facts = cache.facts?.enrollmentId === enrollment.id ? cache.facts : emptyProgramFactsCache(enrollment.id);
  return { ...cache, enrollment, facts };
}

function withFacts(cache: ProgramCache, change: (facts: ProgramFactsCache) => ProgramFactsCache): ProgramCache {
  return cache.facts ? { ...cache, facts: change(cache.facts) } : cache;
}

export function storedEnrollment(device: Storage | null, userId: string): StoredEnrollment {
  return shown(programCache.read(device, userId));
}

export function watchStoredEnrollment(watcher: Watcher): () => void {
  watchers.add(watcher);
  return () => watchers.delete(watcher);
}

export function storeTemplates(device: Storage | null, userId: string, templates: ProgramTemplateRow[]): void {
  update(device, userId, (cache) => ({ ...cache, templates }));
}

async function refreshFacts(io: EnrollmentIo, userId: string, enrollment: EnrollmentRow): Promise<ProgramCache> {
  const starting = update(io.device, userId, (cache) => withEnrollment(cache, enrollment));
  const ticket = beginFactsFetch(starting.facts ?? emptyProgramFactsCache(enrollment.id), io.now());
  const facts = programFactsFromRows(await io.server.enrollmentFacts(enrollment.id));
  return update(io.device, userId, (latest) =>
    withFacts(latest, (latestFacts) => mergeFetchedFacts(latestFacts, ticket, facts)),
  );
}

export async function refreshEnrollmentFacts(
  io: EnrollmentIo,
  userId: string,
  enrollment: EnrollmentRow,
): Promise<StoredEnrollment> {
  return told(userId, await refreshFacts(io, userId, enrollment));
}

export async function refreshEnrollment(io: EnrollmentIo, userId: string): Promise<StoredEnrollment> {
  const [templates, enrollment] = await Promise.all([io.server.templates(), io.server.activeEnrollment()]);
  const refreshed = update(io.device, userId, (cache) =>
    withEnrollment({ ...cache, templates, refreshed: true }, enrollment),
  );
  return told(userId, enrollment === null ? refreshed : await refreshFacts(io, userId, enrollment));
}

export function forgetStoredEnrollment(device: Storage | null, userId: string): void {
  updateAndTell(device, userId, (cache) => withEnrollment(cache, null));
}

export function eraseStoredEnrollment(device: Storage | null, userId: string): void {
  programCache.forget(device, userId);
}

export function recordFinishedWorkout(
  device: Storage | null,
  userId: string,
  draft: WorkoutDraft,
  { programLinked, completedAt, days }: FinishedWorkout,
): void {
  if (!draft.program || typeof programLinked !== 'boolean' || typeof completedAt !== 'string') return;
  const synced = { kind: 'synced' as const, summary: { programLinked, completedAt, days } };
  const appendedAt = Date.now();
  updateAndTell(device, userId, (cache) =>
    dayDrafts(draft, synced).reduce(
      (latest, day) => withFacts(latest, (facts) => appendFinishedSession(facts, day.draft, day.outcome, appendedAt)),
      cache,
    ),
  );
}

export function forgetStoredSession(device: Storage | null, userId: string, sessionId: string): void {
  updateAndTell(device, userId, (cache) => withFacts(cache, (facts) => forgetDeletedSession(facts, sessionId)));
}
