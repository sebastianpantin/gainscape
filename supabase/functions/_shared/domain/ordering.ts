import type { SessionKey } from './types.ts';

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function compareSessionKeys(a: SessionKey, b: SessionKey): number {
  const byStart = Date.parse(a.startedAt) - Date.parse(b.startedAt);
  if (byStart !== 0) return byStart;
  return compareStrings(a.id, b.id);
}

export function isBefore(a: SessionKey, b: SessionKey): boolean {
  return compareSessionKeys(a, b) < 0;
}
