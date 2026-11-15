import type { DropSummary } from '@domain/types.ts';
import { type CatalogItem, type Fanfare, fanfareFor, ITEM_RARITIES } from '../../lib/collection/item-rules.ts';

export const LOOT_SEQUENCE_MAX_S = 3.5;
const LID_OPEN_S = 0.35;
const LANDING_S = 0.5;

export type LootBeat = 'plain' | 'rare' | 'legendary' | 'pet';

const GAP_BEFORE_S: Record<LootBeat, number> = { plain: 0.2, rare: 0.45, legendary: 0.9, pet: 0.9 };

export interface LootStep {
  drop: DropSummary;
  item: CatalogItem | null;
  beat: LootBeat;
  landsAtS: number;
}

export interface LootSequence {
  steps: LootStep[];
  fanfare: { kind: Fanfare; atS: number } | null;
  shakeAtS: number | null;
  endS: number;
}

function beatOf(item: CatalogItem | null): LootBeat {
  if (item === null) return 'plain';
  if (item.kind === 'pet') return 'pet';
  if (item.rarity === 'legendary' || item.rarity === 'rare') return item.rarity;
  return 'plain';
}

function rank(item: CatalogItem | null): number {
  if (item === null) return -1;
  return ITEM_RARITIES.indexOf(item.rarity) + (item.kind === 'pet' ? ITEM_RARITIES.length : 0);
}

function roundedS(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

export function lootSequence(drops: readonly DropSummary[], items: readonly CatalogItem[]): LootSequence {
  if (drops.length === 0) return { steps: [], fanfare: null, shakeAtS: null, endS: 0 };
  const ordered = drops
    .map((drop) => ({ drop, item: items.find((candidate) => candidate.id === drop.itemId) ?? null }))
    .sort((left, right) => rank(left.item) - rank(right.item));
  const gaps = ordered.map(({ item }) => GAP_BEFORE_S[beatOf(item)]);
  const gapTotalS = gaps.reduce((sum, gap) => sum + gap, 0);
  const squeeze = Math.min(1, (LOOT_SEQUENCE_MAX_S - LID_OPEN_S - LANDING_S) / gapTotalS);
  let cursor = LID_OPEN_S;
  const steps = ordered.map(({ drop, item }, index) => {
    cursor += (gaps[index] ?? 0) * squeeze;
    return { drop, item, beat: beatOf(item), landsAtS: roundedS(cursor) };
  });
  const fanfareKind = fanfareFor(steps.flatMap((step) => step.item?.rarity ?? []));
  const fanfareStep = steps.find((step) => step.item?.rarity === fanfareKind);
  const shakeStep = steps.find((step) => step.beat === 'legendary' || step.beat === 'pet');
  return {
    steps,
    fanfare: fanfareKind && fanfareStep ? { kind: fanfareKind, atS: fanfareStep.landsAtS } : null,
    shakeAtS: shakeStep?.landsAtS ?? null,
    endS: roundedS(cursor + LANDING_S),
  };
}
