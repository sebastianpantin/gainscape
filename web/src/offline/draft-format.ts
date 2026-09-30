import type { EffortInput, EffortLevel } from '@domain/types.ts';
import type { LoadType } from '../lib/catalog.ts';

const DRAFT_FORMAT_VERSION = 3;
const UPGRADABLE_FORMAT_VERSION = 2;
const STARTING_EXTERNAL_LOAD_KG = 20;

export interface DraftSet {
  id: string;
  weightKg: number;
  reps: number;
  effort: EffortInput;
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

const EFFORT_LEVELS: readonly EffortLevel[] = ['easy', 'hard', 'near_failure', 'failure'];

function isHalfStepBetween(value: unknown, lowest: number, highest: number): boolean {
  return typeof value === 'number' && Number.isInteger(value * 2) && value >= lowest && value <= highest;
}

export function isEffortInput(value: unknown): value is NonNullable<EffortInput> {
  if (!isRecord(value)) return false;
  if (value.type === 'level') return EFFORT_LEVELS.some((level) => level === value.level);
  if (value.type === 'rir') return isHalfStepBetween(value.value, 0, 10);
  if (value.type === 'rpe') return isHalfStepBetween(value.value, 5, 10);
  return false;
}

function normalisedSet(set: unknown, fromV2: boolean): unknown {
  if (!isRecord(set)) return set;
  if (fromV2 && !('effort' in set)) {
    const { effortLevel, ...rest } = set;
    const level = EFFORT_LEVELS.find((candidate) => candidate === effortLevel);
    return { ...rest, effort: level ? { type: 'level', level } : null };
  }
  return isEffortInput(set.effort) ? set : { ...set, effort: null };
}

function normalisedDraft(draft: WorkoutDraft, fromV2: boolean): WorkoutDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise) =>
      isRecord(exercise) && Array.isArray(exercise.sets)
        ? { ...exercise, sets: exercise.sets.map((set) => normalisedSet(set, fromV2) as DraftSet) }
        : exercise,
    ),
  };
}

export function parseStoredDraft(raw: unknown, userId: string): StoredDraft | null {
  if (!isRecord(raw) || raw.userId !== userId) return null;
  if (raw.v !== DRAFT_FORMAT_VERSION && raw.v !== UPGRADABLE_FORMAT_VERSION) return null;
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
    return {
      v: DRAFT_FORMAT_VERSION,
      kind: 'draft',
      userId,
      updatedAt: raw.updatedAt,
      draft: normalisedDraft(raw.draft, raw.v === UPGRADABLE_FORMAT_VERSION),
    };
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
      effort: null,
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

export interface PlannedExercise {
  exerciseId: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
}

export interface StartableDay {
  id: string;
  name: string;
  programName: string;
  exercises: PlannedExercise[];
}

export interface CatalogEntry {
  name: string;
  loadType: LoadType;
  archived: boolean;
}

export interface LastLoggedSet {
  weightKg: number;
  reps: number;
}

function defaultWeightKg(loadType: LoadType): number {
  return loadType === 'external' ? STARTING_EXTERNAL_LOAD_KG : 0;
}

export function programLabelFor(programName: string, dayName: string): string {
  return `${programName} — ${dayName}`;
}

export function startDraftFromDay(
  day: StartableDay,
  exercisesById: ReadonlyMap<string, CatalogEntry>,
  lastSets: ReadonlyMap<string, LastLoggedSet>,
  now: Date,
): { draft: WorkoutDraft; skippedExerciseIds: string[] } {
  const skippedExerciseIds: string[] = [];
  const exercises = day.exercises.flatMap((planned): DraftExercise[] => {
    const exercise = exercisesById.get(planned.exerciseId);
    if (!exercise) {
      skippedExerciseIds.push(planned.exerciseId);
      return [];
    }
    const last = lastSets.get(planned.exerciseId);
    const weightKg = exercise.loadType === 'bodyweight' ? 0 : (last?.weightKg ?? defaultWeightKg(exercise.loadType));
    return [
      {
        exerciseId: planned.exerciseId,
        name: exercise.archived ? `${exercise.name} (archived)` : exercise.name,
        loadType: exercise.loadType,
        target: { sets: planned.targetSets, repsMin: planned.targetRepsMin, repsMax: planned.targetRepsMax },
        sets: Array.from({ length: planned.targetSets }, () => ({
          id: crypto.randomUUID(),
          weightKg,
          reps: planned.targetRepsMin,
          effort: null,
          done: false,
        })),
      },
    ];
  });
  return {
    draft: {
      sessionId: crypto.randomUUID(),
      startedAt: now.toISOString(),
      finishedAt: null,
      programDayId: day.id,
      programLabel: programLabelFor(day.programName, day.name),
      exercises,
    },
    skippedExerciseIds,
  };
}

export function toggleSetDone(draft: WorkoutDraft, exerciseIndex: number, setId: string): WorkoutDraft {
  const set = draft.exercises[exerciseIndex]?.sets.find((candidate) => candidate.id === setId);
  return set ? updateSet(draft, exerciseIndex, setId, { done: !set.done }) : draft;
}

export function notDoneSetCount(draft: WorkoutDraft): number {
  return draft.exercises.reduce((count, exercise) => count + exercise.sets.filter((set) => !set.done).length, 0);
}

export function canSwapExercise(draft: WorkoutDraft, exerciseIndex: number): boolean {
  const exercise = draft.exercises[exerciseIndex];
  return exercise !== undefined && exercise.sets.every((set) => !set.done);
}

export function swapExercise(
  draft: WorkoutDraft,
  exerciseIndex: number,
  replacement: { id: string; name: string; loadType: LoadType },
): WorkoutDraft | null {
  if (!canSwapExercise(draft, exerciseIndex)) return null;
  return updateExercise(draft, exerciseIndex, (exercise) => ({
    ...exercise,
    exerciseId: replacement.id,
    name: replacement.name,
    loadType: replacement.loadType,
    sets: exercise.sets.map((set) => ({ ...set, weightKg: defaultWeightKg(replacement.loadType) })),
  }));
}
