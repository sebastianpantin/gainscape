import { describe, expect, it } from 'vitest';
import {
  forgetLastSeenNumbers,
  readLastSeenNumber,
  saveLastSeenNumber,
  skillXpMetric,
} from '../../web/src/lib/ui/last-seen-number-store.ts';
import { MemoryStorage, throwingStorage } from './memory-storage.ts';

const RETIRED_SEEN_LEVELS_KEY = 'gainscape.seen-levels.v1.user-1';

describe('last seen numbers', () => {
  it('reads nothing before a number was seen', () => {
    expect(readLastSeenNumber(new MemoryStorage(), 'user-1', 'total-level')).toBeNull();
  });

  it('keeps each metric of a user apart', () => {
    const storage = new MemoryStorage();
    saveLastSeenNumber(storage, 'user-1', 'total-level', 34);
    saveLastSeenNumber(storage, 'user-1', skillXpMetric('chest'), 1250);
    saveLastSeenNumber(storage, 'user-1', 'total-level', 35);
    expect(readLastSeenNumber(storage, 'user-1', 'total-level')).toBe(35);
    expect(readLastSeenNumber(storage, 'user-1', 'skill-xp.chest')).toBe(1250);
    expect(readLastSeenNumber(storage, 'user-2', 'total-level')).toBeNull();
  });

  it('reads nothing from a corrupt record or a record saved for someone else', () => {
    const storage = new MemoryStorage();
    storage.setItem('gainscape.last-seen-numbers.v1.user-1', '{broken');
    expect(readLastSeenNumber(storage, 'user-1', 'dots')).toBeNull();
    storage.setItem('gainscape.last-seen-numbers.v1.user-1', JSON.stringify({ userId: 'user-2', value: { dots: 12 } }));
    expect(readLastSeenNumber(storage, 'user-1', 'dots')).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    const blocked = throwingStorage('getItem', 'setItem', 'removeItem');
    expect(readLastSeenNumber(blocked, 'user-1', 'dots')).toBeNull();
    expect(readLastSeenNumber(null, 'user-1', 'dots')).toBeNull();
    expect(() => saveLastSeenNumber(blocked, 'user-1', 'dots', 12)).not.toThrow();
    expect(() => saveLastSeenNumber(null, 'user-1', 'dots', 12)).not.toThrow();
    expect(() => forgetLastSeenNumbers(blocked, 'user-1')).not.toThrow();
  });

  it('writes nothing when the number is already the one saved', () => {
    const storage = new MemoryStorage();
    saveLastSeenNumber(storage, 'user-1', 'dots', 12);
    const writes: string[] = [];
    storage.setItem = (key) => writes.push(key);
    storage.removeItem = (key) => writes.push(key);
    saveLastSeenNumber(storage, 'user-1', 'dots', 12);
    expect(writes).toEqual([]);
  });

  it('touches the retired seen levels key only while it exists', () => {
    const storage = new MemoryStorage();
    const removed: string[] = [];
    const removeItem = storage.removeItem.bind(storage);
    storage.removeItem = (key) => {
      removed.push(key);
      removeItem(key);
    };
    storage.setItem(RETIRED_SEEN_LEVELS_KEY, JSON.stringify({ userId: 'user-1', value: {} }));
    saveLastSeenNumber(storage, 'user-1', 'dots', 12);
    saveLastSeenNumber(storage, 'user-1', 'dots', 13);
    expect(removed).toEqual([RETIRED_SEEN_LEVELS_KEY]);
  });

  it('removes the retired seen levels key on save and on forget', () => {
    const storage = new MemoryStorage();
    storage.setItem(RETIRED_SEEN_LEVELS_KEY, JSON.stringify({ userId: 'user-1', value: {} }));
    saveLastSeenNumber(storage, 'user-1', 'dots', 12);
    expect(storage.getItem(RETIRED_SEEN_LEVELS_KEY)).toBeNull();

    storage.setItem(RETIRED_SEEN_LEVELS_KEY, JSON.stringify({ userId: 'user-1', value: {} }));
    forgetLastSeenNumbers(storage, 'user-1');
    expect(storage.getItem(RETIRED_SEEN_LEVELS_KEY)).toBeNull();
    expect(readLastSeenNumber(storage, 'user-1', 'dots')).toBeNull();
  });
});
