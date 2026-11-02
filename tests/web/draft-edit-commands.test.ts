import { describe, expect, it } from 'vitest';
import { draftEditCommands, type SetEditChange } from '../../web/src/features/workout/draft-edit-commands.ts';
import { toggleSetDone } from '../../web/src/offline/draft-edits.ts';
import { type WorkoutDraft } from '../../web/src/offline/draft-format.ts';
import { createDraftSession } from '../../web/src/offline/draft-session.ts';
import { createLocalDraftStore } from '../../web/src/offline/draft-store.ts';
import { updateSet } from '../../web/src/lib/workout/exercise-edit-rules.ts';
import { DRAFT_USER_ID, liftsOf, workout } from './draft-fixtures.ts';
import { MemoryStorage } from './memory-storage.ts';

const PLACE = { exerciseIndex: 0, setIndex: 1, label: 'Bench, set 2' };

function draftSession() {
  return createDraftSession({
    userId: DRAFT_USER_ID,
    openStore: async () => createLocalDraftStore(new MemoryStorage()),
    fallbackStore: () => createLocalDraftStore(new MemoryStorage()),
    channel: null,
    onChange: () => undefined,
  });
}

function draftOf(session: ReturnType<typeof draftSession>): WorkoutDraft | null {
  const { state } = session.snapshot();
  return state.status === 'ready' ? state.draft : null;
}

async function commandsOverStartedDraft() {
  const session = draftSession();
  await session.startWorkout(() => workout({ finishedAt: null }));
  const edited: SetEditChange[] = [];
  const commands = draftEditCommands({
    updateDraft: session.updateDraft,
    onSetEdited: (change) => edited.push(change),
  });
  return { session, commands, edited };
}

describe('draft edit commands', () => {
  it('applies back-to-back set edits to the latest draft, so neither is lost', async () => {
    const { session, commands } = await commandsOverStartedDraft();

    commands.editSet('set-b', PLACE, (latest) => updateSet(latest, 0, 'set-b', { weightKg: 70 }));
    commands.editSet('set-b', PLACE, (latest) => toggleSetDone(latest, 0, 'set-b'));

    expect(liftsOf(draftOf(session))[0].sets[1]).toMatchObject({ weightKg: 70, done: true });
  });

  it('reports each set edit against the draft just before it, for set feedback', async () => {
    const { commands, edited } = await commandsOverStartedDraft();

    commands.editSet('set-b', PLACE, (latest) => updateSet(latest, 0, 'set-b', { weightKg: 70 }));
    commands.editSet('set-b', PLACE, (latest) => toggleSetDone(latest, 0, 'set-b'));

    expect(edited).toHaveLength(2);
    const second = edited[1];
    expect(liftsOf(second.previous)[0].sets[1]).toMatchObject({ weightKg: 70, done: false });
    expect(liftsOf(second.next)[0].sets[1]).toMatchObject({ weightKg: 70, done: true });
    expect(second).toMatchObject({ setId: 'set-b', place: PLACE });
  });

  it('applies other edits to the latest draft without set feedback', async () => {
    const { session, commands, edited } = await commandsOverStartedDraft();

    commands.edit((latest) => updateSet(latest, 0, 'set-a', { reps: 5 }));
    commands.edit((latest) => updateSet(latest, 0, 'set-b', { reps: 6 }));

    expect(liftsOf(draftOf(session))[0].sets.map((set) => set.reps)).toEqual([5, 6]);
    expect(edited).toEqual([]);
  });

  it('reports no set edit when the update leaves nothing to change', async () => {
    const { commands, edited } = await commandsOverStartedDraft();

    commands.editSet('set-b', PLACE, () => null);

    expect(edited).toEqual([]);
  });

  it('does nothing while no draft is open', () => {
    const session = draftSession();
    const edited: SetEditChange[] = [];
    const commands = draftEditCommands({
      updateDraft: session.updateDraft,
      onSetEdited: (change) => edited.push(change),
    });

    commands.editSet('set-b', PLACE, (latest) => toggleSetDone(latest, 0, 'set-b'));
    commands.edit((latest) => toggleSetDone(latest, 0, 'set-b'));

    expect(draftOf(session)).toBeNull();
    expect(edited).toEqual([]);
  });
});
