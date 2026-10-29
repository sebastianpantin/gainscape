import { z } from 'zod';
import { userCache } from '../../offline/cache-first.ts';
import { keyedStore } from '../platform/keyed-store.ts';

const lastSeenNumbers = userCache('gainscape.last-seen-numbers.v1.', z.record(z.string(), z.number()));
const retiredSeenLevels = keyedStore('gainscape.seen-levels.v1.', () => null);

export function skillXpMetric(skillKey: string): string {
  return `skill-xp.${skillKey}`;
}

export function readLastSeenNumber(storage: Storage | null, userId: string, metric: string): number | null {
  return lastSeenNumbers.read(storage, userId)?.[metric] ?? null;
}

export function saveLastSeenNumber(storage: Storage | null, userId: string, metric: string, value: number): void {
  lastSeenNumbers.save(storage, userId, { ...lastSeenNumbers.read(storage, userId), [metric]: value });
  retiredSeenLevels.forget(storage, userId);
}

export function forgetLastSeenNumbers(storage: Storage | null, userId: string): void {
  lastSeenNumbers.forget(storage, userId);
  retiredSeenLevels.forget(storage, userId);
}
