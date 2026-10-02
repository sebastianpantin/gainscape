import { CARDIO_EFFORT_LEVELS, type CardioInterval, type EffortInput, type EffortLevel } from '@domain/types.ts';
import type { CardioActivity, LoadType } from '../lib/catalog-rules.ts';

const DRAFT_FORMAT_VERSION = 4;
const PRE_CARDIO_FORMAT_VERSION = 3;
const PRE_EFFORT_INPUT_FORMAT_VERSION = 2;
const STARTING_EXTERNAL_LOAD_KG = 20;
const STARTING_REPS = 8;
const STARTING_BOUT_DURATION_S = 1800;

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

export interface BoutValues {
  durationS: number;
  distanceM: number | null;
  interval: CardioInterval | null;
  effort: EffortInput;
}

export interface CardioDraftSet extends BoutValues {
  id: string;
  kind: 'cardio';
  done: boolean;
}

export interface LiftDraftExercise {
  exerciseId: string;
  name: string;
  modality: 'lift';
  loadType: LoadType;
  target: DraftTarget | null;
  sets: DraftSet[];
}

export interface CardioDraftExercise {
  exerciseId: string;
  name: string;
  modality: 'cardio';
  activity: CardioActivity;
  sets: CardioDraftSet[];
}

export type DraftExercise = LiftDraftExercise | CardioDraftExercise;

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

function isLiftEffortInput(value: unknown): value is NonNullable<EffortInput> {
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
  return isLiftEffortInput(set.effort) ? set : { ...set, effort: null };
}

function isCardioEffortInput(value: unknown): boolean {
  return isRecord(value) && value.type === 'cardio' && CARDIO_EFFORT_LEVELS.some((level) => level === value.level);
}

function normalisedBout(bout: unknown): unknown {
  if (!isRecord(bout)) return bout;
  return isCardioEffortInput(bout.effort) ? bout : { ...bout, effort: null };
}

function normalisedExercise(exercise: unknown, fromV2: boolean): unknown {
  if (!isRecord(exercise) || !Array.isArray(exercise.sets)) return exercise;
  if (exercise.modality === 'cardio') return { ...exercise, sets: exercise.sets.map(normalisedBout) };
  return { ...exercise, modality: 'lift', sets: exercise.sets.map((set) => normalisedSet(set, fromV2)) };
}

function normalisedDraft(draft: WorkoutDraft, fromV2: boolean): WorkoutDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise) => normalisedExercise(exercise, fromV2) as DraftExercise),
  };
}

const READABLE_FORMAT_VERSIONS: readonly unknown[] = [
  DRAFT_FORMAT_VERSION,
  PRE_CARDIO_FORMAT_VERSION,
  PRE_EFFORT_INPUT_FORMAT_VERSION,
];

export function parseStoredDraft(raw: unknown, userId: string): StoredDraft | null {
  if (!isRecord(raw) || raw.userId !== userId) return null;
  if (!READABLE_FORMAT_VERSIONS.includes(raw.v)) return null;
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
      draft: normalisedDraft(raw.draft, raw.v === PRE_EFFORT_INPUT_FORMAT_VERSION),
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
  const added: LiftDraftExercise = { exerciseId, name, modality: 'lift', loadType, target: null, sets: [] };
  return { ...draft, exercises: [...draft.exercises, added] };
}

export function addCardioExercise(
  draft: WorkoutDraft,
  exerciseId: string,
  name: string,
  activity: CardioActivity,
): WorkoutDraft {
  const added: CardioDraftExercise = { exerciseId, name, modality: 'cardio', activity, sets: [] };
  return { ...draft, exercises: [...draft.exercises, added] };
}

export function removeExercise(draft: WorkoutDraft, exerciseIndex: number): WorkoutDraft {
  return { ...draft, exercises: draft.exercises.filter((_, index) => index !== exerciseIndex) };
}

export function nextBoutValues(previous: BoutValues | undefined): BoutValues {
  if (previous === undefined) {
    return { durationS: STARTING_BOUT_DURATION_S, distanceM: null, interval: null, effort: null };
  }
  const { durationS, distanceM, interval, effort } = previous;
  return { durationS, distanceM, interval, effort };
}

export function addSet(draft: WorkoutDraft, exerciseIndex: number): WorkoutDraft {
  return updateExercise(draft, exerciseIndex, (exercise) => {
    if (exercise.modality === 'cardio') {
      const newBout: CardioDraftSet = {
        id: crypto.randomUUID(),
        kind: 'cardio',
        ...nextBoutValues(exercise.sets.at(-1)),
        done: true,
      };
      return { ...exercise, sets: [...exercise.sets, newBout] };
    }
    const newSet: DraftSet = {
      id: crypto.randomUUID(),
      ...nextSetValues(exercise.sets.at(-1), exercise.loadType),
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
  return updateExercise(draft, exerciseIndex, (exercise) =>
    exercise.modality === 'lift'
      ? { ...exercise, sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...changes } : set)) }
      : exercise,
  );
}

export function updateBout(
  draft: WorkoutDraft,
  exerciseIndex: number,
  setId: string,
  changes: Partial<Omit<CardioDraftSet, 'id' | 'kind'>>,
): WorkoutDraft {
  return updateExercise(draft, exerciseIndex, (exercise) =>
    exercise.modality === 'cardio'
      ? { ...exercise, sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...changes } : set)) }
      : exercise,
  );
}

type AnyDraftSet = DraftSet | CardioDraftSet;

function withSets(exercise: DraftExercise, change: <S extends AnyDraftSet>(sets: S[]) => S[]): DraftExercise {
  return exercise.modality === 'cardio'
    ? { ...exercise, sets: change(exercise.sets) }
    : { ...exercise, sets: change(exercise.sets) };
}

export function removeSet(draft: WorkoutDraft, exerciseIndex: number, setId: string): WorkoutDraft {
  return updateExercise(draft, exerciseIndex, (exercise) =>
    withSets(exercise, (sets) => sets.filter((set) => set.id !== setId)),
  );
}

export function updateExerciseAt<Exercise, Owner extends { exercises: Exercise[] }>(
  owner: Owner,
  exerciseIndex: number,
  update: (exercise: Exercise) => Exercise,
): Owner {
  return {
    ...owner,
    exercises: owner.exercises.map((exercise, index) => (index === exerciseIndex ? update(exercise) : exercise)),
  };
}

function updateExercise(
  draft: WorkoutDraft,
  exerciseIndex: number,
  update: (exercise: DraftExercise) => DraftExercise,
): WorkoutDraft {
  return updateExerciseAt(draft, exerciseIndex, update);
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
    if (exercise.modality === 'cardio') return exercise;
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

export type CatalogEntry = { name: string; archived: boolean } & (
  { modality?: 'lift'; loadType: LoadType } | { modality: 'cardio' }
);

export interface LastLoggedSet {
  weightKg: number;
  reps: number;
}

export function defaultWeightKg(loadType: LoadType): number {
  return loadType === 'external' ? STARTING_EXTERNAL_LOAD_KG : 0;
}

export function nextSetValues(
  previous: { weightKg: number; reps: number } | undefined,
  loadType: LoadType,
): { weightKg: number; reps: number } {
  return { weightKg: previous?.weightKg ?? defaultWeightKg(loadType), reps: previous?.reps ?? STARTING_REPS };
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
    if (!exercise || exercise.modality === 'cardio') {
      skippedExerciseIds.push(planned.exerciseId);
      return [];
    }
    const last = lastSets.get(planned.exerciseId);
    const weightKg = exercise.loadType === 'bodyweight' ? 0 : (last?.weightKg ?? defaultWeightKg(exercise.loadType));
    return [
      {
        exerciseId: planned.exerciseId,
        name: exercise.archived ? `${exercise.name} (archived)` : exercise.name,
        modality: 'lift',
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
  return updateExercise(draft, exerciseIndex, (exercise) =>
    withSets(exercise, (sets) => sets.map((set) => (set.id === setId ? { ...set, done: !set.done } : set))),
  );
}

export function notDoneSetCount(draft: WorkoutDraft): number {
  return draft.exercises.reduce((count, exercise) => count + exercise.sets.filter((set) => !set.done).length, 0);
}

export function canSwapExercise(draft: WorkoutDraft, exerciseIndex: number): boolean {
  const exercise = draft.exercises[exerciseIndex];
  return exercise?.modality === 'lift' && exercise.sets.every((set) => !set.done);
}

export function swapExercise(
  draft: WorkoutDraft,
  exerciseIndex: number,
  replacement: { id: string; name: string; loadType: LoadType },
): WorkoutDraft | null {
  if (!canSwapExercise(draft, exerciseIndex)) return null;
  return updateExercise(draft, exerciseIndex, (exercise) =>
    exercise.modality === 'cardio'
      ? exercise
      : {
          ...exercise,
          exerciseId: replacement.id,
          name: replacement.name,
          loadType: replacement.loadType,
          sets: exercise.sets.map((set) => ({ ...set, weightKg: defaultWeightKg(replacement.loadType) })),
        },
  );
}
