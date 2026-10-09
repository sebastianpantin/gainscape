import {
  type ChallengeDefinition,
  e1rmAtSessionStart,
  isRetestRef,
  loadTargetKg,
  type Position,
  type PrescribedExercise,
  type PrescriptionSnapshot,
  type RoundingSetting,
  type StrengthState,
  type WeightUnit,
} from '@domain/index.ts';
import { CARDIO_EFFORT_LEVELS, type CardioInterval, type EffortInput, isRecord } from '@domain/types.ts';
import type { CardioActivity, LoadType } from '../lib/catalog-rules.ts';
import { type CatalogChallenge, challengeLoadKg, parsedDraftChallenge } from '../lib/challenge-rules.ts';
import { EFFORT_LEVELS } from '../lib/effort-labels.ts';
import { isSessionRpe } from '../lib/session-timing-rules.ts';

const DRAFT_FORMAT_VERSION = 5;
const PRE_WARMUP_FORMAT_VERSION = 4;
const PRE_CARDIO_FORMAT_VERSION = 3;
const PRE_EFFORT_INPUT_FORMAT_VERSION = 2;
const STARTING_EXTERNAL_LOAD_KG = 20;
const STARTING_REPS = 8;
const STARTING_BOUT_DURATION_S = 1800;
const CHALLENGE_REPS_PER_SET = 10;

export interface PrescriptionDetail {
  pct: number | null;
  optional: boolean;
}

export interface DraftSet {
  id: string;
  weightKg: number;
  reps: number;
  effort: EffortInput;
  done: boolean;
  isWarmup: boolean;
  prescription?: PrescriptionSnapshot | null;
  prescriptionDetail?: PrescriptionDetail;
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
  supersetId?: string | null;
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

export interface DraftProgram {
  enrollmentId: string;
  position: Position;
  templateKey: string;
}

export interface DraftChallenge {
  challengeId: string;
  name: string;
  definition: ChallengeDefinition;
  targetLoadsKg: Record<string, number | null>;
}

export interface WorkoutDraft {
  sessionId: string;
  startedAt: string;
  finishedAt: string | null;
  programDayId: string | null;
  programLabel: string | null;
  program?: DraftProgram | null;
  challenge?: DraftChallenge | null;
  sessionRpe?: number | null;
  exercises: DraftExercise[];
}

export type StoredDraft =
  | { v: typeof DRAFT_FORMAT_VERSION; kind: 'draft'; userId: string; updatedAt: number; draft: WorkoutDraft }
  | { v: typeof DRAFT_FORMAT_VERSION; kind: 'synced'; userId: string; updatedAt: number; syncedSessionId: string }
  | {
      v: typeof DRAFT_FORMAT_VERSION;
      kind: 'discarded';
      userId: string;
      updatedAt: number;
      discardedSessionId: string;
    };

function looksLikeDraft(value: unknown): value is WorkoutDraft {
  return (
    isRecord(value) &&
    typeof value.sessionId === 'string' &&
    typeof value.startedAt === 'string' &&
    (value.finishedAt === null || typeof value.finishedAt === 'string') &&
    Array.isArray(value.exercises)
  );
}

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

function isPrescriptionSnapshot(value: unknown): value is PrescriptionSnapshot {
  return (
    isRecord(value) &&
    typeof value.ref === 'string' &&
    typeof value.weightKg === 'number' &&
    typeof value.reps === 'number' &&
    (value.minReps === null || typeof value.minReps === 'number') &&
    typeof value.amrap === 'boolean'
  );
}

function isPrescriptionDetail(value: unknown): value is PrescriptionDetail {
  return (
    isRecord(value) && (value.pct === null || typeof value.pct === 'number') && typeof value.optional === 'boolean'
  );
}

function isDraftProgram(value: unknown): value is DraftProgram {
  return (
    isRecord(value) &&
    typeof value.enrollmentId === 'string' &&
    isRecord(value.position) &&
    typeof value.templateKey === 'string'
  );
}

function withNormalisedEffort(set: Record<string, unknown>, fromV2: boolean): Record<string, unknown> {
  if (fromV2 && !('effort' in set)) {
    const { effortLevel, ...rest } = set;
    const level = EFFORT_LEVELS.find((candidate) => candidate === effortLevel);
    return { ...rest, effort: level ? { type: 'level', level } : null };
  }
  return isLiftEffortInput(set.effort) ? set : { ...set, effort: null };
}

function normalisedSet(set: unknown, fromV2: boolean): unknown {
  if (!isRecord(set)) return set;
  const prescription = isPrescriptionSnapshot(set.prescription) ? set.prescription : null;
  const { prescriptionDetail, ...rest } = withNormalisedEffort(set, fromV2);
  const isWarmup = set.isWarmup === true;
  return isPrescriptionDetail(prescriptionDetail)
    ? { ...rest, isWarmup, prescription, prescriptionDetail }
    : { ...rest, isWarmup, prescription };
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

function withUsableSessionRpe(draft: WorkoutDraft): WorkoutDraft {
  if (!('sessionRpe' in draft) || isSessionRpe(draft.sessionRpe)) return draft;
  return { ...draft, sessionRpe: null };
}

function supersetIdOf(exercise: DraftExercise): string | null {
  return exercise.modality === 'lift' && typeof exercise.supersetId === 'string' ? exercise.supersetId : null;
}

function validSupersetIds(exercises: readonly DraftExercise[]): Set<string> {
  const runLengths = new Map<string, number[]>();
  exercises.forEach((exercise, index) => {
    const id = supersetIdOf(exercise);
    if (id === null) return;
    const runs = runLengths.get(id) ?? [];
    const continuesRun = index > 0 && supersetIdOf(exercises[index - 1]) === id;
    if (continuesRun) runs[runs.length - 1] += 1;
    else runs.push(1);
    runLengths.set(id, runs);
  });
  return new Set([...runLengths].filter(([, runs]) => runs.length === 1 && runs[0] >= 2).map(([id]) => id));
}

export function withValidSupersets(exercises: DraftExercise[]): DraftExercise[] {
  const valid = validSupersetIds(exercises);
  return exercises.map((exercise) => {
    if (exercise.modality === 'cardio') {
      const kept = Object.entries(exercise).filter(([key]) => key !== 'supersetId');
      return Object.fromEntries(kept) as unknown as CardioDraftExercise;
    }
    const id = supersetIdOf(exercise);
    return { ...exercise, supersetId: id !== null && valid.has(id) ? id : null };
  });
}

function normalisedDraft(draft: WorkoutDraft, fromV2: boolean): WorkoutDraft {
  return {
    ...withUsableSessionRpe(draft),
    program: isDraftProgram(draft.program) ? draft.program : null,
    challenge: parsedDraftChallenge(draft.challenge),
    exercises: withValidSupersets(
      draft.exercises.map((exercise) => normalisedExercise(exercise, fromV2) as DraftExercise),
    ),
  };
}

const READABLE_FORMAT_VERSIONS: readonly unknown[] = [
  DRAFT_FORMAT_VERSION,
  PRE_WARMUP_FORMAT_VERSION,
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
  if (raw.kind === 'discarded' && typeof raw.discardedSessionId === 'string')
    return discardedRecord(userId, raw.updatedAt, raw.discardedSessionId);
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

export function discardedRecord(userId: string, updatedAt: number, discardedSessionId: string): StoredDraft {
  return { v: DRAFT_FORMAT_VERSION, kind: 'discarded', userId, updatedAt, discardedSessionId };
}

export function storedSessionId(record: StoredDraft): string {
  if (record.kind === 'draft') return record.draft.sessionId;
  return record.kind === 'synced' ? record.syncedSessionId : record.discardedSessionId;
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
    program: null,
    challenge: null,
    exercises: [],
  };
}

export function withSessionRpe(draft: WorkoutDraft, sessionRpe: number | null): WorkoutDraft {
  return { ...draft, sessionRpe };
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
  return { ...draft, exercises: withValidSupersets(draft.exercises.filter((_, index) => index !== exerciseIndex)) };
}

export function nextBoutValues(previous: BoutValues | undefined): BoutValues {
  if (previous === undefined) {
    return { durationS: STARTING_BOUT_DURATION_S, distanceM: null, interval: null, effort: null };
  }
  const { durationS, distanceM, interval, effort } = previous;
  return { durationS, distanceM, interval, effort };
}

export function addSet(draft: WorkoutDraft, exerciseIndex: number, firstSet?: LastLoggedSet): WorkoutDraft {
  return updateExerciseAt(draft, exerciseIndex, (exercise) => {
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
      ...nextSetValues(exercise.sets.at(-1) ?? firstSet, exercise.loadType),
      effort: null,
      done: true,
      isWarmup: false,
    };
    return { ...exercise, sets: [...exercise.sets, newSet] };
  });
}

export function addWarmupSets(
  draft: WorkoutDraft,
  exerciseIndex: number,
  warmups: readonly LastLoggedSet[],
): WorkoutDraft {
  return updateExerciseAt(draft, exerciseIndex, (exercise) => {
    if (exercise.modality === 'cardio') return exercise;
    const warmupSets: DraftSet[] = warmups.map(({ weightKg, reps }) => ({
      id: crypto.randomUUID(),
      weightKg,
      reps,
      effort: null,
      done: false,
      isWarmup: true,
    }));
    return { ...exercise, sets: [...warmupSets, ...exercise.sets] };
  });
}

export function firstWorkingSet(exercise: LiftDraftExercise): DraftSet | undefined {
  return exercise.sets.find((set) => !set.isWarmup);
}

export function updateSet(
  draft: WorkoutDraft,
  exerciseIndex: number,
  setId: string,
  changes: Partial<Omit<DraftSet, 'id'>>,
): WorkoutDraft {
  return updateExerciseAt(draft, exerciseIndex, (exercise) =>
    exercise.modality === 'lift'
      ? { ...exercise, sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...changes } : set)) }
      : exercise,
  );
}

export function seedUntouchedSet(
  draft: WorkoutDraft,
  exerciseIndex: number,
  original: DraftSet,
  seed: LastLoggedSet,
): WorkoutDraft {
  const exercise = draft.exercises[exerciseIndex];
  const current = exercise?.modality === 'lift' ? exercise.sets.find((set) => set.id === original.id) : undefined;
  const untouched =
    current !== undefined &&
    current.weightKg === original.weightKg &&
    current.reps === original.reps &&
    current.effort === original.effort;
  return untouched ? updateSet(draft, exerciseIndex, original.id, seed) : draft;
}

export function updateBout(
  draft: WorkoutDraft,
  exerciseIndex: number,
  setId: string,
  changes: Partial<Omit<CardioDraftSet, 'id' | 'kind'>>,
): WorkoutDraft {
  return updateExerciseAt(draft, exerciseIndex, (exercise) =>
    exercise.modality === 'cardio'
      ? { ...exercise, sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...changes } : set)) }
      : exercise,
  );
}

type SetOf<E> = E extends { sets: (infer S)[] } ? S : never;

export function withSets<E extends { sets: { id: string }[] }>(
  exercise: E,
  change: <S extends SetOf<E>>(sets: S[]) => S[],
): E {
  return { ...exercise, sets: change(exercise.sets as SetOf<E>[]) };
}

export function removeSet(draft: WorkoutDraft, exerciseIndex: number, setId: string): WorkoutDraft {
  return updateExerciseAt(draft, exerciseIndex, (exercise) =>
    withSets(exercise, (sets) => sets.filter((set) => set.id !== setId)),
  );
}

export function updateExerciseAt<Owner extends { exercises: unknown[] }>(
  owner: Owner,
  exerciseIndex: number,
  update: (exercise: Owner['exercises'][number]) => Owner['exercises'][number],
): Owner {
  return {
    ...owner,
    exercises: owner.exercises.map((exercise, index) => (index === exerciseIndex ? update(exercise) : exercise)),
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

type LiftCatalogEntry = Extract<CatalogEntry, { loadType: LoadType }>;

function liftDraftExercises<Entry extends { exerciseId: string }>(
  entries: readonly Entry[],
  exercisesById: ReadonlyMap<string, CatalogEntry>,
  targetAndSets: (
    entry: Entry,
    exercise: LiftCatalogEntry,
  ) => Pick<LiftDraftExercise, 'target' | 'sets' | 'supersetId'>,
): { exercises: DraftExercise[]; skippedExerciseIds: string[] } {
  const skippedExerciseIds: string[] = [];
  const exercises = entries.flatMap((entry): DraftExercise[] => {
    const exercise = exercisesById.get(entry.exerciseId);
    if (!exercise || exercise.modality === 'cardio') {
      skippedExerciseIds.push(entry.exerciseId);
      return [];
    }
    return [
      {
        exerciseId: entry.exerciseId,
        name: exercise.archived ? `${exercise.name} (archived)` : exercise.name,
        modality: 'lift',
        loadType: exercise.loadType,
        ...targetAndSets(entry, exercise),
      },
    ];
  });
  return { exercises, skippedExerciseIds };
}

export function startDraftFromDay(
  day: StartableDay,
  exercisesById: ReadonlyMap<string, CatalogEntry>,
  lastSets: ReadonlyMap<string, LastLoggedSet>,
  now: Date,
): { draft: WorkoutDraft; skippedExerciseIds: string[] } {
  const { exercises, skippedExerciseIds } = liftDraftExercises(day.exercises, exercisesById, (planned, exercise) => {
    const last = lastSets.get(planned.exerciseId);
    const weightKg = exercise.loadType === 'bodyweight' ? 0 : (last?.weightKg ?? defaultWeightKg(exercise.loadType));
    return {
      target: { sets: planned.targetSets, repsMin: planned.targetRepsMin, repsMax: planned.targetRepsMax },
      sets: Array.from({ length: planned.targetSets }, () => ({
        id: crypto.randomUUID(),
        weightKg,
        reps: planned.targetRepsMin,
        effort: null,
        done: false,
        isWarmup: false,
      })),
    };
  });
  return {
    draft: {
      sessionId: crypto.randomUUID(),
      startedAt: now.toISOString(),
      finishedAt: null,
      programDayId: day.id,
      programLabel: programLabelFor(day.programName, day.name),
      program: null,
      challenge: null,
      exercises,
    },
    skippedExerciseIds,
  };
}

export interface PrescribedDayStart {
  enrollmentId: string;
  templateKey: string;
  programName: string;
  dayName: string;
  position: Position;
  exercises: readonly PrescribedExercise[];
}

export function startDraftFromPrescription(
  day: PrescribedDayStart,
  exercisesById: ReadonlyMap<string, CatalogEntry>,
  now: Date,
): { draft: WorkoutDraft; skippedExerciseIds: string[] } {
  const { exercises, skippedExerciseIds } = liftDraftExercises(
    day.exercises,
    exercisesById,
    (prescribed, exercise) => ({
      target: null,
      sets: prescribed.sets.map((set) => ({
        id: crypto.randomUUID(),
        weightKg: set.weightKg ?? set.suggestedWeightKg ?? defaultWeightKg(exercise.loadType),
        reps: set.reps ?? STARTING_REPS,
        effort: null,
        done: false,
        isWarmup: false,
        prescription: set.snapshot,
        prescriptionDetail: { pct: set.pct, optional: set.optional },
      })),
    }),
  );
  return {
    draft: {
      sessionId: crypto.randomUUID(),
      startedAt: now.toISOString(),
      finishedAt: null,
      programDayId: null,
      programLabel: programLabelFor(day.programName, day.dayName),
      program: { enrollmentId: day.enrollmentId, position: day.position, templateKey: day.templateKey },
      challenge: null,
      exercises,
    },
    skippedExerciseIds,
  };
}

interface PlannedChallengeExercise {
  exerciseId: string;
  sets: number;
  reps: number;
  pct: number | null;
  supersetId: string | null;
}

function plannedChallengeExercises(definition: ChallengeDefinition): PlannedChallengeExercise[] {
  if (definition.kind === 'prescription') {
    return definition.groups.flatMap((group) => {
      const supersetId = group.exercises.length > 1 ? crypto.randomUUID() : null;
      return group.exercises.map(({ exerciseId, reps, pct }) => ({
        exerciseId,
        sets: group.rounds,
        reps,
        pct,
        supersetId,
      }));
    });
  }
  if (definition.metric !== 'reps' || definition.exerciseId === null) return [];
  return [
    {
      exerciseId: definition.exerciseId,
      sets: Math.ceil(definition.target / CHALLENGE_REPS_PER_SET),
      reps: CHALLENGE_REPS_PER_SET,
      pct: definition.minPct,
      supersetId: null,
    },
  ];
}

export function startDraftFromChallenge(
  challenge: CatalogChallenge,
  exercisesById: ReadonlyMap<string, CatalogEntry>,
  strength: StrengthState,
  rounding: RoundingSetting,
  unit: WeightUnit,
  now: Date,
): { draft: WorkoutDraft; skippedExerciseIds: string[] } {
  const targetLoadsKg: Record<string, number | null> = {};
  const { exercises, skippedExerciseIds } = liftDraftExercises(
    plannedChallengeExercises(challenge.definition),
    exercisesById,
    (planned, exercise) => {
      const target =
        planned.pct === null ? null : loadTargetKg(planned.pct, e1rmAtSessionStart(strength, planned.exerciseId));
      const weightKg =
        target === null || exercise.loadType !== 'external'
          ? defaultWeightKg(exercise.loadType)
          : challengeLoadKg(target, rounding, unit);
      targetLoadsKg[planned.exerciseId] = planned.pct === null ? null : weightKg;
      return {
        target: null,
        supersetId: planned.supersetId,
        sets: Array.from({ length: planned.sets }, () => ({
          id: crypto.randomUUID(),
          weightKg,
          reps: planned.reps,
          effort: null,
          done: false,
          isWarmup: false,
        })),
      };
    },
  );
  return {
    draft: {
      sessionId: crypto.randomUUID(),
      startedAt: now.toISOString(),
      finishedAt: null,
      programDayId: null,
      programLabel: `Challenge — ${challenge.name}`,
      program: null,
      challenge: { challengeId: challenge.id, name: challenge.name, definition: challenge.definition, targetLoadsKg },
      exercises: withValidSupersets(exercises),
    },
    skippedExerciseIds,
  };
}

export function toggleSetDone(draft: WorkoutDraft, exerciseIndex: number, setId: string): WorkoutDraft {
  return updateExerciseAt(draft, exerciseIndex, (exercise) =>
    withSets(exercise, (sets) => sets.map((set) => (set.id === setId ? { ...set, done: !set.done } : set))),
  );
}

const MOST_WORKING_SETS_TO_QUICK_FILL = 1;

export function canQuickFill(exercise: LiftDraftExercise): boolean {
  if (exercise.supersetId != null) return false;
  if (exercise.sets.some((set) => set.prescription)) return false;
  return exercise.sets.filter((set) => !set.isWarmup).length <= MOST_WORKING_SETS_TO_QUICK_FILL;
}

export function fillWorkingSets(draft: WorkoutDraft, exerciseIndex: number, count: number, reps: number): WorkoutDraft {
  return updateExerciseAt(draft, exerciseIndex, (exercise) => {
    if (exercise.modality === 'cardio' || !canQuickFill(exercise)) return exercise;
    const workingSets = exercise.sets.filter((set) => !set.isWarmup);
    const filled = exercise.sets.map((set) => (set.isWarmup ? set : { ...set, reps, done: true }));
    const { weightKg } = nextSetValues(workingSets.at(-1), exercise.loadType);
    const added = Array.from({ length: Math.max(0, count - workingSets.length) }, (): DraftSet => ({
      id: crypto.randomUUID(),
      weightKg,
      reps,
      effort: null,
      done: true,
      isWarmup: false,
      prescription: null,
    }));
    return { ...exercise, sets: [...filled, ...added] };
  });
}

function isLeftToLifter(set: DraftSet | CardioDraftSet): boolean {
  if ('kind' in set || set.done) return false;
  return Boolean(set.prescriptionDetail?.optional) || (set.prescription ? isRetestRef(set.prescription.ref) : false);
}

export function plannedSetsLeftToLifter(draft: WorkoutDraft): number {
  return draft.exercises.reduce((count, exercise) => count + exercise.sets.filter(isLeftToLifter).length, 0);
}

export function markPlannedSetsDone(draft: WorkoutDraft): WorkoutDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise) =>
      withSets(exercise, (sets) => sets.map((set) => (isLeftToLifter(set) ? set : { ...set, done: true }))),
    ),
  };
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
  const swapped = updateExerciseAt(draft, exerciseIndex, (exercise) =>
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
  return { ...swapped, exercises: withValidSupersets(swapped.exercises) };
}
