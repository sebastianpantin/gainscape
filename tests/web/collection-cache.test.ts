import { describe, expect, it } from 'vitest';
import { saveCachedExercises } from '../../web/src/lib/catalog-cache.ts';
import { type Exercise } from '../../web/src/lib/catalog-rules.ts';
import { type CollectionRows } from '../../web/src/lib/collection-rules.ts';
import { collectionCache, savedExerciseList } from '../../web/src/offline/collection-cache.ts';
import { MemoryStorage } from './memory-storage.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const ROWS: CollectionRows = {
  repMaxes: [{ exercise_id: 'bench', reps: 5, load_kg: '100.5', exact_set_id: 'set-1' }],
  bodyweightRecords: [{ exercise_id: 'pull-up', max_reps: 12 }],
  strengths: [{ exercise_id: 'bench', e1rm_kg: 117.25, reps_capacity: null }],
  pins: [{ exercise_id: 'squat', position: 0 }],
  cardioRecords: [{ exercise_id: 'run', kind: 'distance', value: '5000' }],
};

const ACTIVE: Exercise = {
  id: 'bench',
  key: 'bench',
  name: 'Barbell Bench Press',
  equipment: 'barbell',
  custom: false,
  archived: false,
  skillShares: [],
  modality: 'lift',
  loadType: 'external',
  compound: true,
};

const ARCHIVED: Exercise = { ...ACTIVE, id: 'old-press', key: null, name: 'Old press', custom: true, archived: true };

describe('saved collection log', () => {
  it('reads back the saved rows and the full exercise list, archived ones included, for the same user', () => {
    const storage = new MemoryStorage();
    collectionCache.save(storage, USER_ID, { exercises: [ACTIVE, ARCHIVED], rows: ROWS });
    expect(collectionCache.read(storage, USER_ID)).toEqual({ exercises: [ACTIVE, ARCHIVED], rows: ROWS });
  });

  it('ignores a saved cardio record of an unknown kind', () => {
    const storage = new MemoryStorage();
    collectionCache.save(storage, USER_ID, {
      exercises: [ACTIVE],
      rows: { ...ROWS, cardioRecords: [{ exercise_id: 'run', kind: 'height' as 'distance', value: 1 }] },
    });
    expect(collectionCache.read(storage, USER_ID)).toBeNull();
  });
});

describe('the saved exercise list for offline screens', () => {
  it('prefers the full list saved with the collection log', () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, USER_ID, [ACTIVE]);
    collectionCache.save(storage, USER_ID, { exercises: [ACTIVE, ARCHIVED], rows: ROWS });
    expect(savedExerciseList(storage, USER_ID)).toEqual([ACTIVE, ARCHIVED]);
  });

  it('falls back to the training list when the collection log was never saved', () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, USER_ID, [ACTIVE]);
    expect(savedExerciseList(storage, USER_ID)).toEqual([ACTIVE]);
  });

  it('has nothing without storage', () => {
    expect(savedExerciseList(null, USER_ID)).toBeNull();
  });
});
