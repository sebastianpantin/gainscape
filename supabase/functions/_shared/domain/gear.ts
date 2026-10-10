import type { BalanceConfig } from './balance.ts';
import { GEAR_SLOTS, type GearSlot, ITEM_TIERS, type ItemTier } from './crafting.ts';
import { nonNegativeIntegerPercent } from './math.ts';

export type GearLoadout = Readonly<Partial<Record<GearSlot, ItemTier>>>;

type GearBonusConfig = Pick<BalanceConfig, 'gearBonusPercentAtFullTier'>;

export const GEAR_SLOT_SKILLS: Readonly<Record<GearSlot, readonly string[]>> = Object.freeze({
  belt: Object.freeze(['legs', 'back', 'core']),
  chalk: Object.freeze(['back', 'arms', 'grip']),
  straps: Object.freeze(['back', 'arms', 'grip']),
  sleeves: Object.freeze(['legs', 'arms']),
  shoes: Object.freeze(['legs', 'endurance', 'agility']),
  gloves: Object.freeze(['chest', 'shoulders', 'arms', 'grip']),
});

const BOOSTED_SKILLS: readonly string[] = Object.freeze([...new Set(Object.values(GEAR_SLOT_SKILLS).flat())]);

const PERCENT = 100;

function gearTierPoints(tier: ItemTier | undefined): number {
  return tier === undefined ? 0 : ITEM_TIERS.indexOf(tier) + 1;
}

function slotsTouching(skillKey: string): GearSlot[] {
  return GEAR_SLOTS.filter((slot) => GEAR_SLOT_SKILLS[slot].includes(skillKey));
}

function bonusRatio(
  skillKey: string,
  loadout: GearLoadout | null | undefined,
  cfg: GearBonusConfig,
): { numerator: number; denominator: number } {
  const slots = slotsTouching(skillKey);
  const points = slots.reduce((sum, slot) => sum + gearTierPoints(loadout?.[slot]), 0);
  return {
    numerator: points * nonNegativeIntegerPercent('gearBonusPercentAtFullTier', cfg.gearBonusPercentAtFullTier),
    denominator: PERCENT * ITEM_TIERS.length * Math.max(1, slots.length),
  };
}

export function gearSkillBonus(loadout: GearLoadout | null | undefined, cfg: GearBonusConfig): Record<string, number> {
  return Object.fromEntries(
    BOOSTED_SKILLS.map((skillKey) => {
      const { numerator, denominator } = bonusRatio(skillKey, loadout, cfg);
      return [skillKey, numerator / denominator];
    }),
  );
}

export function gearBonusXp(
  baseXp: number,
  skillKey: string,
  loadout: GearLoadout | null | undefined,
  cfg: GearBonusConfig,
): number {
  const { numerator, denominator } = bonusRatio(skillKey, loadout, cfg);
  return Math.round((baseXp * numerator) / denominator);
}

function isGearSlot(key: string): key is GearSlot {
  return (GEAR_SLOTS as readonly string[]).includes(key);
}

function isItemTier(value: unknown): value is ItemTier {
  return typeof value === 'string' && (ITEM_TIERS as readonly string[]).includes(value);
}

export function gearLoadoutFromStored(value: unknown): GearLoadout | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new RangeError('a stored gear loadout must be an object of slot to tier');
  }
  const loadout: Partial<Record<GearSlot, ItemTier>> = {};
  for (const [slot, tier] of Object.entries(value)) {
    if (!isGearSlot(slot)) throw new RangeError(`unknown gear slot "${slot}" in a stored loadout`);
    if (!isItemTier(tier)) throw new RangeError(`unknown tier ${JSON.stringify(tier)} for gear slot "${slot}"`);
    loadout[slot] = tier;
  }
  return loadout;
}
