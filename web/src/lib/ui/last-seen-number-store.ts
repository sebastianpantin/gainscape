import { z } from 'zod';
import { userCache } from '../../offline/cache-first.ts';
import { keyedStore } from '../platform/keyed-store.ts';

const lastSeenNumbers = userCache('gainscape.last-seen-numbers.v1.', z.record(z.string(), z.number()));
const retiredSeenLevels = keyedStore('gainscape.seen-levels.v1.', (raw) => raw !== null);

export function skillXpMetric(skillKey: string): string {
  return `skill-xp.${skillKey}`;
}

export function readLastSeenNumber(storage: Storage | null, userId: string, metric: string): number | null {
  return lastSeenNumbers.read(storage, userId)?.[metric] ?? null;
}

export function saveLastSeenNumber(storage: Storage | null, userId: string, metric: string, value: number): void {
  if (retiredSeenLevels.read(storage, userId)) retiredSeenLevels.forget(storage, userId);
  const saved = lastSeenNumbers.read(storage, userId);
  if (saved?.[metric] === value) return;
  lastSeenNumbers.save(storage, userId, { ...saved, [metric]: value });
}

export function forgetLastSeenNumbers(storage: Storage | null, userId: string): void {
  lastSeenNumbers.forget(storage, userId);
  retiredSeenLevels.forget(storage, userId);
}
