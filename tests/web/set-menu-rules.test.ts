import { describe, expect, it } from 'vitest';
import {
  rowToFocusAfterRemoving,
  SET_MENU_GAP_PX,
  setMenuPlacement,
} from '../../web/src/features/workout/set-menu-rules.ts';

const VIEWPORT = { width: 412, height: 839 };
const MENU_HEIGHT = 120;

describe('setMenuPlacement', () => {
  it('opens below the button, its right edge lined up with the button', () => {
    expect(setMenuPlacement({ top: 200, bottom: 244, right: 396 }, VIEWPORT, MENU_HEIGHT)).toEqual({
      top: 244 + SET_MENU_GAP_PX,
      bottom: null,
      right: 412 - 396,
    });
  });

  it('opens above the button when the menu would run past the bottom of the screen', () => {
    expect(setMenuPlacement({ top: 700, bottom: 744, right: 396 }, VIEWPORT, MENU_HEIGHT)).toEqual({
      top: null,
      bottom: 839 - 700 + SET_MENU_GAP_PX,
      right: 16,
    });
  });

  it('stays below when it just fits', () => {
    const bottom = 839 - MENU_HEIGHT - SET_MENU_GAP_PX;
    expect(setMenuPlacement({ top: bottom - 44, bottom, right: 396 }, VIEWPORT, MENU_HEIGHT).top).toBe(
      bottom + SET_MENU_GAP_PX,
    );
  });

  it('opens below when there is no more room above than below', () => {
    expect(setMenuPlacement({ top: 60, bottom: 104, right: 396 }, { width: 412, height: 200 }, MENU_HEIGHT)).toEqual({
      top: 104 + SET_MENU_GAP_PX,
      bottom: null,
      right: 16,
    });
  });

  it('never lets the menu start past the left or right edge of the screen', () => {
    expect(setMenuPlacement({ top: 200, bottom: 244, right: 500 }, VIEWPORT, MENU_HEIGHT).right).toBe(0);
  });
});

describe('rowToFocusAfterRemoving', () => {
  it('moves to the next row', () => {
    expect(rowToFocusAfterRemoving(['a', 'b', 'c'], 'b')).toBe('c');
  });

  it('moves to the previous row when the last row is removed', () => {
    expect(rowToFocusAfterRemoving(['a', 'b', 'c'], 'c')).toBe('b');
  });

  it('has no row to move to when the only row is removed or the row is unknown', () => {
    expect(rowToFocusAfterRemoving(['a'], 'a')).toBeNull();
    expect(rowToFocusAfterRemoving(['a', 'b'], 'z')).toBeNull();
  });
});
