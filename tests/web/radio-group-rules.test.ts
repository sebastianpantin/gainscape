import { describe, expect, it } from 'vitest';
import { arrowedIndex } from '../../web/src/lib/ui/radio-group-rules.ts';

describe('arrowedIndex', () => {
  it('moves forward on Right and Down and back on Left and Up', () => {
    expect(arrowedIndex('ArrowRight', 1, 4)).toBe(2);
    expect(arrowedIndex('ArrowDown', 1, 4)).toBe(2);
    expect(arrowedIndex('ArrowLeft', 1, 4)).toBe(0);
    expect(arrowedIndex('ArrowUp', 1, 4)).toBe(0);
  });

  it('wraps around at either end', () => {
    expect(arrowedIndex('ArrowRight', 3, 4)).toBe(0);
    expect(arrowedIndex('ArrowLeft', 0, 4)).toBe(3);
  });

  it('ignores every other key', () => {
    expect(arrowedIndex('Enter', 1, 4)).toBeNull();
    expect(arrowedIndex('Tab', 1, 4)).toBeNull();
  });
});
