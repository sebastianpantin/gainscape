import { describe, expect, it } from 'vitest';
import { keyedStore } from '../../web/src/lib/platform/keyed-store.ts';
import { MemoryStorage, throwingStorage } from './memory-storage.ts';

const countStore = keyedStore('gainscape.count.', (raw) => {
  const parsed: unknown = raw === null ? 0 : JSON.parse(raw);
  return typeof parsed === 'number' ? parsed : 0;
});

describe('keyed per-user store', () => {
  it('keys each user under the prefix and round-trips the value as JSON', () => {
    const storage = new MemoryStorage();
    countStore.save(storage, 'user-1', 7);
    expect(countStore.key('user-1')).toBe('gainscape.count.user-1');
    expect(storage.getItem('gainscape.count.user-1')).toBe('7');
    expect(countStore.read(storage, 'user-1')).toBe(7);
    expect(countStore.read(storage, 'user-2')).toBe(0);
  });

  it('forgets only the given user', () => {
    const storage = new MemoryStorage();
    countStore.save(storage, 'user-1', 1);
    countStore.save(storage, 'user-2', 2);
    countStore.forget(storage, 'user-1');
    expect(countStore.read(storage, 'user-1')).toBe(0);
    expect(countStore.read(storage, 'user-2')).toBe(2);
  });

  it('parses null without storage, when storage throws or when the saved text does not parse', () => {
    const storage = new MemoryStorage();
    storage.setItem('gainscape.count.user-1', '{broken');
    expect(countStore.read(storage, 'user-1')).toBe(0);
    expect(countStore.read(null, 'user-1')).toBe(0);
    expect(countStore.read(throwingStorage('getItem', 'setItem', 'removeItem'), 'user-1')).toBe(0);
    expect(() => countStore.save(throwingStorage('getItem', 'setItem', 'removeItem'), 'user-1', 1)).not.toThrow();
    expect(() => countStore.forget(throwingStorage('getItem', 'setItem', 'removeItem'), 'user-1')).not.toThrow();
    expect(() => countStore.save(null, 'user-1', 1)).not.toThrow();
  });

  it('passes the user id to parse and lets format shape the saved record', () => {
    const storage = new MemoryStorage();
    const ownedStore = keyedStore<string | null>(
      'gainscape.owned.',
      (raw, userId) => {
        const record = raw === null ? null : (JSON.parse(raw) as { userId: string; name: string });
        return record?.userId === userId ? record.name : null;
      },
      (name, userId) => ({ userId, name }),
    );
    ownedStore.save(storage, 'user-1', 'Bob');
    expect(storage.getItem('gainscape.owned.user-1')).toBe('{"userId":"user-1","name":"Bob"}');
    expect(ownedStore.read(storage, 'user-1')).toBe('Bob');
    storage.setItem('gainscape.owned.user-2', storage.getItem('gainscape.owned.user-1') ?? '');
    expect(ownedStore.read(storage, 'user-2')).toBeNull();
  });
});
