import { describe, expect, it } from 'vitest';
import { type CollectionRows } from '../../web/src/lib/collection-rules.ts';
import { collectionCache } from '../../web/src/offline/collection-cache.ts';
import { MemoryStorage } from './memory-storage.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const ROWS: CollectionRows = {
  repMaxes: [{ exercise_id: 'bench', reps: 5, load_kg: '100.5', exact_set_id: 'set-1' }],
  bodyweightRecords: [{ exercise_id: 'pull-up', max_reps: 12 }],
  strengths: [{ exercise_id: 'bench', e1rm_kg: 117.25, reps_capacity: null }],
  pins: [{ exercise_id: 'squat', position: 0 }],
  cardioRecords: [{ exercise_id: 'run', kind: 'distance', value: '5000' }],
};

describe('saved collection log', () => {
  it('reads back the saved collection rows for the same user', () => {
    const storage = new MemoryStorage();
    collectionCache.save(storage, USER_ID, ROWS);
    expect(collectionCache.read(storage, USER_ID)).toEqual(ROWS);
  });

  it('ignores a saved cardio record of an unknown kind', () => {
    const storage = new MemoryStorage();
    collectionCache.save(storage, USER_ID, {
      ...ROWS,
      cardioRecords: [{ exercise_id: 'run', kind: 'height' as 'distance', value: 1 }],
    });
    expect(collectionCache.read(storage, USER_ID)).toBeNull();
  });
});
