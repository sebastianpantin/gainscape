import { describe, expect, it } from 'vitest';
import { createLocalDraftStore } from '../../web/src/offline/draft-store.ts';
import { discardLocalDraft, hasUnsyncedDraft } from '../../web/src/offline/local-drafts.ts';
import { workout } from './draft-store.contract.ts';
import { MemoryStorage } from './memory-storage.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';

describe('local drafts of an account', () => {
  it('knows whether the account has a workout that has not synced', async () => {
    const store = createLocalDraftStore(new MemoryStorage());
    expect(await hasUnsyncedDraft(store, userId)).toBe(false);
    await store.put(userId, 10, workout('session-a'));
    await store.put(otherUserId, 10, workout('session-b'));
    expect(await hasUnsyncedDraft(store, userId)).toBe(true);
  });

  it('discards the draft of the account only', async () => {
    const store = createLocalDraftStore(new MemoryStorage());
    await store.put(userId, 10, workout('session-a'));
    await store.put(otherUserId, 10, workout('session-b'));
    await discardLocalDraft(store, userId);
    expect(await hasUnsyncedDraft(store, userId)).toBe(false);
    expect(await hasUnsyncedDraft(store, otherUserId)).toBe(true);
  });

  it('does nothing when the account has no draft', async () => {
    const store = createLocalDraftStore(new MemoryStorage());
    await expect(discardLocalDraft(store, userId)).resolves.toBeUndefined();
  });
});
