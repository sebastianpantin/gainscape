import { DEFAULT_BALANCE } from '@domain/balance.ts';
import { isWithinEditWindow } from '@domain/edit-window.ts';
import { effortInputFromStored } from '@domain/effort.ts';
import { roundTo } from '@domain/strength.ts';
import {
  type CardioEffortLevel,
  type CardioInterval,
  type DropSummary,
  type EffortInput,
  type EffortLevel,
  MAX_SETS_PER_SESSION,
  type SessionSummary,
} from '@domain/types.ts';
import type { CardioActivity, LoadType, PaceUnit } from '../../lib/catalog.ts';
import type { InvokeOutcome } from '../../lib/function-client.ts';
import {
  type EditSessionPayload,
  type HistorySession,
  type StoredSetRow,
  transientReason,
} from '../../lib/history-rules.ts';
import { RATE_LIMITED_CODE, retryAfterSeconds } from '../../lib/rate-limit.ts';
import {
  type BoutValues,
  defaultWeightKg,
  nextBoutValues,
  nextSetValues,
  updateExerciseAt,
} from '../../offline/draft-format.ts';
import { boutPayload } from '../../offline/session-payload.ts';

type ExerciseKind =
  { modality?: 'lift'; loadType: LoadType } | { modality: 'cardio'; activity: Pick<CardioActivity, 'paceUnit'> };

export type KnownExercise = { name: string } & ExerciseKind;

export type NewExercise = { id: string; name: string } & ExerciseKind;

export interface EditSet {
  id: string;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  effort: EffortInput;
}

export interface EditBout extends BoutValues {
  id: string;
  kind: 'cardio';
}

export interface LiftEditExercise {
  exerciseId: string;
  name: string;
  modality: 'lift';
  loadType: LoadType;
  sets: EditSet[];
}

export interface CardioEditExercise {
  exerciseId: string;
  name: string;
  modality: 'cardio';
  paceUnit: PaceUnit;
  sets: EditBout[];
}

export type EditExercise = LiftEditExercise | CardioEditExercise;

export interface SessionEdit {
  sessionId: string;
  revision: number;
  notes: string;
  exercises: EditExercise[];
}

type LiftHeader = Omit<LiftEditExercise, 'sets'>;
type CardioHeader = Omit<CardioEditExercise, 'sets'>;

type PlacedSet =
  { modality: 'lift'; header: LiftHeader; set: EditSet } | { modality: 'cardio'; header: CardioHeader; set: EditBout };

const UNKNOWN_EXERCISE_NAME = 'Unknown exercise';
const UNKNOWN_EXERCISE_LOAD_TYPE: LoadType = 'external';
const UNKNOWN_EXERCISE_PACE_UNIT: PaceUnit = 'per_km';

export function isEditable(session: Pick<HistorySession, 'historyOnly' | 'startedAt'>, now: number): boolean {
  return !session.historyOnly && isWithinEditWindow(session.startedAt, now);
}

export function sessionXp(summary: Pick<SessionSummary, 'xpBySkill'>): number {
  return Object.values(summary.xpBySkill ?? {}).reduce((sum, xp) => sum + xp, 0);
}

export function formatSessionDate(localDate: string): string {
  return new Date(`${localDate}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function storedInterval(row: StoredSetRow): CardioInterval | null {
  const { intervalWorkS: workS, intervalRestS: restS, intervalRounds: rounds } = row;
  return workS === null || restS === null || rounds === null ? null : { workS, restS, rounds };
}

function placedFromRow(row: StoredSetRow, known: KnownExercise | undefined): PlacedSet {
  const name = known?.name ?? UNKNOWN_EXERCISE_NAME;
  const effort = effortInputFromStored(row.effortInputType, row.effortValue, DEFAULT_BALANCE);
  if (row.durationS !== null) {
    const paceUnit = known?.modality === 'cardio' ? known.activity.paceUnit : UNKNOWN_EXERCISE_PACE_UNIT;
    return {
      modality: 'cardio',
      header: { exerciseId: row.exerciseId, name, modality: 'cardio', paceUnit },
      set: {
        id: row.id,
        kind: 'cardio',
        durationS: row.durationS,
        distanceM: row.distanceM,
        interval: storedInterval(row),
        effort,
      },
    };
  }
  const loadType = known !== undefined && known.modality !== 'cardio' ? known.loadType : UNKNOWN_EXERCISE_LOAD_TYPE;
  return {
    modality: 'lift',
    header: { exerciseId: row.exerciseId, name, modality: 'lift', loadType },
    set: {
      id: row.id,
      weightKg: roundTo(2, row.weightKg ?? 0),
      reps: row.reps ?? 0,
      isWarmup: row.isWarmup,
      effort,
    },
  };
}

export function editFromSession(
  session: Pick<HistorySession, 'id' | 'revision' | 'notes'>,
  rows: readonly StoredSetRow[],
  exercisesById: ReadonlyMap<string, KnownExercise>,
): SessionEdit {
  const placed = [...rows]
    .sort((a, b) => a.position - b.position)
    .map((row) => placedFromRow(row, exercisesById.get(row.exerciseId)));
  return { sessionId: session.id, revision: session.revision, notes: session.notes ?? '', exercises: grouped(placed) };
}

export function editPayload(edit: SessionEdit): EditSessionPayload {
  const notes = edit.notes.trim() === '' ? null : edit.notes;
  const sets = placedSets(edit).map((placed, position) =>
    placed.modality === 'cardio'
      ? boutPayload(placed.set, placed.header.exerciseId, position)
      : {
          id: placed.set.id,
          exerciseId: placed.header.exerciseId,
          position,
          weightKg: roundTo(2, placed.set.weightKg),
          reps: placed.set.reps,
          isWarmup: placed.set.isWarmup,
          effort: placed.set.effort,
        },
  );
  return { sessionId: edit.sessionId, ifRevision: edit.revision, notes, sets };
}

export function hasChanges(edit: SessionEdit, original: SessionEdit): boolean {
  const comparable = (candidate: SessionEdit) => JSON.stringify({ ...editPayload(candidate), ifRevision: 0 });
  return comparable(edit) !== comparable(original);
}

function setsById(edit: SessionEdit): Map<string, string> {
  return new Map(
    placedSets(edit).map(
      (placed) => [placed.set.id, JSON.stringify({ exerciseId: placed.header.exerciseId, ...placed.set })] as const,
    ),
  );
}

export function dropsAtRisk<D extends Pick<DropSummary, 'setId'>>(
  edit: SessionEdit,
  original: SessionEdit,
  drops: readonly D[],
): D[] {
  const before = setsById(original);
  const after = setsById(edit);
  return drops.filter((drop) => before.has(drop.setId) && after.get(drop.setId) !== before.get(drop.setId));
}

export function editSetCount(edit: SessionEdit): number {
  return edit.exercises.reduce((count, exercise) => count + exercise.sets.length, 0);
}

export function canAddSet(edit: SessionEdit): boolean {
  return editSetCount(edit) < MAX_SETS_PER_SESSION;
}

function updateExercise(
  edit: SessionEdit,
  exerciseIndex: number,
  update: (exercise: EditExercise) => EditExercise,
): SessionEdit {
  return updateExerciseAt(edit, exerciseIndex, update);
}

export function updateEditSet(
  edit: SessionEdit,
  exerciseIndex: number,
  setId: string,
  changes: Partial<Omit<EditSet, 'id'>>,
): SessionEdit {
  return updateExercise(edit, exerciseIndex, (exercise) =>
    exercise.modality === 'lift'
      ? { ...exercise, sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...changes } : set)) }
      : exercise,
  );
}

export function updateEditBout(
  edit: SessionEdit,
  exerciseIndex: number,
  setId: string,
  changes: Partial<BoutValues>,
): SessionEdit {
  return updateExercise(edit, exerciseIndex, (exercise) =>
    exercise.modality === 'cardio'
      ? { ...exercise, sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...changes } : set)) }
      : exercise,
  );
}

export function removeEditSet(edit: SessionEdit, exerciseIndex: number, setId: string): SessionEdit {
  const removed = updateExercise(edit, exerciseIndex, (exercise) =>
    exercise.modality === 'cardio'
      ? { ...exercise, sets: exercise.sets.filter((set) => set.id !== setId) }
      : { ...exercise, sets: exercise.sets.filter((set) => set.id !== setId) },
  );
  return { ...removed, exercises: removed.exercises.filter((exercise) => exercise.sets.length > 0) };
}

export function addEditSet(edit: SessionEdit, exerciseIndex: number): SessionEdit {
  if (!canAddSet(edit)) return edit;
  return updateExercise(edit, exerciseIndex, (exercise) => {
    if (exercise.modality === 'cardio') {
      const newBout: EditBout = { id: crypto.randomUUID(), kind: 'cardio', ...nextBoutValues(exercise.sets.at(-1)) };
      return { ...exercise, sets: [...exercise.sets, newBout] };
    }
    const newSet: EditSet = {
      id: crypto.randomUUID(),
      ...nextSetValues(exercise.sets.at(-1), exercise.loadType),
      isWarmup: false,
      effort: null,
    };
    return { ...exercise, sets: [...exercise.sets, newSet] };
  });
}

function emptyExercise(exercise: NewExercise): EditExercise {
  const identity = { exerciseId: exercise.id, name: exercise.name };
  return exercise.modality === 'cardio'
    ? { ...identity, modality: 'cardio', paceUnit: exercise.activity.paceUnit, sets: [] }
    : { ...identity, modality: 'lift', loadType: exercise.loadType, sets: [] };
}

export function addEditExercise(edit: SessionEdit, exercise: NewExercise): SessionEdit {
  if (!canAddSet(edit)) return edit;
  return addEditSet({ ...edit, exercises: [...edit.exercises, emptyExercise(exercise)] }, edit.exercises.length);
}

export function swapEditExercise(edit: SessionEdit, exerciseIndex: number, replacement: NewExercise): SessionEdit {
  return updateExercise(edit, exerciseIndex, (exercise) => {
    const identity = { exerciseId: replacement.id, name: replacement.name };
    if (exercise.modality === 'cardio') {
      return replacement.modality === 'cardio'
        ? { ...exercise, ...identity, paceUnit: replacement.activity.paceUnit }
        : exercise;
    }
    if (replacement.modality === 'cardio') return exercise;
    return {
      ...exercise,
      ...identity,
      loadType: replacement.loadType,
      sets:
        replacement.loadType === exercise.loadType
          ? exercise.sets
          : exercise.sets.map((set) => ({ ...set, weightKg: defaultWeightKg(replacement.loadType) })),
    };
  });
}

export function withNewSetIds(edit: SessionEdit, setIds: readonly string[]): SessionEdit {
  const conflicting = new Set(setIds.map((id) => id.toLowerCase()));
  const freshId = <S extends { id: string }>(set: S): S =>
    conflicting.has(set.id.toLowerCase()) ? { ...set, id: crypto.randomUUID() } : set;
  return {
    ...edit,
    exercises: edit.exercises.map((exercise) =>
      exercise.modality === 'cardio'
        ? { ...exercise, sets: exercise.sets.map(freshId) }
        : { ...exercise, sets: exercise.sets.map(freshId) },
    ),
  };
}

export function withoutBodyweightLoads(edit: SessionEdit, loadTypes: ReadonlyMap<string, LoadType>): SessionEdit {
  return {
    ...edit,
    exercises: edit.exercises.map((exercise) => {
      if (exercise.modality === 'cardio') return exercise;
      const loadType = loadTypes.get(exercise.exerciseId) ?? exercise.loadType;
      const sets = loadType === 'bodyweight' ? exercise.sets.map((set) => ({ ...set, weightKg: 0 })) : exercise.sets;
      return { ...exercise, loadType, sets };
    }),
  };
}

export const EFFORT_LEVEL_LABELS: Record<EffortLevel, string> = {
  easy: 'Easy',
  hard: 'Hard',
  near_failure: 'Near fail',
  failure: 'Failure',
};

export const CARDIO_EFFORT_LABELS: Record<CardioEffortLevel, string> = {
  easy: 'Easy',
  moderate: 'Moderate',
  hard: 'Hard',
  max: 'Max',
};

function placedSets(edit: SessionEdit): PlacedSet[] {
  return edit.exercises.flatMap((exercise): PlacedSet[] => {
    if (exercise.modality === 'cardio') {
      const { sets, ...header } = exercise;
      return sets.map((set) => ({ modality: 'cardio', header, set }));
    }
    const { sets, ...header } = exercise;
    return sets.map((set) => ({ modality: 'lift', header, set }));
  });
}

const LIFT_FIELDS = ['weightKg', 'reps', 'isWarmup', 'effort'] as const;
const BOUT_FIELDS = ['durationS', 'distanceM', 'interval', 'effort'] as const;

function comparableField<S extends object>(set: S, field: keyof S): string {
  const value = set[field];
  return JSON.stringify(field === 'weightKg' && typeof value === 'number' ? roundTo(2, value) : value);
}

function changedFields<S extends object, F extends keyof S>(mine: S, before: S, fields: readonly F[]): F[] {
  return fields.filter((field) => comparableField(mine, field) !== comparableField(before, field));
}

function mergedFields<S extends object, F extends keyof S>(remote: S, before: S, mine: S, fields: readonly F[]): S {
  const merged = { ...remote };
  for (const field of changedFields(mine, before, fields)) merged[field] = mine[field];
  return merged;
}

function isChangedHere(mine: PlacedSet, before: PlacedSet): boolean {
  if (mine.header.exerciseId !== before.header.exerciseId) return true;
  if (mine.modality === 'cardio' && before.modality === 'cardio') {
    return changedFields(mine.set, before.set, BOUT_FIELDS).length > 0;
  }
  if (mine.modality === 'lift' && before.modality === 'lift') {
    return changedFields(mine.set, before.set, LIFT_FIELDS).length > 0;
  }
  return true;
}

function mergedSet(remote: PlacedSet, before: PlacedSet, mine: PlacedSet): PlacedSet {
  const header = mine.header.exerciseId === before.header.exerciseId ? remote.header : mine.header;
  if (remote.modality === 'cardio' && before.modality === 'cardio' && mine.modality === 'cardio') {
    return header.modality === 'cardio'
      ? { modality: 'cardio', header, set: mergedFields(remote.set, before.set, mine.set, BOUT_FIELDS) }
      : remote;
  }
  if (remote.modality === 'lift' && before.modality === 'lift' && mine.modality === 'lift') {
    return header.modality === 'lift'
      ? { modality: 'lift', header, set: mergedFields(remote.set, before.set, mine.set, LIFT_FIELDS) }
      : remote;
  }
  return remote;
}

function grouped(placed: readonly PlacedSet[]): EditExercise[] {
  const exercises: EditExercise[] = [];
  for (const entry of placed) {
    const current = exercises.at(-1);
    if (current?.exerciseId === entry.header.exerciseId) {
      if (current.modality === 'cardio' && entry.modality === 'cardio') {
        current.sets.push(entry.set);
        continue;
      }
      if (current.modality === 'lift' && entry.modality === 'lift') {
        current.sets.push(entry.set);
        continue;
      }
    }
    exercises.push(
      entry.modality === 'cardio' ? { ...entry.header, sets: [entry.set] } : { ...entry.header, sets: [entry.set] },
    );
  }
  return exercises;
}

export interface RebasedEdit {
  edit: SessionEdit;
  droppedSetIds: string[];
}

export function rebaseEdit(edit: SessionEdit, original: SessionEdit, fresh: SessionEdit): RebasedEdit {
  const originalById = new Map(placedSets(original).map((placed) => [placed.set.id, placed]));
  const local = placedSets(edit);
  const localById = new Map(local.map((placed) => [placed.set.id, placed]));
  const remote = placedSets(fresh);
  const remoteIds = new Set(remote.map((placed) => placed.set.id));
  const droppedSetIds = local
    .filter((mine) => {
      const before = originalById.get(mine.set.id);
      return before !== undefined && !remoteIds.has(mine.set.id) && isChangedHere(mine, before);
    })
    .map((mine) => mine.set.id);
  const merged = remote.flatMap((theirs): PlacedSet[] => {
    const before = originalById.get(theirs.set.id);
    if (!before) return [theirs];
    const mine = localById.get(theirs.set.id);
    if (!mine) return [];
    return [mergedSet(theirs, before, mine)];
  });
  local.forEach((placed, index) => {
    if (originalById.has(placed.set.id)) return;
    const predecessor = local
      .slice(0, index)
      .reverse()
      .find((candidate) => merged.some((kept) => kept.set.id === candidate.set.id));
    const at = predecessor ? merged.findIndex((kept) => kept.set.id === predecessor.set.id) + 1 : 0;
    merged.splice(at, 0, placed);
  });
  return {
    edit: {
      sessionId: fresh.sessionId,
      revision: fresh.revision,
      notes: edit.notes === original.notes ? fresh.notes : edit.notes,
      exercises: grouped(merged),
    },
    droppedSetIds,
  };
}

export function rebaseNotice(rebased: RebasedEdit, fresh: SessionEdit): string {
  const dropped = rebased.droppedSetIds.length;
  const droppedText =
    dropped === 0
      ? ''
      : `${dropped} ${dropped === 1 ? 'set you changed was' : 'sets you changed were'} deleted on the other device. `;
  if (editSetCount(rebased.edit) === 0)
    return `${droppedText}No sets are left to save. Undo to keep the latest version, or delete the workout.`;
  if (!hasChanges(rebased.edit, fresh))
    return `${droppedText}Nothing else of yours is left to save; this is the latest version.`;
  return `${droppedText}Your changes were applied to the latest version. Check them, then save.`;
}

export function effortLabel(effort: EffortInput): string | null {
  if (effort === null) return null;
  if (effort.type === 'level') return EFFORT_LEVEL_LABELS[effort.level];
  if (effort.type === 'cardio') return CARDIO_EFFORT_LABELS[effort.level];
  return `${effort.type.toUpperCase()} ${effort.value}`;
}

export type FailureAction =
  | { kind: 'retry'; reason: string }
  | { kind: 'sign_out' }
  | { kind: 'wrong_account' }
  | { kind: 'gone' }
  | { kind: 'read_only' }
  | { kind: 'revision_conflict' }
  | { kind: 'reid_sets'; setIds: string[] }
  | { kind: 'ask_bodyweight' }
  | { kind: 'unknown_exercise'; exerciseIds: string[] }
  | { kind: 'fix_bodyweight_load' }
  | { kind: 'rate_limited'; retryAfterSeconds: number | null }
  | { kind: 'bug'; code: string };

function stringList(details: unknown, key: string): string[] {
  if (typeof details !== 'object' || details === null) return [];
  const value = (details as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

const FAILURE_ACTIONS: Record<string, (details: unknown) => FailureAction> = {
  edit_window_closed: () => ({ kind: 'read_only' }),
  revision_conflict: () => ({ kind: 'revision_conflict' }),
  set_id_conflict: (details) => ({ kind: 'reid_sets', setIds: stringList(details, 'setIds') }),
  bodyweight_required: () => ({ kind: 'ask_bodyweight' }),
  unknown_exercise: (details) => ({ kind: 'unknown_exercise', exerciseIds: stringList(details, 'exerciseIds') }),
  bodyweight_load_not_zero: () => ({ kind: 'fix_bodyweight_load' }),
  profile_missing: () => ({ kind: 'sign_out' }),
  session_not_found: () => ({ kind: 'gone' }),
  [RATE_LIMITED_CODE]: (details) => ({ kind: 'rate_limited', retryAfterSeconds: retryAfterSeconds(details) }),
};

export function failureAction(outcome: Exclude<InvokeOutcome<unknown>, { kind: 'ok' }>): FailureAction {
  const retryReason = transientReason(outcome);
  if (retryReason !== null) return { kind: 'retry', reason: retryReason };
  if (outcome.kind === 'needs_sign_in') return { kind: 'sign_out' };
  if (outcome.kind === 'wrong_account') return { kind: 'wrong_account' };
  if (outcome.kind === 'retryable') return { kind: 'retry', reason: outcome.reason };
  const action = FAILURE_ACTIONS[outcome.code]?.(outcome.details);
  return action ?? { kind: 'bug', code: outcome.code };
}
