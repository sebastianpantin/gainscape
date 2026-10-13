import { describe, expect, it } from 'vitest';
import { exerciseKeys } from '../../web/src/lib/exercises/exercise-key-rules.ts';

const listOf = (...exerciseIds: string[]) => exerciseIds.map((exerciseId) => ({ exerciseId }));

describe('exerciseKeys', () => {
  it('gives every exercise a distinct key, counting repeats of the same exercise', () => {
    expect(exerciseKeys(listOf('bench', 'row', 'bench'))).toEqual(['bench-0', 'row-0', 'bench-1']);
  });

  it('keeps the keys of the other exercises when one is removed', () => {
    const before = exerciseKeys(listOf('squat', 'bench', 'row'));
    const after = exerciseKeys(listOf('bench', 'row'));
    expect(after).toEqual(before.slice(1));
  });

  it('keeps the keys when exercises move', () => {
    expect(exerciseKeys(listOf('row', 'bench'))).toEqual([...exerciseKeys(listOf('bench', 'row'))].reverse());
  });
});
