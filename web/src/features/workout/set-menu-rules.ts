export const SET_MENU_GAP_PX = 4;

export interface SetMenuAnchor {
  top: number;
  bottom: number;
  right: number;
}

export interface SetMenuViewport {
  width: number;
  height: number;
}

export interface SetMenuPlacement {
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
