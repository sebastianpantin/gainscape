import { DEFAULT_BALANCE, type GearLoadout, gearSkillBonus } from '@domain/index.ts';
import { GEAR_SLOTS, type GearSlot, type ItemTier } from '@domain/crafting.ts';
import type { Skill } from './catalog-rules.ts';
import { capitalized } from './names.ts';

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

export interface LoadoutSlotRow {
  slot: GearSlot;
  label: string;
  gear: EquippedGear | null;
}

export interface GearBonusRow {
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
