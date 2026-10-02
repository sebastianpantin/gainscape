import { describe, expect, it } from 'vitest';
import { moved } from '../../web/src/lib/reorder.ts';

describe('moved', () => {
  it('swaps an item with its neighbour in the given direction', () => {
    expect(moved(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moved(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('returns a new array and leaves the input alone', () => {
    const items = ['a', 'b'];
    const result = moved(items, 0, 1);
    expect(result).not.toBe(items);
    expect(items).toEqual(['a', 'b']);
  });

  it('returns the same array when the move would leave the list', () => {
    const items = ['a', 'b'];
    expect(moved(items, 0, -1)).toBe(items);
    expect(moved(items, 1, 1)).toBe(items);
  });
});
