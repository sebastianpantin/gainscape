import { DEFAULT_BALANCE } from '@domain/balance.ts';
import { effortInputFromStored } from '@domain/effort.ts';
import { roundTo } from '@domain/math.ts';
import type { CardioInterval, DropSummary } from '@domain/types.ts';
import type { CardioActivity, Exercise, HoldMeasure, LoadType, PaceUnit } from '../../lib/exercises/catalog-rules.ts';
import { formatLoad } from '../../lib/format.ts';
import type { InvokeOutcome } from '../../lib/platform/function-client-rules.ts';
import {
  type EditSessionPayload,
  type SessionDetail,
  type StoredSetRow,
  transientReason,
} from '../../lib/history/history-rules.ts';
import { type CatalogItem, describeDrops, itemNameLookup } from '../../lib/collection/item-rules.ts';
import type { UnitPref } from '../../lib/profile/profile.ts';
import { RATE_LIMITED_CODE, retryAfterSeconds, tryAgainIn } from '../../lib/platform/rate-limit.ts';
import {
  addExerciseTo,
  addSetTo,
  BODYWEIGHT_LOAD_NOT_ZERO_CODE,
  type BoutSet,
  type HoldExerciseOf,
  type HoldSet,
  type HoldValues,
  type LiftExerciseOf,
  type LiftSet,
  removeSet,
  setCount,
  swapLoadedExercise,
  UNKNOWN_EXERCISE_CODE,
  updateExerciseAt,
  withLoadType,
  withSets,
} from '../../lib/workout/exercise-edit-rules.ts';
import { boutPayload, holdPayload } from '../../offline/session-payload.ts';

type ExerciseKind =
  | { modality?: 'lift'; loadType: LoadType; measure?: HoldMeasure }
  | { modality: 'cardio'; activity: Pick<CardioActivity, 'paceUnit' | 'tracksDistance'> };

export type KnownExercise = { name: string } & ExerciseKind;

type NewExercise = { id: string; name: string } & ExerciseKind;

type HoldEditExercise = HoldExerciseOf<HoldSet>;

export type LiftEditExercise = LiftExerciseOf<LiftSet>;

interface CardioEditExercise {
  exerciseId: string;
  name: string;
  modality: 'cardio';
  paceUnit: PaceUnit;
  tracksDistance: boolean;
  sets: BoutSet[];
}

export type EditExercise = LiftEditExercise | CardioEditExercise | HoldEditExercise;

export interface SessionEdit {
  sessionId: string;
  revision: number;
  notes: string;
  exercises: EditExercise[];
}

type LiftHeader = Omit<LiftEditExercise, 'sets'>;
type CardioHeader = Omit<CardioEditExercise, 'sets'>;
type HoldHeader = Omit<HoldEditExercise, 'sets'>;

type PlacedSet =
  | { modality: 'lift'; header: LiftHeader; set: LiftSet }
  | { modality: 'cardio'; header: CardioHeader; set: BoutSet }
  | { modality: 'hold'; header: HoldHeader; set: HoldSet };

const UNKNOWN_EXERCISE_NAME = 'Unknown exercise';
const UNKNOWN_EXERCISE_LOAD_TYPE: LoadType = 'external';
const UNKNOWN_EXERCISE_PACE_UNIT: PaceUnit = 'per_km';

function storedInterval(row: StoredSetRow): CardioInterval | null {
  const { intervalWorkS: workS, intervalRestS: restS, intervalRounds: rounds } = row;
  return workS === null || restS === null || rounds === null ? null : { workS, restS, rounds };
}

function placedFromRow(row: StoredSetRow, known: KnownExercise | undefined): PlacedSet {
  const name = known?.name ?? UNKNOWN_EXERCISE_NAME;
  const effort = effortInputFromStored(row.effortInputType, row.effortValue, DEFAULT_BALANCE);
  if (row.reps === null && row.weightKg !== null && row.countedWorkS === null) {
    const measure: HoldMeasure = row.durationS !== null ? 'time' : 'distance';
    const loadType = known !== undefined && known.modality !== 'cardio' ? known.loadType : UNKNOWN_EXERCISE_LOAD_TYPE;
    return {
      modality: 'hold',
      header: { exerciseId: row.exerciseId, name, modality: 'hold', measure, loadType },
      set: {
        id: row.id,
        kind: 'hold',
        weightKg: roundTo(2, row.weightKg),
        durationS: row.durationS,
        distanceM: row.distanceM,
        effort,
      },
    };
  }
  if (row.durationS !== null) {
    const activity = known?.modality === 'cardio' ? known.activity : null;
    const paceUnit = activity?.paceUnit ?? UNKNOWN_EXERCISE_PACE_UNIT;
    const tracksDistance = activity?.tracksDistance ?? true;
    return {
      modality: 'cardio',
      header: { exerciseId: row.exerciseId, name, modality: 'cardio', paceUnit, tracksDistance },
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
  session: Pick<SessionDetail, 'id' | 'revision' | 'notes'>,
  rows: readonly StoredSetRow[],
  exercisesById: ReadonlyMap<string, KnownExercise>,
): SessionEdit {
  const placed = [...rows]
    .sort((a, b) => a.position - b.position)
    .map((row) => placedFromRow(row, exercisesById.get(row.exerciseId)));
  return { sessionId: session.id, revision: session.revision, notes: session.notes ?? '', exercises: grouped(placed) };
}

function setPayload(placed: PlacedSet, position: number): EditSessionPayload['sets'][number] {
  switch (placed.modality) {
    case 'cardio':
      return boutPayload(placed.set, placed.header.exerciseId, position);
    case 'hold':
      return holdPayload(
        { ...placed.set, weightKg: roundTo(2, placed.set.weightKg) },
        placed.header.exerciseId,
        position,
      );
    case 'lift':
      return {
        id: placed.set.id,
        exerciseId: placed.header.exerciseId,
        position,
        weightKg: roundTo(2, placed.set.weightKg),
        reps: placed.set.reps,
        isWarmup: placed.set.isWarmup,
        effort: placed.set.effort,
      };
  }
}

export function editPayload(edit: SessionEdit): EditSessionPayload {
  const notes = edit.notes.trim() === '' ? null : edit.notes;
  const sets = placedSets(edit).map(setPayload);
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

export function savedEdit(sent: SessionEdit, revision: number): SessionEdit {
  return { ...sent, revision };
}

export function summariesToForget(
  sessionId: string,
  replayedSessionIds: readonly string[],
  retried: boolean,
  rememberedSessionId: string | undefined,
): string[] {
  const possiblyReplayed = retried && rememberedSessionId !== undefined ? [rememberedSessionId] : [];
  return [sessionId, ...replayedSessionIds, ...possiblyReplayed];
}

export function removeEditSet(edit: SessionEdit, exerciseIndex: number, setId: string): SessionEdit {
  const removed = removeSet(edit, exerciseIndex, setId);
  return { ...removed, exercises: removed.exercises.filter((exercise) => exercise.sets.length > 0) };
}

export function removingSetAsksFirst(original: SessionEdit, setId: string): boolean {
  return original.exercises.some((exercise) => exercise.sets.some((set) => set.id === setId));
}

export function addEditSet(edit: SessionEdit, exerciseIndex: number): SessionEdit {
  return addSetTo(edit, exerciseIndex, {});
}

function emptyExercise(exercise: NewExercise): EditExercise {
  const identity = { exerciseId: exercise.id, name: exercise.name };
  if (exercise.modality === 'cardio') {
    const { paceUnit, tracksDistance } = exercise.activity;
    return { ...identity, modality: 'cardio', paceUnit, tracksDistance, sets: [] };
  }
  if (exercise.measure !== undefined) {
    return { ...identity, modality: 'hold', measure: exercise.measure, loadType: exercise.loadType, sets: [] };
  }
  return { ...identity, modality: 'lift', loadType: exercise.loadType, sets: [] };
}

export function addEditExercise(edit: SessionEdit, exercise: NewExercise): SessionEdit {
  return addEditSet(addExerciseTo(edit, emptyExercise(exercise)), edit.exercises.length);
}

export function swapEditExercise(edit: SessionEdit, exerciseIndex: number, replacement: NewExercise): SessionEdit {
  return updateExerciseAt(edit, exerciseIndex, (exercise) => {
    if (exercise.modality === 'cardio') {
      if (replacement.modality !== 'cardio') return exercise;
      const { paceUnit, tracksDistance } = replacement.activity;
      const sets = tracksDistance ? exercise.sets : exercise.sets.map((bout) => ({ ...bout, distanceM: null }));
      return { ...exercise, exerciseId: replacement.id, name: replacement.name, paceUnit, tracksDistance, sets };
    }
    if (replacement.modality === 'cardio') return exercise;
    const sameKind =
      exercise.modality === 'hold' ? replacement.measure === exercise.measure : replacement.measure === undefined;
    if (!sameKind) return exercise;
    return swapLoadedExercise(exercise, replacement, { keepLoads: replacement.loadType === exercise.loadType });
  });
}

export function withNewSetIds(edit: SessionEdit, setIds: readonly string[]): SessionEdit {
  const conflicting = new Set(setIds.map((id) => id.toLowerCase()));
  const freshId = <S extends { id: string }>(set: S): S =>
    conflicting.has(set.id.toLowerCase()) ? { ...set, id: crypto.randomUUID() } : set;
  return {
    ...edit,
    exercises: edit.exercises.map((exercise) => withSets(exercise, (sets) => sets.map(freshId))),
  };
}

export function withoutBodyweightLoads(edit: SessionEdit, loadTypes: ReadonlyMap<string, LoadType>): SessionEdit {
  return {
    ...edit,
    exercises: edit.exercises.map((exercise) => {
      if (exercise.modality === 'cardio') return exercise;
      return withLoadType(exercise, loadTypes.get(exercise.exerciseId) ?? exercise.loadType);
    }),
  };
}

function placedSets(edit: SessionEdit): PlacedSet[] {
  return edit.exercises.flatMap((exercise): PlacedSet[] => {
    if (exercise.modality === 'cardio') {
      const { sets, ...header } = exercise;
      return sets.map((set) => ({ modality: 'cardio', header, set }));
    }
    if (exercise.modality === 'hold') {
      const { sets, ...header } = exercise;
      return sets.map((set) => ({ modality: 'hold', header, set }));
    }
    const { sets, ...header } = exercise;
    return sets.map((set) => ({ modality: 'lift', header, set }));
  });
}

const LIFT_FIELDS = ['weightKg', 'reps', 'isWarmup', 'effort'] as const;
const BOUT_FIELDS = ['durationS', 'distanceM', 'interval', 'effort'] as const;
const HOLD_FIELDS = ['weightKg', 'durationS', 'distanceM', 'effort'] as const;

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
  if (mine.modality === 'hold' && before.modality === 'hold') {
    return changedFields(mine.set, before.set, HOLD_FIELDS).length > 0;
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
  if (remote.modality === 'hold' && before.modality === 'hold' && mine.modality === 'hold') {
    return header.modality === 'hold'
      ? { modality: 'hold', header, set: mergedFields(remote.set, before.set, mine.set, HOLD_FIELDS) }
      : remote;
  }
  return remote;
}

function exerciseOf(entry: PlacedSet): EditExercise {
  switch (entry.modality) {
    case 'cardio':
      return { ...entry.header, sets: [entry.set] };
    case 'hold':
      return { ...entry.header, sets: [entry.set] };
    case 'lift':
      return { ...entry.header, sets: [entry.set] };
  }
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
      if (current.modality === 'hold' && entry.modality === 'hold') {
        current.sets.push(entry.set);
        continue;
      }
    }
    exercises.push(exerciseOf(entry));
  }
  return exercises;
}

interface RebasedEdit {
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
  if (setCount(rebased.edit) === 0)
    return `${droppedText}No sets are left to save. Undo to keep the latest version, or delete the workout.`;
  if (!hasChanges(rebased.edit, fresh))
    return `${droppedText}Nothing else of yours is left to save; this is the latest version.`;
  return `${droppedText}Your changes were applied to the latest version. Check them, then save.`;
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
  [UNKNOWN_EXERCISE_CODE]: (details) => ({ kind: 'unknown_exercise', exerciseIds: stringList(details, 'exerciseIds') }),
  [BODYWEIGHT_LOAD_NOT_ZERO_CODE]: () => ({ kind: 'fix_bodyweight_load' }),
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

export function failureText(action: FailureAction, verb: 'save' | 'delete'): string {
  switch (action.kind) {
    case 'read_only':
      return 'This workout is older than 7 days, so it can no longer be changed.';
    case 'wrong_account':
      return 'You are signed in as someone else in another tab. Reload the app.';
    case 'retry':
      return `Couldn't reach the server (${action.reason}). Try again.`;
    case 'rate_limited':
      return `Too many changes. ${tryAgainIn(action.retryAfterSeconds)}`;
    case 'revision_conflict':
      return `This workout was changed on another device. Check the latest version, then ${verb} it again if you still want to.`;
    case 'bug':
      return `Couldn't ${verb} this workout: ${action.code}`;
    default:
      return `Couldn't ${verb} this workout: ${action.kind}`;
  }
}

const UNKNOWN_ITEM_NAME = 'an item';

export function removalText(
  drops: readonly { itemId: string; quantity: number }[],
  items: readonly CatalogItem[],
): string {
  const described = describeDrops(drops, itemNameLookup(items, UNKNOWN_ITEM_NAME));
  return described && `This may remove ${described} from your collection.`;
}

export function removedText(
  drops: readonly { itemId: string; revokedQuantity: number }[] | undefined,
  items: readonly CatalogItem[],
): string {
  const described = describeDrops(
    (drops ?? []).map((drop) => ({ itemId: drop.itemId, quantity: drop.revokedQuantity })),
    itemNameLookup(items, UNKNOWN_ITEM_NAME),
  );
  return described && `Removed ${described} from your collection.`;
}

export function sameSetValues(a: LiftSet | BoutSet | HoldSet, b: LiftSet | BoutSet | HoldSet): boolean {
  return JSON.stringify({ ...a, id: '' }) === JSON.stringify({ ...b, id: '' });
}

export function describeHold(set: HoldValues, loadType: LoadType, unit: UnitPref): string {
  const load = loadType === 'bodyweight' ? 'bodyweight' : formatLoad(set.weightKg, loadType, unit);
  const measured = set.durationS !== null ? `${set.durationS} s` : `${set.distanceM ?? 0} m`;
  return `${load} · ${measured}`;
}

export function sameKindOfExercise(
  candidate: Exercise,
  exercise: Pick<EditExercise, 'modality'> & { measure?: HoldMeasure },
): boolean {
  if (candidate.modality === 'cardio') return exercise.modality === 'cardio';
  if (exercise.modality === 'hold') return candidate.measure === exercise.measure;
  return exercise.modality === 'lift' && candidate.measure === undefined;
}
