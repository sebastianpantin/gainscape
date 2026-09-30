import { useEffect, useState } from 'react';
import { openDraftStoreAndReconcile } from './draft-boot.ts';
import {
  createDraftSession,
  DRAFT_CHANNEL_NAME,
  type DraftChannel,
  type DraftSession,
  type DraftSnapshot,
} from './draft-session.ts';
import { createLocalDraftStore } from './draft-store.ts';

export type { WorkoutDraftState } from './draft-session.ts';

export type WorkoutDraftHandle = DraftSnapshot &
  Pick<
    DraftSession,
    'changeDraft' | 'updateDraft' | 'startWorkout' | 'discardDraft' | 'markSynced' | 'reload' | 'flush'
  >;

function openDraftChannel(): DraftChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(DRAFT_CHANNEL_NAME);
}

function requestPersistentStorage(): void {
  void navigator.storage?.persist?.().catch(() => false);
}

function startSession(userId: string, onChange: (snapshot: DraftSnapshot) => void): DraftSession {
  return createDraftSession({
    userId,
    openStore: openDraftStoreAndReconcile,
    fallbackStore: () => createLocalDraftStore(localStorage),
    channel: openDraftChannel(),
    onChange,
    requestPersistence: requestPersistentStorage,
  });
}

const LOADING: DraftSnapshot = { state: { status: 'loading' }, store: null, saveProblem: false };

const IDLE_ACTIONS: Omit<WorkoutDraftHandle, keyof DraftSnapshot> = {
  changeDraft: () => undefined,
  updateDraft: () => null,
  startWorkout: () => Promise.resolve(false),
  discardDraft: () => undefined,
  markSynced: () => Promise.resolve(),
  reload: () => Promise.resolve(),
  flush: () => Promise.resolve(),
};

export function useWorkoutDraft(userId: string): WorkoutDraftHandle {
  const [current, setCurrent] = useState<{ session: DraftSession; snapshot: DraftSnapshot } | null>(null);

  useEffect(() => {
    const session: DraftSession = startSession(userId, (snapshot) => setCurrent({ session, snapshot }));
    return () => session.close();
  }, [userId]);

  if (!current) return { ...LOADING, ...IDLE_ACTIONS };
  const { session, snapshot } = current;
  return {
    ...snapshot,
    changeDraft: session.changeDraft,
    updateDraft: session.updateDraft,
    startWorkout: session.startWorkout,
    discardDraft: session.discardDraft,
    markSynced: session.markSynced,
    reload: session.reload,
    flush: session.flush,
  };
}
