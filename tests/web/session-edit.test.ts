import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '../../supabase/functions/_shared/domain/balance.ts';
import { MAX_SETS_PER_SESSION } from '../../supabase/functions/_shared/domain/types.ts';
import {
  addEditExercise,
  addEditSet,
  canAddSet,
  dropsAtRisk,
  editFromSession,
  editPayload,
  effortLabel,
  failureAction,
  hasChanges,
  isEditable,
  rebaseEdit,
  rebaseNotice,
  removeEditSet,
  type SessionEdit,
  swapEditExercise,
  updateEditSet,
  withNewSetIds,
  withoutBodyweightLoads,
} from '../../web/src/features/history/session-edit.ts';
import { isSessionId, nextPageFilter, type StoredSetRow, transientReason } from '../../web/src/lib/history-rules.ts';

const benchId = 'aaaaaaaa-0000-4000-8000-000000000001';
const pullUpId = 'aaaaaaaa-0000-4000-8000-000000000002';
const session = { id: 'bbbbbbbb-0000-4000-8000-000000000001', revision: 3, notes: 'felt strong' };
const exercisesById = new Map([
  [benchId, { name: 'Barbell Bench Press', loadType: 'external' as const }],
  [pullUpId, { name: 'Pull-up', loadType: 'bodyweight' as const }],
]);

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
    expect(payload.sets.map((set) => [set.id, set.exerciseId, set.position, set.weightKg])).toEqual([
      ['set-0', benchId, 0, 61.23],
      ['set-1', benchId, 1, 60],
      ['set-2', pullUpId, 2, 0],
      ['set-3', benchId, 3, 60],
    ]);
  });

  it('sends blank notes as null and rounds weights to 2 dp', () => {
    const changed = updateEditSet({ ...edit, notes: '   ' }, 0, 'set-1', { weightKg: 72.4567 });
    const payload = editPayload(changed);
    expect(payload.notes).toBeNull();
    expect(payload.sets[1].weightKg).toBe(72.46);
    expect(hasChanges(changed, edit)).toBe(true);
  });

  it('sees no change when nothing but the revision differs', () => {
    expect(hasChanges({ ...edit, revision: 9 }, edit)).toBe(false);
    expect(hasChanges(updateEditSet(edit, 0, 'set-1', { weightKg: 60.001 }), edit)).toBe(false);
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
    expect(editPayload(fixed).sets.map((set) => set.weightKg)).toEqual([0, 0, 0, 0]);
  });
});

describe('editability and paging', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');

  it('allows edits within 7 days of the start and never for history-only sessions', () => {
    expect(isEditable({ historyOnly: false, startedAt: '2026-09-23T12:00:00Z' }, now)).toBe(true);
    expect(isEditable({ historyOnly: false, startedAt: '2026-09-23T11:59:59Z' }, now)).toBe(false);
    expect(isEditable({ historyOnly: true, startedAt: '2026-09-30T10:00:00Z' }, now)).toBe(false);
  });

  it('recognises session ids before querying', () => {
    expect(isSessionId('bbbbbbbb-0000-4000-8000-000000000001')).toBe(true);
    expect(isSessionId('BBBBBBBB-0000-4000-8000-000000000001')).toBe(true);
    expect(isSessionId('not-a-uuid')).toBe(false);
    expect(isSessionId('')).toBe(false);
  });

  it('builds the keyset filter for the next page', () => {
    expect(nextPageFilter({ startedAt: '2026-09-30T15:37:36.26+00:00', id: 'abc' })).toBe(
      'started_at.lt."2026-09-30T15:37:36.26+00:00",and(started_at.eq."2026-09-30T15:37:36.26+00:00",id.lt.abc)',
    );
  });

  it('labels stored effort', () => {
    expect(effortLabel({ type: 'level', level: 'near_failure' })).toBe('Near fail');
    expect(effortLabel({ type: 'rpe', value: 8.5 })).toBe('RPE 8.5');
    expect(effortLabel({ type: 'rir', value: 2 })).toBe('RIR 2');
    expect(effortLabel(null)).toBeNull();
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
    const remote = updateEditSet(removeEditSet(addEditSet(original, 1), 0, 'set-1'), 2, 'set-3', { reps: 12 });
    const fresh = { ...remote, revision: 4, notes: 'from the other phone' };
    const rebased = rebaseEdit(original, original, fresh).edit;
    expect(rebased).toEqual(fresh);
  });

  it('applies only what changed here on top of the newer copy', () => {
    const remoteAdded = addEditSet(original, 1);
    const remoteNewId = remoteAdded.exercises[1].sets[1].id;
    const fresh = {
      ...updateEditSet(removeEditSet(remoteAdded, 0, 'set-0'), 1, 'set-2', { reps: 15 }),
      revision: 4,
      notes: 'remote notes',
    };

    const localAdded = addEditSet(original, 0);
    const localNewId = localAdded.exercises[0].sets[2].id;
    const local = removeEditSet(updateEditSet(localAdded, 0, 'set-1', { reps: 9 }), 2, 'set-3');

    const rebased = rebaseEdit(local, original, fresh).edit;
    expect(rebased.revision).toBe(4);
    expect(rebased.notes).toBe('remote notes');
    expect(ids(rebased)).toEqual(['set-1', localNewId, 'set-2', remoteNewId]);
    const sets = editPayload(rebased).sets;
    expect(sets.find((set) => set.id === 'set-1')?.reps).toBe(9);
    expect(sets.find((set) => set.id === 'set-2')?.reps).toBe(15);
    expect(rebased.exercises.map((exercise) => exercise.exerciseId)).toEqual([benchId, pullUpId]);
  });

  it('merges a set changed on both sides field by field, local fields winning', () => {
    const fresh = { ...updateEditSet(original, 0, 'set-1', { reps: 7, weightKg: 65 }), revision: 4 };
    const local = updateEditSet(original, 0, 'set-1', { weightKg: 70, effort: { type: 'level', level: 'failure' } });
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
    const local = updateEditSet(original, 0, 'set-1', { reps: 11 });
    const rebased = rebaseEdit(local, original, fresh);
    expect(ids(rebased.edit)).toEqual(['set-2', 'set-3']);
    expect(rebased.droppedSetIds).toEqual(['set-1']);
    expect(rebaseNotice(rebased, fresh)).toBe(
      '1 set you changed was deleted on the other device. Nothing else of yours is left to save; this is the latest version.',
    );
  });

  it('does not count a set as dropped when it was not changed here', () => {
    const fresh = { ...removeEditSet(original, 0, 'set-1'), revision: 4 };
    const local = updateEditSet(original, 2, 'set-3', { reps: 11 });
    const rebased = rebaseEdit(local, original, fresh);
    expect(rebased.droppedSetIds).toEqual([]);
    expect(rebaseNotice(rebased, fresh)).toBe(
      'Your changes were applied to the latest version. Check them, then save.',
    );
  });

  it('points to undo or delete when no sets are left after the rebase', () => {
    const onlySet: SessionEdit = {
      ...original,
      exercises: [{ ...original.exercises[0], sets: [original.exercises[0].sets[0]] }],
    };
    const freshWithoutNew: SessionEdit = { ...onlySet, revision: 4, exercises: [] };
    const local = updateEditSet(onlySet, 0, 'set-0', { reps: 12 });
    const rebased = rebaseEdit(local, onlySet, freshWithoutNew);
    expect(rebased.edit.exercises).toEqual([]);
    expect(rebased.droppedSetIds).toEqual(['set-0']);
    expect(rebaseNotice(rebased, freshWithoutNew)).toBe(
      '1 set you changed was deleted on the other device. No sets are left to save. Undo to keep the latest version, or delete the workout.',
    );
  });

  it('ignores a weight re-typed to the same stored value, so the other device keeps its change', () => {
    const fresh = { ...updateEditSet(original, 0, 'set-1', { weightKg: 65 }), revision: 4 };
    const local = updateEditSet(original, 0, 'set-1', { weightKg: 60.0012 });
    const rebased = rebaseEdit(local, original, fresh);
    expect(rebased.edit.exercises[0].sets[1].weightKg).toBe(65);
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
          ...original.exercises[0],
          sets: [
            { id: 'new-first', weightKg: 40, reps: 10, isWarmup: true, effort: null },
            ...original.exercises[0].sets,
          ],
        },
        ...original.exercises.slice(1),
      ],
    };
    const fresh = { ...original, revision: 4 };
    expect(ids(rebaseEdit(local, original, fresh).edit)).toEqual(['new-first', 'set-0', 'set-1', 'set-2', 'set-3']);
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
      expect(dropsAtRisk(updateEditSet(original, 2, 'set-3', changes), original, drops)).toEqual([{ setId: 'set-3' }]);
    }
  });

  it('lists the drops of sets moved to another exercise', () => {
    const swapped = swapEditExercise(original, 1, { id: benchId, name: 'Barbell Bench Press', loadType: 'external' });
    expect(dropsAtRisk(swapped, original, drops)).toEqual([{ setId: 'set-2' }]);
  });
});
