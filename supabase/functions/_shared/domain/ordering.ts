import type { SessionKey } from './types.ts';

export function compareSessionKeys(a: SessionKey, b: SessionKey): number {
  const byStart = Date.parse(a.startedAt) - Date.parse(b.startedAt);
  if (byStart !== 0) return byStart;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function isBefore(a: SessionKey, b: SessionKey): boolean {
  return compareSessionKeys(a, b) < 0;
}
