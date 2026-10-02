export const EDIT_WINDOW_DAYS = 7;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isWithinEditWindow(startedAt: string, now: number): boolean {
  return Date.parse(startedAt) >= now - EDIT_WINDOW_DAYS * MS_PER_DAY;
}

export interface EditableSession {
  historyOnly: boolean;
  startedAt: string;
}

export function isSessionEditable(session: EditableSession, now: number): boolean {
  return !session.historyOnly && isWithinEditWindow(session.startedAt, now);
}
