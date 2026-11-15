import { type CharacterLook } from '../../components/character-sprites.ts';
import { type BadgeColor, BADGE_COLORS } from '../profile/profile-rules.ts';
import { type EquippedGear, loadoutBySlot } from './gear-rules.ts';
import { TIER_COLORS } from './item-rules.ts';

const GEAR_LIST = new Intl.ListFormat('en-GB', { type: 'conjunction' });

export function characterLook(slots: readonly EquippedGear[], badgeColor: BadgeColor): CharacterLook {
  const { fill, dark } = BADGE_COLORS[badgeColor];
  return {
    shirt: { fill, dark },
    gear: Object.fromEntries(slots.map((equipped) => [equipped.slot, TIER_COLORS[equipped.tier]])),
  };
}

export function characterLabel(slots: readonly EquippedGear[]): string {
  const names = loadoutBySlot(slots).flatMap((row) => row.gear?.name ?? []);
  return names.length === 0 ? 'Character with no gear' : `Character wearing ${GEAR_LIST.format(names)}`;
}
