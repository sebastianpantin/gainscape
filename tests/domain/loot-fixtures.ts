import { createHash } from 'node:crypto';
import {
  type LootCandidate,
  type LootDayState,
  type LootTable,
  type LootTables,
  type Rng,
  type RollKind,
  sfc32FromSeed,
} from '@domain/index.ts';

const entry = (itemKey: string, weight: number, minQuantity = 1, maxQuantity = minQuantity) => ({
  itemId: `item-${itemKey}`,
  itemKey,
  weight,
  minQuantity,
  maxQuantity,
});

export const REGULAR_FIXTURE: LootTable = {
  id: 'table-regular',
  key: 'regular',
  entries: [entry('scraps', 30, 2, 5), entry('belt', 5), entry('gem', 1), entry('shards', 14, 1, 3)],
};

const RARE_FIXTURE: LootTable = {
  id: 'table-rare',
  key: 'rare',
  entries: [entry('scroll', 5), entry('pet', 1), entry('ingot', 20, 2, 4)],
};

export const FIXTURE_TABLES: LootTables = { regular: REGULAR_FIXTURE, rare: RARE_FIXTURE };

export const FRESH_DAY: LootDayState = { regularUsed: 0, prUsed: 0, dryRolls: 0, alreadyRolled: new Set() };

export function candidate(setId: string, position: number, overrides: Partial<LootCandidate> = {}): LootCandidate {
  return {
    setId,
    position,
    kind: 'lift',
    effectiveReps: 3,
    countedWorkS: 0,
    interval: false,
    personalRecord: false,
    builtIn: true,
    ...overrides,
  };
}

export function fixedSeed(label: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(label).digest());
}

export function fixedRngFor(prefix: string): (setId: string, kind: RollKind) => Rng {
  return (setId, kind) => sfc32FromSeed(fixedSeed(`${prefix}:${setId}:${kind}`));
}

export function scriptedRng(values: readonly number[]): Rng {
  let index = 0;
  return { next: () => values[Math.min(index++, values.length - 1)] };
}
