import { type ChallengeDefinition, type Position, type PrescriptionSnapshot } from '@domain/index.ts';
import { CARDIO_EFFORT_LEVELS, type EffortInput, isRecord } from '@domain/types.ts';
import type { CardioActivity } from '../lib/exercises/catalog-rules.ts';
import { parsedDraftChallenge } from '../lib/collection/challenge-rules.ts';
import { EFFORT_LEVELS } from '../lib/workout/effort-labels.ts';
import {
  type BoutSet,
  type HoldExerciseOf,
  type HoldSet,
  type LiftExerciseOf,
  type LiftSet,
} from '../lib/workout/exercise-edit-rules.ts';
import { isSessionRpe } from '../lib/workout/session-timing-rules.ts';

const DRAFT_FORMAT_VERSION = 5;
const HOLD_FORMAT_VERSION = 6;
const PRE_WARMUP_FORMAT_VERSION = 4;
const PRE_CARDIO_FORMAT_VERSION = 3;
const PRE_EFFORT_INPUT_FORMAT_VERSION = 2;

interface PrescriptionDetail {
  pct: number | null;
  optional: boolean;
}

export interface DraftSet extends LiftSet {
  done: boolean;
  prescription?: PrescriptionSnapshot | null;
  prescriptionDetail?: PrescriptionDetail;
}

interface DraftTarget {
  sets: number;
  repsMin: number;
  repsMax: number;
}

export interface CardioDraftSet extends BoutSet {
  done: boolean;
}

export interface LiftDraftExercise extends LiftExerciseOf<DraftSet> {
  clientId: string;
  target: DraftTarget | null;
  supersetId?: string | null;
}

export interface CardioDraftExercise {
  clientId: string;
  exerciseId: string;
  name: string;
  modality: 'cardio';
  activity: CardioActivity;
  sets: CardioDraftSet[];
}

export interface HoldDraftSet extends HoldSet {
  done: boolean;
}

export interface HoldDraftExercise extends HoldExerciseOf<HoldDraftSet> {
  clientId: string;
}

export type DraftExercise = LiftDraftExercise | CardioDraftExercise | HoldDraftExercise;

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
  | {
      v: typeof DRAFT_FORMAT_VERSION | typeof HOLD_FORMAT_VERSION;
      kind: 'draft';
      userId: string;
      updatedAt: number;
      draft: WorkoutDraft;
    }
  | { v: typeof DRAFT_FORMAT_VERSION; kind: 'synced'; userId: string; updatedAt: number; syncedSessionId: string }
  | {
      v: typeof DRAFT_FORMAT_VERSION;
      kind: 'discarded';
      userId: string;
      updatedAt: number;
      discardedSessionId: string;
    }
  | {
      v: typeof DRAFT_FORMAT_VERSION;
      kind: 'forgotten';
      userId: string;
      updatedAt: number;
      forgottenSessionId: string;
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

function isLevelEffort(value: unknown): boolean {
  return isRecord(value) && value.type === 'level' && EFFORT_LEVELS.some((level) => level === value.level);
}

function isLiftEffortInput(value: unknown): value is NonNullable<EffortInput> {
  if (!isRecord(value)) return false;
  if (value.type === 'level') return isLevelEffort(value);
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

function normalisedBout(bout: unknown, tracksDistance: boolean): unknown {
  if (!isRecord(bout)) return bout;
  const measured = tracksDistance ? bout : { ...bout, distanceM: null };
  return isCardioEffortInput(measured.effort) ? measured : { ...measured, effort: null };
}

function normalisedCardio(exercise: Record<string, unknown> & { sets: unknown[] }, clientId: string): unknown {
  const activity = isRecord(exercise.activity) ? exercise.activity : null;
  const tracksDistance = activity?.tracksDistance !== false;
  return {
    ...exercise,
    clientId,
    ...(activity === null ? {} : { activity: { ...activity, tracksDistance } }),
    sets: exercise.sets.map((bout) => normalisedBout(bout, tracksDistance)),
  };
}

function normalisedHoldSet(set: unknown): unknown {
  if (!isRecord(set)) return set;
  return isLevelEffort(set.effort) ? set : { ...set, effort: null };
}

function normalisedExercise(exercise: unknown, index: number, fromV2: boolean): unknown {
  if (!isRecord(exercise) || !Array.isArray(exercise.sets)) return exercise;
  const clientId = typeof exercise.clientId === 'string' ? exercise.clientId : `exercise-${index}`;
  if (exercise.modality === 'hold') return { ...exercise, clientId, sets: exercise.sets.map(normalisedHoldSet) };
  if (exercise.modality === 'cardio') return normalisedCardio({ ...exercise, sets: exercise.sets }, clientId);
  return { ...exercise, clientId, modality: 'lift', sets: exercise.sets.map((set) => normalisedSet(set, fromV2)) };
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
    if (exercise.modality !== 'lift') {
      const kept = Object.entries(exercise).filter(([key]) => key !== 'supersetId');
      return Object.fromEntries(kept) as unknown as typeof exercise;
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
      draft.exercises.map((exercise, index) => normalisedExercise(exercise, index, fromV2) as DraftExercise),
    ),
  };
}

const READABLE_FORMAT_VERSIONS: readonly unknown[] = [
  HOLD_FORMAT_VERSION,
  DRAFT_FORMAT_VERSION,
  PRE_WARMUP_FORMAT_VERSION,
  PRE_CARDIO_FORMAT_VERSION,
  PRE_EFFORT_INPUT_FORMAT_VERSION,
];

export function parseStoredDraft(raw: unknown, userId: string): StoredDraft | null {
  if (!isRecord(raw) || raw.userId !== userId) return null;
  if (!READABLE_FORMAT_VERSIONS.includes(raw.v)) return null;
  if (typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt)) return null;
  if (raw.kind === 'synced' && typeof raw.syncedSessionId === 'string') {
    if (raw.tombstone === 'discarded') return discardedRecord(userId, raw.updatedAt, raw.syncedSessionId);
    if (raw.tombstone === 'forgotten') return forgottenRecord(userId, raw.updatedAt, raw.syncedSessionId);
    return syncedRecord(userId, raw.updatedAt, raw.syncedSessionId);
  }
  if (raw.kind === 'discarded' && typeof raw.discardedSessionId === 'string')
    return discardedRecord(userId, raw.updatedAt, raw.discardedSessionId);
  if (raw.kind === 'draft' && looksLikeDraft(raw.draft))
    return draftRecord(userId, raw.updatedAt, normalisedDraft(raw.draft, raw.v === PRE_EFFORT_INPUT_FORMAT_VERSION));
  return null;
}

export function draftRecord(userId: string, updatedAt: number, draft: WorkoutDraft): StoredDraft {
  const v = draft.exercises.some((exercise) => exercise.modality === 'hold')
    ? HOLD_FORMAT_VERSION
    : DRAFT_FORMAT_VERSION;
  return { v, kind: 'draft', userId, updatedAt, draft };
}

export function syncedRecord(userId: string, updatedAt: number, syncedSessionId: string): StoredDraft {
  return { v: DRAFT_FORMAT_VERSION, kind: 'synced', userId, updatedAt, syncedSessionId };
}

export function discardedRecord(userId: string, updatedAt: number, discardedSessionId: string): StoredDraft {
  return { v: DRAFT_FORMAT_VERSION, kind: 'discarded', userId, updatedAt, discardedSessionId };
}

export function forgottenRecord(userId: string, updatedAt: number, forgottenSessionId: string): StoredDraft {
  return { v: DRAFT_FORMAT_VERSION, kind: 'forgotten', userId, updatedAt, forgottenSessionId };
}

export function storedSessionId(record: StoredDraft): string {
  if (record.kind === 'draft') return record.draft.sessionId;
  if (record.kind === 'synced') return record.syncedSessionId;
  return record.kind === 'discarded' ? record.discardedSessionId : record.forgottenSessionId;
}

export function storableRecord(record: StoredDraft): object {
  if (record.kind === 'draft' || record.kind === 'synced') return record;
  const { v, userId, updatedAt, kind } = record;
  return { v, kind: 'synced', userId, updatedAt, syncedSessionId: storedSessionId(record), tombstone: kind };
}

export function nextUpdatedAt(lastSeen: number, now: number): number {
  return Math.max(now, lastSeen + 1);
}
