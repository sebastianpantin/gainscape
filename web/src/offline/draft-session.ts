import { nextUpdatedAt, type StoredDraft, type WorkoutDraft } from './draft-format.ts';
import type { DraftStore, PutOptions } from './draft-store.ts';

export const DRAFT_CHANNEL_NAME = 'gainscape.drafts';

export type DraftNotice = 'saved_elsewhere' | 'deleted';

export type WorkoutDraftState =
  { status: 'loading' } | { status: 'ready'; draft: WorkoutDraft | null; notice: DraftNotice | null };

export interface DraftSnapshot {
  state: WorkoutDraftState;
  store: DraftStore | null;
  saveProblem: boolean;
}

export type SyncedChange = 'synced' | 'deleted';

export type DraftChange = 'written' | 'discarded' | SyncedChange;

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
  markSynced: (sessionId: string, change?: SyncedChange) => Promise<void>;
  reload: (noticeWhenGone?: DraftNotice | null) => Promise<void>;
  flush: () => Promise<void>;
  close: () => void;
}

const NOTICE_FOR_CHANGE: Record<DraftChange, DraftNotice | null> = {
  written: 'saved_elsewhere',
  synced: 'saved_elsewhere',
  discarded: null,
  deleted: 'deleted',
};

const openSessionFlushes = new Set<() => Promise<void>>();

export async function flushOpenDraftSessions(): Promise<void> {
  await Promise.all([...openSessionFlushes].map((flush) => flush()));
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
  const deletedSessionIds = new Set<string>();
  let chain: Promise<void> = Promise.resolve();
  let usingFallback = false;
  let primaryUnreadable = false;
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
    else if (record?.kind === 'synced' && deletedSessionIds.has(record.syncedSessionId)) showDraft(null, 'deleted');
    else if (record?.kind === 'discarded') showDraft(null);
    else showDraft(null, noticeWhenGone);
  };

  const switchToFallback = (): DraftStore => {
    usingFallback = true;
    const fallback = fallbackStore();
    publish({ store: fallback });
    return fallback;
  };

  const markSaved = () => {
    if (snapshot.saveProblem !== primaryUnreadable) publish({ saveProblem: primaryUnreadable });
  };

  const runOnStore = async (task: (store: DraftStore) => Promise<void>) => {
    try {
      await task(snapshot.store!);
      return markSaved();
    } catch {
      if (usingFallback) return publish({ saveProblem: true });
    }
    try {
      await task(switchToFallback());
      markSaved();
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
    publish({ store, saveProblem: primaryUnreadable });
    showDraft(record?.kind === 'draft' ? record.draft : null);
  };

  const ready = (async () => {
    await Promise.resolve();
    try {
      await load(await openStore());
      return;
    } catch {
      usingFallback = true;
      primaryUnreadable = true;
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
      if (!isDraftMessage(message) || message.userId !== userId) return;
      if (message.change === 'deleted') deletedSessionIds.add(message.sessionId);
      if (message.updatedAt <= lastSeen) return;
      const noticeWhenGone = Object.hasOwn(NOTICE_FOR_CHANGE, message.change)
        ? NOTICE_FOR_CHANGE[message.change]
        : 'saved_elsewhere';
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
      if (record) seen(record.updatedAt);
      changeDraft(fresh());
      startedFresh = true;
    });
    return startedFresh;
  };

  const discardDraft = (sessionId: string) => {
    showDraft(null);
    const updatedAt = claimUpdatedAt();
    void enqueue(async (store) => {
      await store.discard(userId, sessionId, updatedAt);
      const record = await store.get(userId);
      if (record) seen(record.updatedAt);
      announce(sessionId, record?.updatedAt ?? updatedAt, 'discarded');
    });
  };

  const markSynced = (sessionId: string, change: SyncedChange = 'synced') => {
    const updatedAt = claimUpdatedAt();
    if (change === 'deleted') deletedSessionIds.add(sessionId);
    return enqueue(async (store) => {
      await store.markSynced(userId, sessionId, updatedAt);
      const record = await store.get(userId);
      if (record) seen(record.updatedAt);
      announce(sessionId, record?.updatedAt ?? updatedAt, change);
    });
  };

  const reload = (noticeWhenGone: DraftNotice | null = 'saved_elsewhere') =>
    enqueue(async (store) => adopt(await store.get(userId), noticeWhenGone));

  const flush = async () => {
    let drained: Promise<void>;
    do {
      drained = chain;
      await drained;
    } while (drained !== chain);
  };

  const close = () => {
    active = false;
    openSessionFlushes.delete(flush);
    channel?.close();
  };

  openSessionFlushes.add(flush);

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
