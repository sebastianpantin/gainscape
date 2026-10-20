import { DEFAULT_BALANCE, type GearLoadout, gearSkillBonus } from '@domain/index.ts';
import { GEAR_SLOTS, type GearSlot, ITEM_TIERS, type ItemTier } from '@domain/crafting.ts';
import { z } from 'zod';
import type { Skill } from '../exercises/catalog-rules.ts';
import { capitalized } from '../names.ts';

export interface EquippedGear {
  slot: GearSlot;
  itemId: string;
  itemKey: string;
  name: string;
  tier: ItemTier;
}

export interface LoadoutView {
  userId: string;
  slots: EquippedGear[];
}

export const loadoutViewSchema = z
  .object({
    userId: z.string(),
    slots: z.array(
      z.object({
        slot: z.enum(GEAR_SLOTS),
        itemId: z.string(),
        itemKey: z.string(),
        name: z.string(),
        tier: z.enum(ITEM_TIERS),
      }),
    ),
  })
  .nullable();

interface LoadoutSlotRow {
  slot: GearSlot;
  label: string;
  gear: EquippedGear | null;
}

interface GearBonusRow {
  skillKey: string;
  skillName: string;
  percent: string;
}

export function formatGearBonusPercent(fraction: number): string {
  return `+${(fraction * 100).toFixed(1).replace(/\.0$/, '')}%`;
}

export function loadoutBySlot(slots: readonly EquippedGear[]): LoadoutSlotRow[] {
  return GEAR_SLOTS.map((slot) => ({
    slot,
    label: capitalized(slot),
    gear: slots.find((equipped) => equipped.slot === slot) ?? null,
  }));
}

const GEAR_LIST = new Intl.ListFormat('en-GB', { type: 'conjunction' });

export function equippedGearLabel(slots: readonly EquippedGear[]): string {
  return `Loadout: ${GEAR_LIST.format(loadoutBySlot(slots).flatMap((row) => row.gear?.name ?? []))}. Open Items`;
}

function gearLoadoutOf(slots: readonly EquippedGear[]): GearLoadout {
  return Object.fromEntries(slots.map((equipped) => [equipped.slot, equipped.tier]));
}

export function bonusRows(
  slots: readonly EquippedGear[],
  skills: readonly Pick<Skill, 'key' | 'name'>[],
): GearBonusRow[] {
  const bonusBySkill = gearSkillBonus(gearLoadoutOf(slots), DEFAULT_BALANCE);
  return skills
    .filter((skill) => (bonusBySkill[skill.key] ?? 0) > 0)
    .map((skill) => ({
      skillKey: skill.key,
      skillName: skill.name,
      percent: formatGearBonusPercent(bonusBySkill[skill.key]),
    }));
}
