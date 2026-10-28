import type { EffortInput } from '@domain/types.ts';

export const SET_MENU_GAP_PX = 4;

interface SetMenuAnchor {
  top: number;
  bottom: number;
  right: number;
}

interface SetMenuViewport {
  width: number;
  height: number;
}

interface SetMenuPlacement {
  top: number | null;
  bottom: number | null;
  right: number;
}

export function setMenuPlacement(
  anchor: SetMenuAnchor,
  viewport: SetMenuViewport,
  menuHeight: number,
): SetMenuPlacement {
  const right = Math.max(0, viewport.width - anchor.right);
  const roomBelow = viewport.height - anchor.bottom;
  const fitsBelow = roomBelow >= menuHeight + SET_MENU_GAP_PX;
  if (fitsBelow || anchor.top <= roomBelow) return { top: anchor.bottom + SET_MENU_GAP_PX, bottom: null, right };
  return { top: null, bottom: viewport.height - anchor.top + SET_MENU_GAP_PX, right };
}

export function rowToFocusAfterRemoving(rowIds: readonly string[], removedId: string): string | null {
  const index = rowIds.indexOf(removedId);
  if (index === -1) return null;
  return rowIds[index + 1] ?? rowIds[index - 1] ?? null;
}

interface ClearEffortAction {
  label: string;
  accessibleName: string;
  onChoose: () => void;
}

export function clearEffortAction(effort: EffortInput, setNumber: number, onChoose: () => void): ClearEffortAction[] {
  return effort === null ? [] : [{ label: 'Clear effort', accessibleName: `Clear effort set ${setNumber}`, onChoose }];
}
