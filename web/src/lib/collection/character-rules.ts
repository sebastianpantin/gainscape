import type { GearSlot } from '@domain/crafting.ts';
import {
  BUILD_TIERS,
  type BuildTier,
  CHARACTER_ROWS,
  type CharacterBuild,
  type CharacterLook,
  type CharacterPose,
  gearLandingRow,
} from '../../components/character-sprites.ts';
import { type BadgeColor, BADGE_COLORS } from '../profile/profile-rules.ts';
import { type SkillLevels } from '../progress/standing-rules.ts';
import { highestReached } from '../progress/tier-rules.ts';
import { type EquippedGear, loadoutBySlot } from './gear-rules.ts';
import { TIER_COLORS } from './item-rules.ts';

const GEAR_LIST = new Intl.ListFormat('en-GB', { type: 'conjunction' });

const POSE_PHRASE: Record<CharacterPose, string | null> = {
  idle: null,
  lifting: 'lifting',
  flexing: 'flexing after a record',
  resting: 'resting',
};

export const BUILD_TIER_MIN_LEVEL: Record<BuildTier, number> = { lean: 0, fit: 30, built: 60 };

const ARM_SKILLS = ['arms', 'shoulders'] as const;
const FRAME_SKILLS = ['chest', 'back', 'legs', 'core'] as const;

function buildTier(skills: readonly string[], skillLevels: SkillLevels): BuildTier {
  const meanLevel = skills.reduce((sum, skill) => sum + (skillLevels[skill] ?? 0), 0) / skills.length;
  return highestReached(BUILD_TIERS, BUILD_TIER_MIN_LEVEL, meanLevel) ?? 'lean';
}

export function characterBuild(skillLevels: SkillLevels): CharacterBuild {
  return { arms: buildTier(ARM_SKILLS, skillLevels), frame: buildTier(FRAME_SKILLS, skillLevels) };
}

export function characterLook(
  slots: readonly EquippedGear[],
  badgeColor: BadgeColor,
  skillLevels: SkillLevels | null = null,
): CharacterLook {
  const { fill, dark } = BADGE_COLORS[badgeColor];
  return {
    shirt: { fill, dark },
    gear: Object.fromEntries(slots.map((equipped) => [equipped.slot, TIER_COLORS[equipped.tier]])),
    ...(skillLevels && { build: characterBuild(skillLevels) }),
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
