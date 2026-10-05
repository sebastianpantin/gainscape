import { describe, expect, it } from 'vitest';
import {
  exerciseNotesCacheKey,
  forgetCachedExerciseNotes,
  loadExerciseNotesCacheFirst,
  readCachedExerciseNotes,
  saveCachedExerciseNotes,
} from '../../web/src/lib/exercise-note-cache.ts';
import type { ExerciseNotes } from '../../web/src/lib/exercise-note-rules.ts';
import { MemoryStorage } from './memory-storage.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const notes: ExerciseNotes = { bench: 'Seat 4', squat: 'High bar\nBelt from 100' };

describe('exercise note cache', () => {
  it('round-trips the notes', () => {
    const storage = new MemoryStorage();
    saveCachedExerciseNotes(storage, userId, notes);
    expect(readCachedExerciseNotes(storage, userId)).toEqual(notes);
  });

  it('uses the per-user key', () => {
    expect(exerciseNotesCacheKey(userId)).toBe(`gainscape.exercise-notes.v1.${userId}`);
  });

  it('returns null for another user, a wrong version, a malformed note and malformed JSON', () => {
    const storage = new MemoryStorage();
    saveCachedExerciseNotes(storage, otherUserId, notes);
    storage.setItem(exerciseNotesCacheKey(userId), storage.getItem(exerciseNotesCacheKey(otherUserId))!);
    expect(readCachedExerciseNotes(storage, userId)).toBeNull();
    storage.setItem(exerciseNotesCacheKey(userId), JSON.stringify({ v: 2, savedAt: '', userId, notes }));
    expect(readCachedExerciseNotes(storage, userId)).toBeNull();
    storage.setItem(exerciseNotesCacheKey(userId), JSON.stringify({ v: 1, savedAt: '', userId, notes: { bench: 4 } }));
    expect(readCachedExerciseNotes(storage, userId)).toBeNull();
    storage.setItem(exerciseNotesCacheKey(userId), '{not json');
    expect(readCachedExerciseNotes(storage, userId)).toBeNull();
  });

  it('forgets the notes', () => {
    const storage = new MemoryStorage();
    saveCachedExerciseNotes(storage, userId, notes);
    forgetCachedExerciseNotes(storage, userId);
    expect(readCachedExerciseNotes(storage, userId)).toBeNull();
  });

  it('survives a storage that throws', () => {
    const broken = new MemoryStorage();
    broken.getItem = () => {
      throw new Error('denied');
    };
    broken.setItem = () => {
      throw new Error('quota');
    };
    expect(() => saveCachedExerciseNotes(broken, userId, notes)).not.toThrow();
    expect(readCachedExerciseNotes(broken, userId)).toBeNull();
  });
});

describe('cache-first exercise notes', () => {
  it('shows the cached notes before the live notes arrive, then swaps in and saves the live notes', async () => {
    const storage = new MemoryStorage();
    saveCachedExerciseNotes(storage, userId, { bench: 'Seat 3' });
    const shown: ExerciseNotes[] = [];
    let resolveLive: (live: ExerciseNotes) => void = () => undefined;
    const loading = loadExerciseNotesCacheFirst(
      storage,
      userId,
      () => new Promise((resolve) => (resolveLive = resolve)),
      (shownNotes) => shown.push(shownNotes),
    );
    expect(shown).toEqual([{ bench: 'Seat 3' }]);
    resolveLive(notes);
    await loading;
    expect(shown).toEqual([{ bench: 'Seat 3' }, notes]);
    expect(readCachedExerciseNotes(storage, userId)).toEqual(notes);
  });

  it('keeps the cached notes when the fetch fails', async () => {
    const storage = new MemoryStorage();
    saveCachedExerciseNotes(storage, userId, notes);
    const shown: ExerciseNotes[] = [];
    await loadExerciseNotesCacheFirst(
      storage,
      userId,
      () => Promise.reject(new Error('Failed to fetch')),
      (shownNotes) => shown.push(shownNotes),
    );
    expect(shown).toEqual([notes]);
    expect(readCachedExerciseNotes(storage, userId)).toEqual(notes);
  });

  it('shows nothing when the fetch fails and nothing is cached', async () => {
    const shown: ExerciseNotes[] = [];
    await loadExerciseNotesCacheFirst(
      new MemoryStorage(),
      userId,
      () => Promise.reject(new Error('Failed to fetch')),
      (shownNotes) => shown.push(shownNotes),
    );
    expect(shown).toEqual([]);
  });
});
