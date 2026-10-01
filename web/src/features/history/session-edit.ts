import { DEFAULT_BALANCE } from '@domain/balance.ts';
import { isWithinEditWindow } from '@domain/edit-window.ts';
import { effortInputFromStored } from '@domain/effort.ts';
import { roundTo } from '@domain/strength.ts';
import {
  type CardioEffortLevel,
  type DropSummary,
  type EffortInput,
  type EffortLevel,
  MAX_SETS_PER_SESSION,
  type SessionSummary,
} from '@domain/types.ts';
import type { LoadType } from '../../lib/catalog.ts';
import type { InvokeOutcome } from '../../lib/function-client.ts';
import {
  type EditSessionPayload,
  type HistorySession,
  type StoredSetRow,
  transientReason,
} from '../../lib/history-rules.ts';
import { RATE_LIMITED_CODE, retryAfterSeconds } from '../../lib/rate-limit.ts';
import { defaultWeightKg, nextSetValues, updateExerciseAt } from '../../offline/draft-format.ts';

export interface KnownExercise {
  name: string;
  loadType: LoadType;
}

export interface EditSet {
  id: string;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  effort: EffortInput;
}

export interface EditExercise {
  exerciseId: string;
  name: string;
  loadType: LoadType;
  sets: EditSet[];
}

export interface SessionEdit {
  sessionId: string;
  revision: number;
  notes: string;
  exercises: EditExercise[];
}

const UNKNOWN_EXERCISE: KnownExercise = { name: 'Unknown exercise', loadType: 'external' };

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

export function editFromSession(
  session: Pick<HistorySession, 'id' | 'revision' | 'notes'>,
  rows: readonly StoredSetRow[],
  exercisesById: ReadonlyMap<string, KnownExercise>,
): SessionEdit {
  const placed = [...rows]
    .sort((a, b) => a.position - b.position)
    .map((row): PlacedSet => {
      const known = exercisesById.get(row.exerciseId) ?? UNKNOWN_EXERCISE;
      return {
        exerciseId: row.exerciseId,
        name: known.name,
        loadType: known.loadType,
        set: {
          id: row.id,
          weightKg: roundTo(2, row.weightKg),
          reps: row.reps,
          isWarmup: row.isWarmup,
          effort: effortInputFromStored(row.effortInputType, row.effortValue, DEFAULT_BALANCE),
        },
      };
    });
  const exercises = grouped(placed);
  return { sessionId: session.id, revision: session.revision, notes: session.notes ?? '', exercises };
}

export function editPayload(edit: SessionEdit): EditSessionPayload {
  const notes = edit.notes.trim() === '' ? null : edit.notes;
  const sets = edit.exercises
    .flatMap((exercise) => exercise.sets.map((set) => ({ exercise, set })))
    .map(({ exercise, set }, position) => ({
      id: set.id,
      exerciseId: exercise.exerciseId,
      position,
      weightKg: roundTo(2, set.weightKg),
      reps: set.reps,
      isWarmup: set.isWarmup,
      effort: set.effort,
    }));
  return { sessionId: edit.sessionId, ifRevision: edit.revision, notes, sets };
}

export function hasChanges(edit: SessionEdit, original: SessionEdit): boolean {
  const comparable = (candidate: SessionEdit) => JSON.stringify({ ...editPayload(candidate), ifRevision: 0 });
  return comparable(edit) !== comparable(original);
}

function setsById(edit: SessionEdit): Map<string, string> {
  return new Map(
    edit.exercises.flatMap((exercise) =>
      exercise.sets.map((set) => [set.id, JSON.stringify({ exerciseId: exercise.exerciseId, ...set })] as const),
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
  return updateExercise(edit, exerciseIndex, (exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...changes } : set)),
  }));
}

export function removeEditSet(edit: SessionEdit, exerciseIndex: number, setId: string): SessionEdit {
  const removed = updateExercise(edit, exerciseIndex, (exercise) => ({
    ...exercise,
    sets: exercise.sets.filter((set) => set.id !== setId),
  }));
  return { ...removed, exercises: removed.exercises.filter((exercise) => exercise.sets.length > 0) };
}

export function addEditSet(edit: SessionEdit, exerciseIndex: number): SessionEdit {
  if (!canAddSet(edit)) return edit;
  return updateExercise(edit, exerciseIndex, (exercise) => {
    const newSet: EditSet = {
      id: crypto.randomUUID(),
      ...nextSetValues(exercise.sets.at(-1), exercise.loadType),
      isWarmup: false,
      effort: null,
    };
    return { ...exercise, sets: [...exercise.sets, newSet] };
  });
}

export function addEditExercise(
  edit: SessionEdit,
  exercise: { id: string; name: string; loadType: LoadType },
): SessionEdit {
  if (!canAddSet(edit)) return edit;
  const added: EditExercise = { exerciseId: exercise.id, name: exercise.name, loadType: exercise.loadType, sets: [] };
  return addEditSet({ ...edit, exercises: [...edit.exercises, added] }, edit.exercises.length);
}

export function swapEditExercise(
  edit: SessionEdit,
  exerciseIndex: number,
  replacement: { id: string; name: string; loadType: LoadType },
): SessionEdit {
  return updateExercise(edit, exerciseIndex, (exercise) => ({
    exerciseId: replacement.id,
    name: replacement.name,
    loadType: replacement.loadType,
    sets:
      replacement.loadType === exercise.loadType
        ? exercise.sets
        : exercise.sets.map((set) => ({ ...set, weightKg: defaultWeightKg(replacement.loadType) })),
  }));
}

export function withNewSetIds(edit: SessionEdit, setIds: readonly string[]): SessionEdit {
  const conflicting = new Set(setIds.map((id) => id.toLowerCase()));
  return {
    ...edit,
    exercises: edit.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) =>
        conflicting.has(set.id.toLowerCase()) ? { ...set, id: crypto.randomUUID() } : set,
      ),
    })),
  };
}

export function withoutBodyweightLoads(edit: SessionEdit, loadTypes: ReadonlyMap<string, LoadType>): SessionEdit {
  return {
    ...edit,
    exercises: edit.exercises.map((exercise) => {
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

interface PlacedSet {
  exerciseId: string;
  name: string;
  loadType: LoadType;
  set: EditSet;
}

function placedSets(edit: SessionEdit): PlacedSet[] {
  return edit.exercises.flatMap((exercise) =>
    exercise.sets.map((set) => ({
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      loadType: exercise.loadType,
      set,
    })),
  );
}

const SET_FIELDS = ['weightKg', 'reps', 'isWarmup', 'effort'] as const;

function comparableField(set: EditSet, field: (typeof SET_FIELDS)[number]): string {
  return JSON.stringify(field === 'weightKg' ? roundTo(2, set.weightKg) : set[field]);
}

function changedFields(mine: PlacedSet, before: PlacedSet): (typeof SET_FIELDS)[number][] {
  return SET_FIELDS.filter((field) => comparableField(mine.set, field) !== comparableField(before.set, field));
}

function isChangedHere(mine: PlacedSet, before: PlacedSet): boolean {
  return mine.exerciseId !== before.exerciseId || changedFields(mine, before).length > 0;
}

function mergedSet(remote: PlacedSet, before: PlacedSet, mine: PlacedSet): PlacedSet {
  const set = { ...remote.set };
  for (const field of changedFields(mine, before)) Object.assign(set, { [field]: mine.set[field] });
  const exercise = mine.exerciseId === before.exerciseId ? remote : mine;
  return { exerciseId: exercise.exerciseId, name: exercise.name, loadType: exercise.loadType, set };
}

function grouped(placed: readonly PlacedSet[]): EditExercise[] {
  const exercises: EditExercise[] = [];
  for (const { exerciseId, name, loadType, set } of placed) {
    const current = exercises.at(-1);
    if (current?.exerciseId === exerciseId) current.sets.push(set);
    else exercises.push({ exerciseId, name, loadType, sets: [set] });
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
