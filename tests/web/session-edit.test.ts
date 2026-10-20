import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '../../supabase/functions/_shared/domain/balance.ts';
import { isSessionEditable } from '@domain/edit-window.ts';
import { MAX_SETS_PER_SESSION } from '../../supabase/functions/_shared/domain/types.ts';
import {
  addEditExercise,
  addEditSet,
  dropsAtRisk,
  editFromSession,
  editPayload,
  failureAction,
  failureText,
  hasChanges,
  type KnownExercise,
  type LiftEditExercise,
  rebaseEdit,
  rebaseNotice,
  removalText,
  savedEdit,
  summariesToForget,
  removedText,
  removeEditSet,
  removingSetAsksFirst,
  sameSetValues,
  type SessionEdit,
  swapEditExercise,
  describeHold,
  sameKindOfExercise,
  withNewSetIds,
  withoutBodyweightLoads,
} from '../../web/src/features/history/session-edit.ts';
import {
  type EditSessionPayload,
  isUuid,
  type LiftSetPayload,
  nextPageFilter,
  type StoredSetRow,
  transientReason,
} from '../../web/src/lib/history/history-rules.ts';
import { boutModeChanges } from '../../web/src/lib/workout/cardio-rules.ts';
import {
  type BoutSet,
  canAddSet,
  updateBout,
  updateHoldSet,
  updateSet,
} from '../../web/src/lib/workout/exercise-edit-rules.ts';
import type { CatalogItem } from '../../web/src/lib/collection/item-rules.ts';

const benchId = 'aaaaaaaa-0000-4000-8000-000000000001';
const pullUpId = 'aaaaaaaa-0000-4000-8000-000000000002';
const session = { id: 'bbbbbbbb-0000-4000-8000-000000000001', revision: 3, notes: 'felt strong' };
const exercisesById = new Map([
  [benchId, { name: 'Barbell Bench Press', loadType: 'external' as const }],
  [pullUpId, { name: 'Pull-up', loadType: 'bodyweight' as const }],
]);

function liftSets(payload: EditSessionPayload): LiftSetPayload[] {
  return payload.sets.filter((set): set is LiftSetPayload => !('kind' in set));
}

function lifts(edit: SessionEdit): LiftEditExercise[] {
  return edit.exercises.filter((exercise): exercise is LiftEditExercise => exercise.modality === 'lift');
}

function row(overrides: Partial<StoredSetRow> & Pick<StoredSetRow, 'id' | 'exerciseId' | 'position'>): StoredSetRow {
  return {
    weightKg: 60,
    effectiveLoadKg: 60,
    reps: 5,
    isWarmup: false,
    effortInputType: null,
    effortValue: null,
    rir: 2,
    rirSource: 'estimated',
    rirFlagged: false,
    e1rmBeforeKg: null,
    effectiveReps: 3,
    xpAwarded: 100,
    durationS: null,
    distanceM: null,
    intervalWorkS: null,
    intervalRestS: null,
    intervalRounds: null,
    countedWorkS: null,
    paceFlagged: false,
    ...overrides,
  };
}

const rows: StoredSetRow[] = [
  row({ id: 'set-2', exerciseId: pullUpId, position: 2, weightKg: 0, effortInputType: 'rpe', effortValue: 8.5 }),
  row({
    id: 'set-0',
    exerciseId: benchId,
    position: 0,
    weightKg: 61.234,
    isWarmup: true,
    effortInputType: 'level',
    effortValue: DEFAULT_BALANCE.effortLevelRir.hard,
  }),
  row({ id: 'set-1', exerciseId: benchId, position: 1, effortInputType: 'rir', effortValue: 2 }),
  row({ id: 'set-3', exerciseId: benchId, position: 3 }),
];

describe('building the edit from loaded rows', () => {
  const edit = editFromSession(session, rows, exercisesById);

  it('groups consecutive rows by exercise in position order and maps the stored effort back', () => {
    expect(edit.exercises.map((exercise) => [exercise.name, exercise.sets.map((set) => set.id)])).toEqual([
      ['Barbell Bench Press', ['set-0', 'set-1']],
      ['Pull-up', ['set-2']],
      ['Barbell Bench Press', ['set-3']],
    ]);
    expect(edit.exercises[0].sets[0]).toEqual({
      id: 'set-0',
      weightKg: 61.23,
      reps: 5,
      isWarmup: true,
      effort: { type: 'level', level: 'hard' },
    });
    expect(edit.exercises[0].sets[1].effort).toEqual({ type: 'rir', value: 2 });
    expect(edit.exercises[1].sets[0].effort).toEqual({ type: 'rpe', value: 8.5 });
    expect(edit.exercises[2].sets[0].effort).toBeNull();
  });

  it('sends the whole session with exactly the keys edit-session accepts', () => {
    const payload = editPayload(edit);
    expect(Object.keys(payload).sort()).toEqual(['ifRevision', 'notes', 'sessionId', 'sets']);
    expect(payload).toMatchObject({ sessionId: session.id, ifRevision: 3, notes: 'felt strong' });
    for (const set of payload.sets)
      expect(Object.keys(set).sort()).toEqual([
        'effort',
        'exerciseId',
        'id',
        'isWarmup',
        'position',
        'reps',
        'weightKg',
      ]);
    expect(liftSets(payload).map((set) => [set.id, set.exerciseId, set.position, set.weightKg])).toEqual([
      ['set-0', benchId, 0, 61.23],
      ['set-1', benchId, 1, 60],
      ['set-2', pullUpId, 2, 0],
      ['set-3', benchId, 3, 60],
    ]);
  });

  it('sends blank notes as null and rounds weights to 2 dp', () => {
    const changed = updateSet({ ...edit, notes: '   ' }, 0, 'set-1', { weightKg: 72.4567 });
    const payload = editPayload(changed);
    expect(payload.notes).toBeNull();
    expect(liftSets(payload)[1].weightKg).toBe(72.46);
    expect(hasChanges(changed, edit)).toBe(true);
  });

  it('sees no change when nothing but the revision differs', () => {
    expect(hasChanges({ ...edit, revision: 9 }, edit)).toBe(false);
    expect(hasChanges(updateSet(edit, 0, 'set-1', { weightKg: 60.001 }), edit)).toBe(false);
  });

  it('adds sets with fresh ids, drops removed sets and renumbers positions', () => {
    const added = addEditSet(edit, 1);
    const newSet = added.exercises[1].sets[1];
    expect(newSet.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(newSet).toMatchObject({ weightKg: 0, reps: 5, isWarmup: false, effort: null });

    const removed = removeEditSet(added, 0, 'set-0');
    const payload = editPayload(removed);
    expect(payload.sets.map((set) => set.id)).toEqual(['set-1', 'set-2', newSet.id, 'set-3']);
    expect(payload.sets.map((set) => set.position)).toEqual([0, 1, 2, 3]);
  });

  it('asks before removing a saved set, but removes a set added in this edit straight away', () => {
    const added = addEditSet(edit, 1);
    expect(removingSetAsksFirst(edit, 'set-2')).toBe(true);
    expect(removingSetAsksFirst(edit, added.exercises[1].sets[1].id)).toBe(false);
  });

  it('drops an exercise once its last set is removed', () => {
    const removed = removeEditSet(edit, 1, 'set-2');
    expect(removed.exercises.map((exercise) => exercise.name)).toEqual(['Barbell Bench Press', 'Barbell Bench Press']);
  });

  it('adds an exercise with one starting set', () => {
    const added = addEditExercise(edit, { id: pullUpId, name: 'Pull-up', loadType: 'bodyweight' });
    expect(added.exercises.at(-1)).toMatchObject({ exerciseId: pullUpId, sets: [{ weightKg: 0, reps: 8 }] });
  });

  it('gives only the conflicting sets new ids', () => {
    const reIded = withNewSetIds(edit, ['SET-1']);
    const ids = editPayload(reIded).sets.map((set) => set.id);
    expect(ids[0]).toBe('set-0');
    expect(ids[1]).not.toBe('set-1');
    expect(ids.slice(2)).toEqual(['set-2', 'set-3']);
  });

  it('zeroes the load of exercises that are now bodyweight-only', () => {
    const fixed = withoutBodyweightLoads(edit, new Map([[benchId, 'bodyweight' as const]]));
    expect(liftSets(editPayload(fixed)).map((set) => set.weightKg)).toEqual([0, 0, 0, 0]);
  });
});

describe('editability and paging', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');

  it('allows edits within 7 days of the start and never for history-only sessions', () => {
    expect(isSessionEditable({ historyOnly: false, startedAt: '2026-09-23T12:00:00Z' }, now)).toBe(true);
    expect(isSessionEditable({ historyOnly: false, startedAt: '2026-09-23T11:59:59Z' }, now)).toBe(false);
    expect(isSessionEditable({ historyOnly: true, startedAt: '2026-09-30T10:00:00Z' }, now)).toBe(false);
  });

  it('recognises session ids before querying', () => {
    expect(isUuid('bbbbbbbb-0000-4000-8000-000000000001')).toBe(true);
    expect(isUuid('BBBBBBBB-0000-4000-8000-000000000001')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
  });

  it('builds the keyset filter for the next page', () => {
    expect(nextPageFilter({ startedAt: '2026-09-30T15:37:36.26+00:00', id: 'abc' })).toBe(
      'started_at.lt."2026-09-30T15:37:36.26+00:00",and(started_at.eq."2026-09-30T15:37:36.26+00:00",id.lt.abc)',
    );
  });
});

describe('mapping failures to client actions', () => {
  const http = (status: number, code: string, details?: unknown) =>
    failureAction({ kind: 'http_error', status, code, details });

  it('follows the contract table', () => {
    expect(http(400, 'invalid_json')).toEqual({ kind: 'bug', code: 'invalid_json' });
    expect(http(422, 'invalid_payload')).toEqual({ kind: 'bug', code: 'invalid_payload' });
    expect(http(422, 'duplicate_set_id')).toEqual({ kind: 'bug', code: 'duplicate_set_id' });
    expect(http(422, 'duplicate_set_position')).toEqual({ kind: 'bug', code: 'duplicate_set_position' });
    expect(http(405, 'method_not_allowed')).toEqual({ kind: 'bug', code: 'method_not_allowed' });
    expect(http(403, 'profile_missing')).toEqual({ kind: 'sign_out' });
    expect(http(404, 'session_not_found')).toEqual({ kind: 'gone' });
    expect(http(409, 'edit_window_closed')).toEqual({ kind: 'read_only' });
    expect(http(409, 'revision_conflict', { revision: 4 })).toEqual({ kind: 'revision_conflict' });
    expect(http(409, 'set_id_conflict', { setIds: ['a', 'b'] })).toEqual({ kind: 'reid_sets', setIds: ['a', 'b'] });
    expect(http(409, 'bodyweight_required')).toEqual({ kind: 'ask_bodyweight' });
    expect(http(422, 'unknown_exercise', { exerciseIds: ['x'] })).toEqual({
      kind: 'unknown_exercise',
      exerciseIds: ['x'],
    });
    expect(http(422, 'bodyweight_load_not_zero')).toEqual({ kind: 'fix_bodyweight_load' });
  });

  it('classifies only transient failures as retryable', () => {
    expect(transientReason({ kind: 'http_error', status: 503, code: 'rebuild_required', details: undefined })).toBe(
      'rebuild_required',
    );
    expect(transientReason({ kind: 'http_error', status: 409, code: 'id_conflict', details: undefined })).toBe(
      'id_conflict',
    );
    expect(transientReason({ kind: 'http_error', status: 409, code: 'revision_conflict', details: undefined })).toBe(
      null,
    );
    expect(transientReason({ kind: 'retryable', reason: 'timeout' })).toBe('timeout');
    expect(transientReason({ kind: 'ok', data: {} })).toBe(null);
    expect(transientReason({ kind: 'needs_sign_in' })).toBe(null);
  });

  it('retries transient failures', () => {
    expect(http(503, 'rebuild_required')).toEqual({ kind: 'retry', reason: 'rebuild_required' });
    expect(http(500, 'internal_error')).toEqual({ kind: 'retry', reason: 'internal_error' });
    expect(http(502, 'http_502')).toEqual({ kind: 'retry', reason: 'http_502' });
    expect(http(409, 'id_conflict')).toEqual({ kind: 'retry', reason: 'id_conflict' });
    expect(failureAction({ kind: 'retryable', reason: 'offline' })).toEqual({ kind: 'retry', reason: 'offline' });
  });

  it('keeps the edit and waits on a rate limit instead of retrying', () => {
    const details = { bucket: 'session_edit_hour', retryAfterSeconds: 150 };
    expect(transientReason({ kind: 'http_error', status: 429, code: 'rate_limited', details })).toBe(null);
    expect(http(429, 'rate_limited', details)).toEqual({ kind: 'rate_limited', retryAfterSeconds: 150 });
    expect(http(429, 'rate_limited')).toEqual({ kind: 'rate_limited', retryAfterSeconds: null });
  });

  it('maps auth problems', () => {
    expect(failureAction({ kind: 'needs_sign_in' })).toEqual({ kind: 'sign_out' });
    expect(failureAction({ kind: 'wrong_account' })).toEqual({ kind: 'wrong_account' });
  });

  it('tolerates missing details', () => {
    expect(http(409, 'set_id_conflict')).toEqual({ kind: 'reid_sets', setIds: [] });
  });
});

describe('the set cap', () => {
  it('stops adding sets and exercises at the maximum per session', () => {
    const full: SessionEdit = {
      sessionId: session.id,
      revision: 0,
      notes: '',
      exercises: [
        {
          exerciseId: benchId,
          name: 'Barbell Bench Press',
          modality: 'lift',
          loadType: 'external',
          sets: Array.from({ length: MAX_SETS_PER_SESSION }, (_, index) => ({
            id: `set-${index}`,
            weightKg: 60,
            reps: 5,
            isWarmup: false,
            effort: null,
          })),
        },
      ],
    };
    expect(canAddSet(full)).toBe(false);
    expect(addEditSet(full, 0)).toBe(full);
    expect(addEditExercise(full, { id: pullUpId, name: 'Pull-up', loadType: 'bodyweight' })).toBe(full);
    expect(canAddSet(removeEditSet(full, 0, 'set-0'))).toBe(true);
  });
});

describe('rebasing local changes onto a newer server copy', () => {
  const original = editFromSession(session, rows, exercisesById);
  const ids = (edit: SessionEdit) => editPayload(edit).sets.map((set) => set.id);

  it('keeps the other device’s added, removed and changed sets and notes when nothing was changed here', () => {
    const remote = updateSet(removeEditSet(addEditSet(original, 1), 0, 'set-1'), 2, 'set-3', { reps: 12 });
    const fresh = { ...remote, revision: 4, notes: 'from the other phone' };
    const rebased = rebaseEdit(original, original, fresh).edit;
    expect(rebased).toEqual(fresh);
  });

  it('applies only what changed here on top of the newer copy', () => {
    const remoteAdded = addEditSet(original, 1);
    const remoteNewId = remoteAdded.exercises[1].sets[1].id;
    const fresh = {
      ...updateSet(removeEditSet(remoteAdded, 0, 'set-0'), 1, 'set-2', { reps: 15 }),
      revision: 4,
      notes: 'remote notes',
    };

    const localAdded = addEditSet(original, 0);
    const localNewId = localAdded.exercises[0].sets[2].id;
    const local = removeEditSet(updateSet(localAdded, 0, 'set-1', { reps: 9 }), 2, 'set-3');

    const rebased = rebaseEdit(local, original, fresh).edit;
    expect(rebased.revision).toBe(4);
    expect(rebased.notes).toBe('remote notes');
    expect(ids(rebased)).toEqual(['set-1', localNewId, 'set-2', remoteNewId]);
    const sets = liftSets(editPayload(rebased));
    expect(sets.find((set) => set.id === 'set-1')?.reps).toBe(9);
    expect(sets.find((set) => set.id === 'set-2')?.reps).toBe(15);
    expect(rebased.exercises.map((exercise) => exercise.exerciseId)).toEqual([benchId, pullUpId]);
  });

  it('merges a set changed on both sides field by field, local fields winning', () => {
    const fresh = { ...updateSet(original, 0, 'set-1', { reps: 7, weightKg: 65 }), revision: 4 };
    const local = updateSet(original, 0, 'set-1', { weightKg: 70, effort: { type: 'level', level: 'failure' } });
    const set = rebaseEdit(local, original, fresh).edit.exercises[0].sets[1];
    expect(set).toEqual({
      id: 'set-1',
      weightKg: 70,
      reps: 7,
      isWarmup: false,
      effort: { type: 'level', level: 'failure' },
    });
  });

  it('does not bring back a set the other device removed, and reports it when it was changed here', () => {
    const fresh = { ...removeEditSet(removeEditSet(original, 0, 'set-1'), 0, 'set-0'), revision: 4 };
    const local = updateSet(original, 0, 'set-1', { reps: 11 });
    const rebased = rebaseEdit(local, original, fresh);
    expect(ids(rebased.edit)).toEqual(['set-2', 'set-3']);
    expect(rebased.droppedSetIds).toEqual(['set-1']);
    expect(rebaseNotice(rebased, fresh)).toBe(
      '1 set you changed was deleted on the other device. Nothing else of yours is left to save; this is the latest version.',
    );
  });

  it('does not count a set as dropped when it was not changed here', () => {
    const fresh = { ...removeEditSet(original, 0, 'set-1'), revision: 4 };
    const local = updateSet(original, 2, 'set-3', { reps: 11 });
    const rebased = rebaseEdit(local, original, fresh);
    expect(rebased.droppedSetIds).toEqual([]);
    expect(rebaseNotice(rebased, fresh)).toBe(
      'Your changes were applied to the latest version. Check them, then save.',
    );
  });

  it('points to undo or delete when no sets are left after the rebase', () => {
    const onlySet: SessionEdit = {
      ...original,
      exercises: [{ ...lifts(original)[0], sets: [lifts(original)[0].sets[0]] }],
    };
    const freshWithoutNew: SessionEdit = { ...onlySet, revision: 4, exercises: [] };
    const local = updateSet(onlySet, 0, 'set-0', { reps: 12 });
    const rebased = rebaseEdit(local, onlySet, freshWithoutNew);
    expect(rebased.edit.exercises).toEqual([]);
    expect(rebased.droppedSetIds).toEqual(['set-0']);
    expect(rebaseNotice(rebased, freshWithoutNew)).toBe(
      '1 set you changed was deleted on the other device. No sets are left to save. Undo to keep the latest version, or delete the workout.',
    );
  });

  it('ignores a weight re-typed to the same stored value, so the other device keeps its change', () => {
    const fresh = { ...updateSet(original, 0, 'set-1', { weightKg: 65 }), revision: 4 };
    const local = updateSet(original, 0, 'set-1', { weightKg: 60.0012 });
    const rebased = rebaseEdit(local, original, fresh);
    expect(lifts(rebased.edit)[0].sets[1].weightKg).toBe(65);
    expect(rebased.droppedSetIds).toEqual([]);
  });

  it('takes the local notes only when they were changed here', () => {
    const fresh = { ...original, revision: 4, notes: 'remote' };
    expect(rebaseEdit({ ...original, notes: 'mine' }, original, fresh).edit.notes).toBe('mine');
    expect(rebaseEdit(original, original, fresh).edit.notes).toBe('remote');
  });

  it('puts a set added at the very start back at the start', () => {
    const local = {
      ...original,
      exercises: [
        {
          ...lifts(original)[0],
          sets: [{ id: 'new-first', weightKg: 40, reps: 10, isWarmup: true, effort: null }, ...lifts(original)[0].sets],
        },
        ...original.exercises.slice(1),
      ],
    };
    const fresh = { ...original, revision: 4 };
    expect(ids(rebaseEdit(local, original, fresh).edit)).toEqual(['new-first', 'set-0', 'set-1', 'set-2', 'set-3']);
  });
});

describe('after the server accepts an edit', () => {
  const original = editFromSession(session, rows, exercisesById);
  const sent = updateSet(original, 2, 'set-3', { reps: 9 });

  it('treats the sent sets as the new original at the new revision, so undo keeps what was saved', () => {
    const saved = savedEdit(sent, 4);
    expect(hasChanges(sent, saved)).toBe(false);
    expect(editPayload(saved).ifRevision).toBe(4);
    expect(liftSets(editPayload(saved)).find((set) => set.id === 'set-3')?.reps).toBe(9);
  });

  it('forgets the edited and replayed sessions after a first-try reply', () => {
    expect(summariesToForget(session.id, ['later-1'], false, 'later-2')).toEqual([session.id, 'later-1']);
  });

  it('also forgets any remembered summary after a retried reply, which may be the no-op answer to a lost write', () => {
    expect(summariesToForget(session.id, [], true, 'later-2')).toEqual([session.id, 'later-2']);
    expect(summariesToForget(session.id, [], true, undefined)).toEqual([session.id]);
  });
});

describe('drops put at risk by an edit', () => {
  const original = editFromSession(session, rows, exercisesById);
  const drops = [{ setId: 'set-1' }, { setId: 'set-2' }, { setId: 'set-3' }, { setId: 'not-in-session' }];

  it('lists nothing for an unchanged edit or a notes-only change', () => {
    expect(dropsAtRisk(original, original, drops)).toEqual([]);
    expect(dropsAtRisk({ ...original, notes: 'changed' }, original, drops)).toEqual([]);
  });

  it('lists the drops of removed sets', () => {
    expect(dropsAtRisk(removeEditSet(original, 0, 'set-1'), original, drops)).toEqual([{ setId: 'set-1' }]);
  });

  it('lists the drops of sets whose load, reps, effort or warm-up flag changed', () => {
    for (const changes of [
      { weightKg: 70 },
      { reps: 9 },
      { isWarmup: true },
      { effort: { type: 'level' as const, level: 'easy' as const } },
    ]) {
      expect(dropsAtRisk(updateSet(original, 2, 'set-3', changes), original, drops)).toEqual([{ setId: 'set-3' }]);
    }
  });

  it('lists the drops of sets moved to another exercise', () => {
    const swapped = swapEditExercise(original, 1, { id: benchId, name: 'Barbell Bench Press', loadType: 'external' });
    expect(dropsAtRisk(swapped, original, drops)).toEqual([{ setId: 'set-2' }]);
  });
});

describe('cardio bouts in an edit', () => {
  const runId = 'aaaaaaaa-0000-4000-8000-000000000003';
  const poolId = 'aaaaaaaa-0000-4000-8000-000000000004';
  const activity = (paceUnit: 'per_km' | 'per_100m') => ({
    paceUnit,
    referencePaceSPerKm: null,
    maxEffort: 'max' as const,
    tracksDistance: true,
    shares: [],
  });
  const known = new Map<string, KnownExercise>([
    ...exercisesById,
    [runId, { name: 'Running', modality: 'cardio' as const, activity: activity('per_km') }],
    [poolId, { name: 'Swimming', modality: 'cardio' as const, activity: activity('per_100m') }],
  ]);

  function bout(overrides: Partial<StoredSetRow> & Pick<StoredSetRow, 'id' | 'exerciseId' | 'position'>) {
    return row({
      weightKg: null,
      effectiveLoadKg: null,
      reps: null,
      rir: null,
      rirSource: 'default',
      effectiveReps: 0,
      durationS: 1800,
      countedWorkS: 1800,
      ...overrides,
    });
  }

  const cardioRows: StoredSetRow[] = [
    bout({
      id: 'bout-0',
      exerciseId: runId,
      position: 0,
      distanceM: 5000,
      effortInputType: 'cardio',
      effortValue: 3,
      rirSource: 'logged',
    }),
    bout({
      id: 'bout-1',
      exerciseId: runId,
      position: 1,
      durationS: 570,
      countedWorkS: 300,
      intervalWorkS: 30,
      intervalRestS: 30,
      intervalRounds: 10,
    }),
    row({ id: 'set-2', exerciseId: benchId, position: 2 }),
    bout({ id: 'bout-3', exerciseId: 'aaaaaaaa-0000-4000-8000-00000000dead', position: 3 }),
  ];
  const edit = editFromSession(session, cardioRows, known);

  it('removes a bout and gives only conflicting bouts new ids', () => {
    const removed = removeEditSet(edit, 0, 'bout-0');
    expect(removed.exercises[0].sets.map((set) => set.id)).toEqual(['bout-1']);
    const reIded = withNewSetIds(edit, ['BOUT-1']);
    const ids = editPayload(reIded).sets.map((set) => set.id);
    expect(ids[0]).toBe('bout-0');
    expect(ids[1]).not.toBe('bout-1');
    expect(ids.slice(2)).toEqual(['set-2', 'bout-3']);
    expect(reIded.exercises[0].modality).toBe('cardio');
  });

  it('turns cardio rows into bouts on a cardio exercise', () => {
    expect(edit.exercises.map((exercise) => [exercise.name, exercise.modality])).toEqual([
      ['Running', 'cardio'],
      ['Barbell Bench Press', 'lift'],
      ['Unknown exercise', 'cardio'],
    ]);
    expect(edit.exercises[0]).toMatchObject({ paceUnit: 'per_km' });
    expect(edit.exercises[0].sets).toEqual([
      {
        id: 'bout-0',
        kind: 'cardio',
        durationS: 1800,
        distanceM: 5000,
        interval: null,
        effort: { type: 'cardio', level: 'hard' },
      },
      {
        id: 'bout-1',
        kind: 'cardio',
        durationS: 570,
        distanceM: null,
        interval: { workS: 30, restS: 30, rounds: 10 },
        effort: null,
      },
    ]);
  });

  it('sends bouts with the keys edit-session accepts and no duration for intervals', () => {
    const [steady, intervals, lift, unknown] = editPayload(edit).sets;
    expect(Object.keys(steady).sort()).toEqual(
      ['distanceM', 'durationS', 'effort', 'exerciseId', 'id', 'interval', 'kind', 'position'].sort(),
    );
    expect(intervals).toEqual({
      kind: 'cardio',
      id: 'bout-1',
      exerciseId: runId,
      position: 1,
      distanceM: null,
      interval: { workS: 30, restS: 30, rounds: 10 },
      effort: null,
    });
    expect(lift).toMatchObject({ id: 'set-2', position: 2, weightKg: 60, reps: 5 });
    expect(unknown).toMatchObject({ kind: 'cardio', id: 'bout-3', position: 3, durationS: 1800 });
  });

  it('sees a changed distance as a change that puts the bout’s drops at risk', () => {
    const changed = updateBout(edit, 0, 'bout-0', { distanceM: 6000 });
    expect(editPayload(changed).sets[0]).toMatchObject({ distanceM: 6000 });
    expect(hasChanges(changed, edit)).toBe(true);
    expect(dropsAtRisk(changed, edit, [{ setId: 'bout-0' }, { setId: 'bout-1' }])).toEqual([{ setId: 'bout-0' }]);
  });

  it('leaves lift sets alone when a bout changes, and bouts alone when a lift changes', () => {
    expect(updateBout(edit, 1, 'set-2', { distanceM: 6000 })).toEqual(edit);
    expect(updateSet(edit, 0, 'bout-0', { reps: 9 })).toEqual(edit);
  });

  it('copies the previous bout when adding one', () => {
    const added = addEditSet(edit, 0);
    const copy = added.exercises[0].sets[2];
    expect(copy).toEqual({ ...edit.exercises[0].sets[1], id: expect.any(String) });
    expect(copy.id).not.toBe('bout-1');
  });

  it('adds a cardio exercise with one steady 30-minute bout', () => {
    const added = addEditExercise(edit, {
      id: poolId,
      name: 'Swimming',
      modality: 'cardio',
      activity: activity('per_100m'),
    });
    expect(added.exercises.at(-1)).toEqual({
      exerciseId: poolId,
      name: 'Swimming',
      modality: 'cardio',
      paceUnit: 'per_100m',
      tracksDistance: true,
      sets: [
        { id: expect.any(String), kind: 'cardio', durationS: 1800, distanceM: null, interval: null, effort: null },
      ],
    });
  });

  it('adds no bout and no cardio exercise once the bouts add up to 4 hours, but still adds a lift', () => {
    const fourHours = updateBout(edit, 0, 'bout-0', { durationS: 14_400 });
    expect(addEditSet(fourHours, 0)).toBe(fourHours);
    const swimming = { id: poolId, name: 'Swimming', modality: 'cardio' as const, activity: activity('per_100m') };
    expect(addEditExercise(fourHours, swimming)).toBe(fourHours);
    const withLift = addEditExercise(fourHours, { id: pullUpId, name: 'Pull-up', loadType: 'bodyweight' });
    expect(withLift.exercises.at(-1)?.sets).toHaveLength(1);
  });

  it('replaces an unknown cardio exercise with another cardio exercise, keeping the bouts', () => {
    const swapped = swapEditExercise(edit, 2, {
      id: poolId,
      name: 'Swimming',
      modality: 'cardio',
      activity: activity('per_100m'),
    });
    expect(swapped.exercises[2]).toMatchObject({ exerciseId: poolId, name: 'Swimming', paceUnit: 'per_100m' });
    expect(swapped.exercises[2].sets).toEqual(edit.exercises[2].sets);
  });

  it('drops the distances when the bouts move to an activity that tracks none', () => {
    const swapped = swapEditExercise(edit, 0, {
      id: 'yoga-id',
      name: 'Yoga',
      modality: 'cardio',
      activity: { ...activity('per_km'), tracksDistance: false },
    });
    expect(swapped.exercises[0]).toMatchObject({ exerciseId: 'yoga-id', tracksDistance: false });
    expect(swapped.exercises[0].sets.map((set) => 'distanceM' in set && set.distanceM)).toEqual([null, null]);
    expect(edit.exercises[0]).toMatchObject({ tracksDistance: true });
  });

  it('refuses to replace an exercise with one of the other kind', () => {
    expect(swapEditExercise(edit, 2, { id: benchId, name: 'Barbell Bench Press', loadType: 'external' })).toEqual(edit);
    expect(
      swapEditExercise(edit, 1, { id: runId, name: 'Running', modality: 'cardio', activity: activity('per_km') }),
    ).toEqual(edit);
  });

  it('sends a steady duration the server accepts after a short stored interval is switched to steady', () => {
    const sprintRows = [
      bout({
        id: 'bout-s',
        exerciseId: runId,
        position: 0,
        durationS: 30,
        intervalWorkS: 30,
        intervalRestS: 0,
        intervalRounds: 1,
      }),
    ];
    const stored = editFromSession(session, sprintRows, known);
    const steady = updateBout(stored, 0, 'bout-s', boutModeChanges(stored.exercises[0].sets[0] as BoutSet, 'steady'));
    expect(editPayload(steady).sets[0]).toMatchObject({ kind: 'cardio', durationS: 60, interval: null });
  });

  it('leaves bouts alone when zeroing bodyweight loads', () => {
    expect(withoutBodyweightLoads(edit, new Map([[runId, 'bodyweight']])).exercises[0]).toEqual(edit.exercises[0]);
  });

  it('merges a bout changed on both sides field by field, local fields winning', () => {
    const fresh = {
      ...updateBout(edit, 0, 'bout-0', { effort: { type: 'cardio', level: 'easy' }, durationS: 1700 }),
      revision: 4,
    };
    const local = updateBout(edit, 0, 'bout-0', { distanceM: 6000, durationS: 1900 });
    expect(rebaseEdit(local, edit, fresh).edit.exercises[0].sets[0]).toEqual({
      id: 'bout-0',
      kind: 'cardio',
      durationS: 1900,
      distanceM: 6000,
      interval: null,
      effort: { type: 'cardio', level: 'easy' },
    });
  });
});

describe('session detail texts', () => {
  const items = [
    { id: 'item-gloves', name: 'Iron Gloves' },
    { id: 'item-chalk', name: 'Chalk' },
  ] as CatalogItem[];

  it('warns which drops a change or delete may remove, naming unknown items generically', () => {
    expect(
      removalText(
        [
          { itemId: 'item-gloves', quantity: 1 },
          { itemId: 'item-chalk', quantity: 2 },
          { itemId: 'item-gone', quantity: 1 },
        ],
        items,
      ),
    ).toBe('This may remove Iron Gloves, Chalk ×2, an item from your collection.');
    expect(removalText([], items)).toBe('');
  });

  it('reports the drops a save or delete removed', () => {
    expect(removedText([{ itemId: 'item-chalk', revokedQuantity: 3 }], items)).toBe(
      'Removed Chalk ×3 from your collection.',
    );
    expect(removedText([{ itemId: 'item-chalk', revokedQuantity: 0 }], items)).toBe('');
  });

  it('compares set values without their ids', () => {
    const set = { id: 'a', weightKg: 60, reps: 5, isWarmup: false, effort: null };
    expect(sameSetValues(set, { ...set, id: 'b' })).toBe(true);
    expect(sameSetValues(set, { ...set, reps: 6 })).toBe(false);
  });

  it('explains the failures every save and delete can hit', () => {
    expect(failureText({ kind: 'read_only' }, 'save')).toBe(
      'This workout is older than 7 days, so it can no longer be changed.',
    );
    expect(failureText({ kind: 'wrong_account' }, 'delete')).toBe(
      'You are signed in as someone else in another tab. Reload the app.',
    );
    expect(failureText({ kind: 'retry', reason: 'offline' }, 'save')).toBe(
      "Couldn't reach the server (offline). Try again.",
    );
    expect(failureText({ kind: 'rate_limited', retryAfterSeconds: 120 }, 'save')).toBe(
      'Too many changes. Try again in 2 min.',
    );
    expect(failureText({ kind: 'rate_limited', retryAfterSeconds: null }, 'save')).toBe(
      'Too many changes. Try again in a few minutes.',
    );
    expect(failureText({ kind: 'bug', code: 'invalid_payload' }, 'delete')).toBe(
      "Couldn't delete this workout: invalid_payload",
    );
    expect(failureText({ kind: 'revision_conflict' }, 'delete')).toBe(
      'This workout was changed on another device. Check the latest version, then delete it again if you still want to.',
    );
  });
});

describe('hold sets in an edit', () => {
  const pinchId = 'aaaaaaaa-0000-4000-8000-000000000011';
  const carryId = 'aaaaaaaa-0000-4000-8000-000000000012';
  const runId = 'aaaaaaaa-0000-4000-8000-000000000013';
  const known = new Map<string, KnownExercise>([
    ...exercisesById,
    [pinchId, { name: 'Plate Pinch', loadType: 'external', measure: 'time' }],
    [carryId, { name: 'Farmers Carry', loadType: 'external', measure: 'distance' }],
    [
      runId,
      {
        name: 'Running',
        modality: 'cardio',
        activity: { paceUnit: 'per_km', tracksDistance: true },
      },
    ],
  ]);
  const holdRow = (id: string, exerciseId: string, position: number, measured: Partial<StoredSetRow>) =>
    row({ id, exerciseId, position, weightKg: 20, effectiveLoadKg: 20, reps: null, rir: null, ...measured });
  const holdRows = [
    holdRow('hold-0', pinchId, 0, { durationS: 45, effortInputType: 'level', effortValue: 0 }),
    holdRow('hold-1', carryId, 1, { distanceM: 40 }),
  ];
  const edit = editFromSession(session, holdRows, known);

  it('reads timed holds and carries as hold exercises', () => {
    expect(edit.exercises).toEqual([
      {
        exerciseId: pinchId,
        name: 'Plate Pinch',
        modality: 'hold',
        measure: 'time',
        loadType: 'external',
        sets: [
          {
            id: 'hold-0',
            kind: 'hold',
            weightKg: 20,
            durationS: 45,
            distanceM: null,
            effort: { type: 'level', level: 'failure' },
          },
        ],
      },
      {
        exerciseId: carryId,
        name: 'Farmers Carry',
        modality: 'hold',
        measure: 'distance',
        loadType: 'external',
        sets: [{ id: 'hold-1', kind: 'hold', weightKg: 20, durationS: null, distanceM: 40, effort: null }],
      },
    ]);
  });

  it('sends holds as hold sets and edits one by id', () => {
    const longer = updateHoldSet(edit, 0, 'hold-0', { durationS: 60 });
    expect(editPayload(longer).sets).toEqual([
      {
        kind: 'hold',
        id: 'hold-0',
        exerciseId: pinchId,
        position: 0,
        weightKg: 20,
        durationS: 60,
        distanceM: null,
        effort: { type: 'level', level: 'failure' },
      },
      {
        kind: 'hold',
        id: 'hold-1',
        exerciseId: carryId,
        position: 1,
        weightKg: 20,
        durationS: null,
        distanceM: 40,
        effort: null,
      },
    ]);
    expect(hasChanges(longer, edit)).toBe(true);
  });

  it('adds a set copying the last hold and adds a hold exercise with one set', () => {
    const added = addEditSet(edit, 1);
    expect(added.exercises[1].sets.at(-1)).toMatchObject({ kind: 'hold', weightKg: 20, distanceM: 40, effort: null });
    const withHang = addEditExercise(edit, { id: 'hang', name: 'Dead Hang', loadType: 'bodyweight', measure: 'time' });
    expect(withHang.exercises.at(-1)).toMatchObject({
      modality: 'hold',
      measure: 'time',
      sets: [{ kind: 'hold', weightKg: 0, durationS: 30, distanceM: null }],
    });
  });

  it('refuses to swap a hold for an exercise of another kind or measure', () => {
    expect(
      swapEditExercise(edit, 0, { id: carryId, name: 'Farmers Carry', loadType: 'external', measure: 'distance' }),
    ).toEqual(edit);
    expect(swapEditExercise(edit, 0, { id: benchId, name: 'Barbell Bench Press', loadType: 'external' })).toEqual(edit);
    const swapped = swapEditExercise(edit, 0, {
      id: 'hang',
      name: 'Dead Hang',
      loadType: 'bodyweight',
      measure: 'time',
    });
    expect(swapped.exercises[0]).toMatchObject({
      exerciseId: 'hang',
      loadType: 'bodyweight',
      sets: [{ weightKg: 0, durationS: 45 }],
    });
  });

  it('describes a stored hold and matches a replacement of the same kind and measure', () => {
    expect(describeHold({ weightKg: 20, durationS: 45, distanceM: null, effort: null }, 'external', 'kg')).toBe(
      '20 kg · 45 s',
    );
    expect(describeHold({ weightKg: 0, durationS: null, distanceM: 40, effort: null }, 'bodyweight', 'kg')).toBe(
      'bodyweight · 40 m',
    );
    const lift = {
      id: 'b',
      name: 'Bench',
      equipment: 'barbell',
      custom: false,
      archived: false,
      skillShares: [],
      modality: 'lift' as const,
      loadType: 'external' as const,
    };
    const carry = { ...lift, measure: 'distance' as const };
    expect(sameKindOfExercise(carry, { modality: 'hold', measure: 'distance' })).toBe(true);
    expect(sameKindOfExercise(carry, { modality: 'hold', measure: 'time' })).toBe(false);
    expect(sameKindOfExercise(carry, { modality: 'lift' })).toBe(false);
    expect(sameKindOfExercise(lift, { modality: 'lift' })).toBe(true);
  });
});

describe('the exact shape of what an edit adds, swaps and removes', () => {
  const pinned: SessionEdit = {
    sessionId: session.id,
    revision: 3,
    notes: '',
    exercises: [
      {
        exerciseId: benchId,
        name: 'Bench',
        modality: 'lift',
        loadType: 'external',
        sets: [{ id: 'lift-a', weightKg: 62.5, reps: 6, isWarmup: true, effort: { type: 'rir', value: 2 } }],
      },
      {
        exerciseId: 'plank',
        name: 'Plank',
        modality: 'hold',
        measure: 'time',
        loadType: 'external',
        sets: [
          {
            id: 'hold-a',
            kind: 'hold',
            weightKg: 10,
            durationS: 45,
            distanceM: null,
            effort: { type: 'level', level: 'hard' },
          },
        ],
      },
    ],
  };

  it('adds a working lift set copying the last set, keys in the order loaded rows use', () => {
    const added = addEditSet(pinned, 0).exercises[0].sets.at(-1);
    expect(added).toStrictEqual({ id: expect.any(String), weightKg: 62.5, reps: 6, isWarmup: false, effort: null });
    expect(Object.keys(added ?? {})).toEqual(['id', 'weightKg', 'reps', 'isWarmup', 'effort']);
  });

  it('adds a hold set copying the last hold without its effort', () => {
    expect(addEditSet(pinned, 1).exercises[1].sets.at(-1)).toStrictEqual({
      id: expect.any(String),
      kind: 'hold',
      weightKg: 10,
      durationS: 45,
      distanceM: null,
      effort: null,
    });
  });

  it('adds a lift or hold exercise with exactly one starting set', () => {
    expect(
      addEditExercise(pinned, { id: 'squat', name: 'Squat', loadType: 'external' }).exercises.at(-1),
    ).toStrictEqual({
      exerciseId: 'squat',
      name: 'Squat',
      modality: 'lift',
      loadType: 'external',
      sets: [{ id: expect.any(String), weightKg: 20, reps: 8, isWarmup: false, effort: null }],
    });
    const carry = { id: 'carry', name: 'Carry', loadType: 'external' as const, measure: 'distance' as const };
    expect(addEditExercise(pinned, carry).exercises.at(-1)).toStrictEqual({
      exerciseId: 'carry',
      name: 'Carry',
      modality: 'hold',
      measure: 'distance',
      loadType: 'external',
      sets: [{ id: expect.any(String), kind: 'hold', weightKg: 20, durationS: null, distanceM: 20, effort: null }],
    });
  });

  it('swaps a lift keeping its weights for the same load type and resetting them for another', () => {
    const same = swapEditExercise(pinned, 0, { id: 'incline', name: 'Incline', loadType: 'external' });
    expect(same.exercises[0]).toStrictEqual({ ...pinned.exercises[0], exerciseId: 'incline', name: 'Incline' });
    const other = swapEditExercise(pinned, 0, { id: 'dip', name: 'Dip', loadType: 'bodyweight' });
    expect(other.exercises[0]).toStrictEqual({
      ...pinned.exercises[0],
      exerciseId: 'dip',
      name: 'Dip',
      loadType: 'bodyweight',
      sets: [{ ...pinned.exercises[0].sets[0], weightKg: 0 }],
    });
    const plank = { id: 'plank', name: 'Plank', loadType: 'external' as const, measure: 'time' as const };
    expect(swapEditExercise(pinned, 0, plank)).toStrictEqual(pinned);
  });

  it('swaps a hold within its measure, keeping weights for the same load type and resetting them for another', () => {
    const same = swapEditExercise(pinned, 1, { id: 'side', name: 'Side plank', loadType: 'external', measure: 'time' });
    expect(same.exercises[1]).toStrictEqual({ ...pinned.exercises[1], exerciseId: 'side', name: 'Side plank' });
    const other = swapEditExercise(pinned, 1, { id: 'hang', name: 'Hang', loadType: 'bodyweight', measure: 'time' });
    expect(other.exercises[1].sets).toStrictEqual([{ ...pinned.exercises[1].sets[0], weightKg: 0 }]);
  });

  it('removes a set and drops the exercise it emptied', () => {
    expect(removeEditSet(pinned, 0, 'lift-a').exercises).toStrictEqual([pinned.exercises[1]]);
  });
});
