import type { GearSlot } from '@domain/crafting.ts';
import {
  CHARACTER_ROWS,
  type CharacterLook,
  type CharacterPose,
  gearLandingRow,
} from '../../components/character-sprites.ts';
import { type BadgeColor, BADGE_COLORS } from '../profile/profile-rules.ts';
import { type EquippedGear, loadoutBySlot } from './gear-rules.ts';
import { TIER_COLORS } from './item-rules.ts';

const GEAR_LIST = new Intl.ListFormat('en-GB', { type: 'conjunction' });

const POSE_PHRASE: Record<CharacterPose, string | null> = {
  idle: null,
  lifting: 'lifting',
  flexing: 'flexing after a record',
  resting: 'resting',
};

export function characterLook(slots: readonly EquippedGear[], badgeColor: BadgeColor): CharacterLook {
  const { fill, dark } = BADGE_COLORS[badgeColor];
  return {
    shirt: { fill, dark },
    gear: Object.fromEntries(slots.map((equipped) => [equipped.slot, TIER_COLORS[equipped.tier]])),
  };
}

function wornText(slots: readonly EquippedGear[] | null): string {
  if (slots === null) return 'Character, gear hidden';
  const names = loadoutBySlot(slots).flatMap((row) => row.gear?.name ?? []);
  return names.length === 0 ? 'Character with no gear' : `Character wearing ${GEAR_LIST.format(names)}`;
}

export function characterLabel(slots: readonly EquippedGear[] | null, pose: CharacterPose = 'idle'): string {
  const doing = POSE_PHRASE[pose];
  return doing === null ? wornText(slots) : `${wornText(slots)}, ${doing}`;
}

export function characterLinkLabel(slots: readonly EquippedGear[], pose: CharacterPose = 'idle'): string {
  return `${characterLabel(slots, pose)}. Open Items`;
}

export function gearLandingTop(slot: GearSlot): string {
  return `${(((gearLandingRow(slot) + 0.5) / CHARACTER_ROWS) * 100).toFixed(1)}%`;
}
