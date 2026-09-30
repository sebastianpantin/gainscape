import type { EffortLevel } from '@domain/types.ts';
import type { LoadType } from '../lib/catalog.ts';

const DRAFT_FORMAT_VERSION = 2;
const STARTING_EXTERNAL_LOAD_KG = 20;

export interface DraftSet {
  id: string;
  weightKg: number;
  reps: number;
  effortLevel: EffortLevel | null;
  done: boolean;
}

export interface DraftTarget {
  sets: number;
  repsMin: number;
  repsMax: number;
}

export interface DraftExercise {
  exerciseId: string;
  name: string;
  loadType: LoadType;
  target: DraftTarget | null;
  sets: DraftSet[];
}

export interface WorkoutDraft {
  sessionId: string;
  startedAt: string;
  finishedAt: string | null;
  programDayId: string | null;
  programLabel: string | null;
  exercises: DraftExercise[];
}

export type StoredDraft =
  | { v: typeof DRAFT_FORMAT_VERSION; kind: 'draft'; userId: string; updatedAt: number; draft: WorkoutDraft }
  | { v: typeof DRAFT_FORMAT_VERSION; kind: 'synced'; userId: string; updatedAt: number; syncedSessionId: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeDraft(value: unknown): value is WorkoutDraft {
  return (
    isRecord(value) &&
    typeof value.sessionId === 'string' &&
    typeof value.startedAt === 'string' &&
    (value.finishedAt === null || typeof value.finishedAt === 'string') &&
    Array.isArray(value.exercises)
  );
}

export function parseStoredDraft(raw: unknown, userId: string): StoredDraft | null {
  if (!isRecord(raw) || raw.v !== DRAFT_FORMAT_VERSION || raw.userId !== userId) return null;
  if (typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt)) return null;
  if (raw.kind === 'synced' && typeof raw.syncedSessionId === 'string')
    return {
      v: DRAFT_FORMAT_VERSION,
      kind: 'synced',
      userId,
      updatedAt: raw.updatedAt,
      syncedSessionId: raw.syncedSessionId,
    };
  if (raw.kind === 'draft' && looksLikeDraft(raw.draft))
    return { v: DRAFT_FORMAT_VERSION, kind: 'draft', userId, updatedAt: raw.updatedAt, draft: raw.draft };
  return null;
}

export function draftRecord(userId: string, updatedAt: number, draft: WorkoutDraft): StoredDraft {
  return { v: DRAFT_FORMAT_VERSION, kind: 'draft', userId, updatedAt, draft };
}

export function syncedRecord(userId: string, updatedAt: number, syncedSessionId: string): StoredDraft {
  return { v: DRAFT_FORMAT_VERSION, kind: 'synced', userId, updatedAt, syncedSessionId };
}

export function storedSessionId(record: StoredDraft): string {
  return record.kind === 'draft' ? record.draft.sessionId : record.syncedSessionId;
}

export function nextUpdatedAt(lastSeen: number, now: number): number {
  return Math.max(now, lastSeen + 1);
}

export function startDraft(): WorkoutDraft {
  return {
    sessionId: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    programDayId: null,
    programLabel: null,
    exercises: [],
  };
}

export function addExercise(draft: WorkoutDraft, exerciseId: string, name: string, loadType: LoadType): WorkoutDraft {
  return { ...draft, exercises: [...draft.exercises, { exerciseId, name, loadType, target: null, sets: [] }] };
}

export function removeExercise(draft: WorkoutDraft, exerciseIndex: number): WorkoutDraft {
  return { ...draft, exercises: draft.exercises.filter((_, index) => index !== exerciseIndex) };
}

export function addSet(draft: WorkoutDraft, exerciseIndex: number): WorkoutDraft {
  return updateExercise(draft, exerciseIndex, (exercise) => {
    const previous = exercise.sets.at(-1);
    const newSet: DraftSet = {
      id: crypto.randomUUID(),
      weightKg: previous?.weightKg ?? (exercise.loadType === 'external' ? STARTING_EXTERNAL_LOAD_KG : 0),
      reps: previous?.reps ?? 8,
      effortLevel: null,
      done: true,
    };
    return { ...exercise, sets: [...exercise.sets, newSet] };
  });
}

export function updateSet(
  draft: WorkoutDraft,
  exerciseIndex: number,
  setId: string,
  changes: Partial<Omit<DraftSet, 'id'>>,
): WorkoutDraft {
  return updateExercise(draft, exerciseIndex, (exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...changes } : set)),
  }));
}

export function removeSet(draft: WorkoutDraft, exerciseIndex: number, setId: string): WorkoutDraft {
  return updateExercise(draft, exerciseIndex, (exercise) => ({
    ...exercise,
    sets: exercise.sets.filter((set) => set.id !== setId),
  }));
}

function updateExercise(
  draft: WorkoutDraft,
  exerciseIndex: number,
  update: (exercise: DraftExercise) => DraftExercise,
): WorkoutDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise, index) => (index === exerciseIndex ? update(exercise) : exercise)),
  };
}

export function doneSetCount(draft: WorkoutDraft): number {
  return draft.exercises.reduce((count, exercise) => count + exercise.sets.filter((set) => set.done).length, 0);
}

export function withCurrentLoadTypes(
  draft: WorkoutDraft,
  loadTypes: ReadonlyMap<string, LoadType>,
): { draft: WorkoutDraft; changedNames: string[] } {
  const changedNames: string[] = [];
  const exercises = draft.exercises.map((exercise) => {
    const current = loadTypes.get(exercise.exerciseId);
    if (current === undefined || current === exercise.loadType) return exercise;
    changedNames.push(exercise.name);
    const sets = current === 'bodyweight' ? exercise.sets.map((set) => ({ ...set, weightKg: 0 })) : exercise.sets;
    return { ...exercise, loadType: current, sets };
  });
  return { draft: changedNames.length > 0 ? { ...draft, exercises } : draft, changedNames };
}
