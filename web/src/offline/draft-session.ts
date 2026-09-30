import { nextUpdatedAt, type StoredDraft, type WorkoutDraft } from './draft-format.ts';
import type { DraftStore, PutOptions } from './draft-store.ts';

export const DRAFT_CHANNEL_NAME = 'gainscape.drafts';

export type DraftNotice = 'saved_elsewhere';

export type WorkoutDraftState =
  { status: 'loading' } | { status: 'ready'; draft: WorkoutDraft | null; notice: DraftNotice | null };

export interface DraftSnapshot {
  state: WorkoutDraftState;
  store: DraftStore | null;
  saveProblem: boolean;
}

export type DraftChange = 'written' | 'synced' | 'discarded';

export interface DraftMessage {
  userId: string;
  sessionId: string;
  updatedAt: number;
  change: DraftChange;
}

export interface DraftChannel {
  postMessage(message: DraftMessage): void;
  close(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}

export interface DraftSessionOptions {
  userId: string;
  openStore: () => Promise<DraftStore>;
  fallbackStore: () => DraftStore;
  channel: DraftChannel | null;
  onChange: (snapshot: DraftSnapshot) => void;
  requestPersistence?: () => void;
}

export interface DraftSession {
  snapshot: () => DraftSnapshot;
  ready: Promise<void>;
  changeDraft: (next: WorkoutDraft, options?: PutOptions) => void;
  updateDraft: (update: (current: WorkoutDraft) => WorkoutDraft | null) => WorkoutDraft | null;
  startWorkout: (fresh: () => WorkoutDraft) => Promise<boolean>;
  discardDraft: (sessionId: string) => void;
  markSynced: (sessionId: string) => Promise<void>;
  reload: () => Promise<void>;
  flush: () => Promise<void>;
  close: () => void;
}

function isDraftMessage(data: unknown): data is DraftMessage {
  const message = data as Partial<DraftMessage> | null;
  return typeof message?.userId === 'string' && typeof message.updatedAt === 'number';
}

export function createDraftSession({
  userId,
  openStore,
  fallbackStore,
  channel,
  onChange,
  requestPersistence,
}: DraftSessionOptions): DraftSession {
  let snapshot: DraftSnapshot = { state: { status: 'loading' }, store: null, saveProblem: false };
  let active = true;
  let lastSeen = 0;
  let chain: Promise<void> = Promise.resolve();
  let usingFallback = false;
  let persistenceRequested = false;

  const publish = (changes: Partial<DraftSnapshot>) => {
    snapshot = { ...snapshot, ...changes };
    if (active) onChange(snapshot);
  };

  const showDraft = (draft: WorkoutDraft | null, notice: DraftNotice | null = null) =>
    publish({ state: { status: 'ready', draft, notice } });

  const seen = (updatedAt: number) => {
    lastSeen = Math.max(lastSeen, updatedAt);
  };

  const claimUpdatedAt = () => {
    lastSeen = nextUpdatedAt(lastSeen, Date.now());
    return lastSeen;
  };

  const adopt = (record: StoredDraft | null, noticeWhenGone: DraftNotice | null = 'saved_elsewhere') => {
    if (record) seen(record.updatedAt);
    if (record?.kind === 'draft') showDraft(record.draft);
    else showDraft(null, noticeWhenGone);
  };

  const switchToFallback = (): DraftStore => {
    usingFallback = true;
    const fallback = fallbackStore();
    publish({ store: fallback });
    return fallback;
  };

  const runOnStore = async (task: (store: DraftStore) => Promise<void>) => {
    try {
      await task(snapshot.store!);
      if (snapshot.saveProblem) publish({ saveProblem: false });
      return;
    } catch {
      if (usingFallback) return publish({ saveProblem: true });
    }
    try {
      await task(switchToFallback());
      if (snapshot.saveProblem) publish({ saveProblem: false });
    } catch {
      publish({ saveProblem: true });
    }
  };

  const enqueue = (task: (store: DraftStore) => Promise<void>): Promise<void> => {
    const next = chain.then(() => runOnStore(task));
    chain = next;
    return next;
  };

  const announce = (sessionId: string, updatedAt: number, change: DraftChange) =>
    channel?.postMessage({ userId, sessionId, updatedAt, change });

  const load = async (store: DraftStore) => {
    const record = await store.get(userId);
    if (record) seen(record.updatedAt);
    publish({ store });
    showDraft(record?.kind === 'draft' ? record.draft : null);
  };

  const ready = (async () => {
    await Promise.resolve();
    try {
      await load(await openStore());
      return;
    } catch {
      usingFallback = true;
    }
    try {
      await load(fallbackStore());
    } catch {
      publish({ saveProblem: true });
      showDraft(null);
    }
  })();

  chain = ready;

  if (channel)
    channel.onmessage = (event) => {
      const message = event.data;
      if (!isDraftMessage(message) || message.userId !== userId || message.updatedAt <= lastSeen) return;
      const noticeWhenGone = message.change === 'discarded' ? null : 'saved_elsewhere';
      void enqueue(async (store) => adopt(await store.get(userId), noticeWhenGone));
    };

  const currentDraft = () => (snapshot.state.status === 'ready' ? snapshot.state.draft : null);

  const changeDraft = (next: WorkoutDraft, options?: PutOptions) => {
    showDraft(next);
    const updatedAt = claimUpdatedAt();
    void enqueue(async (store) => {
      const result = await store.put(userId, updatedAt, next, options);
      if (result === 'written') {
        announce(next.sessionId, updatedAt, 'written');
        if (!persistenceRequested) {
          persistenceRequested = true;
          requestPersistence?.();
        }
      } else if (result === 'synced') {
        showDraft(null, 'saved_elsewhere');
      } else {
        adopt(await store.get(userId));
      }
    });
  };

  const updateDraft = (update: (current: WorkoutDraft) => WorkoutDraft | null) => {
    const current = currentDraft();
    if (!current) return null;
    const next = update(current);
    if (next && next !== current) changeDraft(next);
    return next;
  };

  const startWorkout = async (fresh: () => WorkoutDraft) => {
    let startedFresh = false;
    await enqueue(async (store) => {
      const record = await store.get(userId);
      if (record?.kind === 'draft') return adopt(record);
      changeDraft(fresh());
      startedFresh = true;
    });
    return startedFresh;
  };

  const discardDraft = (sessionId: string) => {
    showDraft(null);
    const updatedAt = claimUpdatedAt();
    void enqueue(async (store) => {
      await store.discard(userId, sessionId);
      announce(sessionId, updatedAt, 'discarded');
    });
  };

  const markSynced = (sessionId: string) => {
    const updatedAt = claimUpdatedAt();
    return enqueue(async (store) => {
      await store.markSynced(userId, sessionId, updatedAt);
      const record = await store.get(userId);
      if (record) seen(record.updatedAt);
      announce(sessionId, record?.updatedAt ?? updatedAt, 'synced');
    });
  };

  const reload = () => enqueue(async (store) => adopt(await store.get(userId)));

  const flush = async () => {
    let drained: Promise<void>;
    do {
      drained = chain;
      await drained;
    } while (drained !== chain);
  };

  const close = () => {
    active = false;
    channel?.close();
  };

  return {
    snapshot: () => snapshot,
    ready,
    changeDraft,
    updateDraft,
    startWorkout,
    discardDraft,
    markSynced,
    reload,
    flush,
    close,
  };
}
