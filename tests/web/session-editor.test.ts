import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import type { InvokeOutcome } from '../../web/src/lib/platform/function-client-rules.ts';
import type { SessionEdit } from '../../web/src/features/history/session-edit.ts';
import {
  createSessionEditor,
  type SessionEditorChange,
  type SessionEditorPorts,
} from '../../web/src/features/history/session-editor.ts';

const sessionId = '33333333-3333-4333-8333-333333333333';
const dipId = '44444444-4444-4444-8444-444444444444';

interface Fresh {
  revision: number;
}

function edit(): SessionEdit {
  return {
    sessionId,
    revision: 3,
    notes: '',
    exercises: [
      {
        exerciseId: dipId,
        name: 'Dip',
        modality: 'lift',
        loadType: 'bodyweight_plus',
        sets: [
          { id: 'set-1', weightKg: 10, reps: 8, isWarmup: false, effort: null },
          { id: 'set-2', weightKg: 10, reps: 6, isWarmup: false, effort: null },
        ],
      },
    ],
  };
}

const dip: Exercise = {
  id: dipId,
  name: 'Dip',
  equipment: 'bodyweight',
  custom: false,
  archived: false,
  skillShares: [],
  modality: 'lift',
  loadType: 'bodyweight',
};

function rejected(code: string, details: unknown = {}): InvokeOutcome<never> {
  return { kind: 'http_error', status: 409, code, details };
}

const saved = (revision: number) => ({
  kind: 'ok' as const,
  data: { revision, replayedSessionIds: ['later'], revokedDrops: [] },
});

function harness(overrides: Partial<SessionEditorPorts<Fresh>> = {}) {
  const changes: SessionEditorChange<Fresh>[] = [];
  const forgotten: string[][] = [];
  const sent: SessionEdit['exercises'][number]['sets'][] = [];
  const controller = new AbortController();
  const ports: SessionEditorPorts<Fresh> = {
    sessionId,
    signal: () => controller.signal,
    editSession: async (payload) => {
      sent.push(payload.sets as never);
      return saved(4);
    },
    deleteSession: async () => ({ kind: 'ok', data: { replayedSessionIds: [], revokedDrops: [] } }),
    loadSession: async () => ({ revision: 9 }),
    latestExercises: async () => [dip],
    rememberedSummaryId: () => undefined,
    forgetSummaries: (ids) => forgotten.push(ids),
    forgetDeletedSession: () => forgotten.push(['program']),
    describeRevoked: (drops) => (drops && drops.length > 0 ? 'Removed a ring from your collection.' : ''),
    apply: (change) => changes.push(change),
    ...overrides,
  };
  return { editor: createSessionEditor(ports), changes, forgotten, sent, controller };
}

const kinds = (changes: SessionEditorChange<Fresh>[]) => changes.map((change) => change.kind);

describe('createSessionEditor save', () => {
  it('saves, forgets the replayed summaries, shows the notice and adopts the refreshed workout', async () => {
    const { editor, changes, forgotten } = harness();
    await editor.save(edit());
    expect(forgotten).toEqual([[sessionId, 'later']]);
    expect(changes).toContainEqual({ kind: 'saved', saved: { ...edit(), revision: 4 } });
    expect(changes).toContainEqual({ kind: 'notice', notice: 'Changes saved.' });
    expect(changes.at(-2)).toEqual({ kind: 'adopt', fresh: { revision: 9 } });
    expect(changes.at(-1)).toEqual({ kind: 'problem', problem: null });
  });

  it('shows retries while busy and forgets the remembered summary after a retried save', async () => {
    const { editor, changes, forgotten } = harness({
      editSession: async (_payload, _signal, onRetry) => {
        onRetry('timeout');
        return { kind: 'ok', data: { revision: 4, replayedSessionIds: [], revokedDrops: [{} as never] } };
      },
      rememberedSummaryId: () => 'remembered',
    });
    await editor.save(edit());
    expect(changes).toContainEqual({ kind: 'busy', busy: { kind: 'saving', retrying: 'timeout' } });
    expect(forgotten).toEqual([[sessionId, 'remembered']]);
    expect(changes).toContainEqual({ kind: 'notice', notice: 'Changes saved. Removed a ring from your collection.' });
  });

  it('gives clashing sets new ids and resends, at most twice', async () => {
    let attempts = 0;
    const { editor, changes, sent } = harness({
      editSession: async (payload) => {
        attempts += 1;
        sent.push(payload.sets as never);
        return rejected('set_id_conflict', { setIds: [payload.sets[0].id] });
      },
    });
    await editor.save(edit());
    expect(attempts).toBe(3);
    const firstIds = sent.map((sets) => sets[0].id);
    expect(new Set(firstIds).size).toBe(3);
    expect(sent.every((sets) => sets[1].id === 'set-2')).toBe(true);
    expect(kinds(changes).filter((kind) => kind === 'edit')).toHaveLength(2);
    expect(changes.at(-1)).toEqual({
      kind: 'problem',
      problem: { kind: 'message', text: "Couldn't save this workout: reid_sets" },
    });
  });

  it('resets loads of exercises that became bodyweight only and asks to save again', async () => {
    const { editor, changes } = harness({ editSession: async () => rejected('bodyweight_load_not_zero') });
    await editor.save(edit());
    const fixed = changes.find((change) => change.kind === 'edit');
    expect(
      fixed?.kind === 'edit' && fixed.edit.exercises[0].sets.map((set) => 'weightKg' in set && set.weightKg),
    ).toEqual([0, 0]);
    expect(changes.at(-1)).toEqual({
      kind: 'problem',
      problem: {
        kind: 'message',
        text: "Bodyweight-only exercises can't carry added weight, so it was reset to 0. Check the sets and save again.",
      },
    });
  });

  it('loads the latest version on a revision conflict and offers a retry when that load fails', async () => {
    const loaded = harness({ editSession: async () => rejected('revision_conflict') });
    await loaded.editor.save(edit());
    expect(loaded.changes.at(-1)).toEqual({ kind: 'problem', problem: { kind: 'conflict', fresh: { revision: 9 } } });

    let loads = 0;
    const failing = harness({
      editSession: async () => rejected('revision_conflict'),
      loadSession: async () => {
        loads += 1;
        if (loads === 1) throw new Error('offline');
        return { revision: 10 };
      },
    });
    await failing.editor.save(edit());
    const last = failing.changes.at(-1);
    if (last?.kind !== 'problem' || last.problem?.kind !== 'refresh_failed')
      throw new Error('expected a refresh problem');
    expect(last.problem.text).toBe(
      "This workout was changed on another device, and the latest version couldn't be loaded.",
    );
    last.problem.retry();
    await expect
      .poll(() => failing.changes.at(-1))
      .toEqual({
        kind: 'problem',
        problem: { kind: 'conflict', fresh: { revision: 10 } },
      });
  });

  it('asks for bodyweight or names unknown exercises', async () => {
    const bodyweight = harness({ editSession: async () => rejected('bodyweight_required') });
    await bodyweight.editor.save(edit());
    expect(bodyweight.changes.at(-1)).toEqual({ kind: 'problem', problem: { kind: 'bodyweight', pending: edit() } });
    const unknown = harness({ editSession: async () => rejected('unknown_exercise', { exerciseIds: [dipId] }) });
    await unknown.editor.save(edit());
    expect(unknown.changes.at(-1)).toEqual({
      kind: 'problem',
      problem: { kind: 'unknown_exercise', exerciseIds: [dipId] },
    });
  });

  it('turns read-only past the edit window, and leaves for a gone workout or a missing profile', async () => {
    const closed = harness({ editSession: async () => rejected('edit_window_closed') });
    await closed.editor.save(edit());
    expect(kinds(closed.changes).slice(-2)).toEqual(['read_only', 'problem']);
    const gone = harness({ editSession: async () => rejected('session_not_found') });
    await gone.editor.save(edit());
    expect(gone.changes.at(-1)).toEqual({ kind: 'gone' });
    const signedOut = harness({ editSession: async () => rejected('profile_missing') });
    await signedOut.editor.save(edit());
    expect(signedOut.changes.at(-1)).toEqual({ kind: 'sign_out' });
  });

  it('changes nothing once the screen has moved on', async () => {
    const { editor, changes, controller } = harness({
      editSession: async () => {
        controller.abort();
        return saved(4);
      },
    });
    await editor.save(edit());
    expect(kinds(changes)).toEqual(['problem', 'notice', 'busy']);
  });
});

describe('createSessionEditor remove', () => {
  it('deletes, forgets the summaries and the program session, and leaves with a notice', async () => {
    const { editor, changes, forgotten } = harness({
      deleteSession: async (payload) => {
        expect(payload).toEqual({ sessionId, ifRevision: 3 });
        return { kind: 'ok', data: { replayedSessionIds: ['later'], revokedDrops: [{} as never] } };
      },
    });
    await editor.remove(3);
    expect(forgotten).toEqual([[sessionId, 'later'], ['program']]);
    expect(kinds(changes)).toContain('delete_settled');
    expect(changes.at(-1)).toEqual({
      kind: 'deleted',
      notice: 'Workout deleted. Removed a ring from your collection.',
    });
  });

  it('shows the latest version and asks again after a revision conflict', async () => {
    const { editor, changes } = harness({ deleteSession: async () => rejected('revision_conflict') });
    await editor.remove(3);
    expect(changes.slice(-2)).toEqual([
      { kind: 'adopt', fresh: { revision: 9 } },
      {
        kind: 'problem',
        problem: {
          kind: 'message',
          text: 'This workout was changed on another device. Check the latest version, then delete it again if you still want to.',
        },
      },
    ]);
  });

  it('leaves when the workout is gone on reload', async () => {
    const { editor, changes } = harness({
      deleteSession: async () => rejected('revision_conflict'),
      loadSession: async () => null,
    });
    await editor.remove(3);
    expect(changes.at(-1)).toEqual({ kind: 'gone' });
  });
});
