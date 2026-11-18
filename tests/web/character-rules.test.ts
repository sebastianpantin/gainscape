import { describe, expect, it } from 'vitest';
import {
  BUILD_TIER_MIN_LEVEL,
  characterBuild,
  characterLabel,
  characterLinkLabel,
  characterLook,
  gearLandingTop,
} from '../../web/src/lib/collection/character-rules.ts';
import { type EquippedGear } from '../../web/src/lib/collection/gear-rules.ts';
import { TIER_COLORS } from '../../web/src/lib/collection/item-rules.ts';
import { BADGE_COLORS } from '../../web/src/lib/profile/profile-rules.ts';

const rookieBelt: EquippedGear = {
  slot: 'belt',
  itemId: 'item-rookie-belt',
  itemKey: 'rookie_belt',
  name: 'Rookie belt',
  tier: 'rookie',
};

const titanGloves: EquippedGear = {
  slot: 'gloves',
  itemId: 'item-titan-gloves',
  itemKey: 'titan_gloves',
  name: 'Titan gloves',
  tier: 'titan',
};

const forgedChalk: EquippedGear = {
  slot: 'chalk',
  itemId: 'item-forged-chalk',
  itemKey: 'forged_chalk',
  name: 'Forged chalk',
  tier: 'forged',
};

describe('characterLook', () => {
  it('dresses a character with no gear in the badge colour only', () => {
    expect(characterLook([], 'blue')).toEqual({
      shirt: { fill: BADGE_COLORS.blue.fill, dark: BADGE_COLORS.blue.dark },
      gear: {},
    });
  });

  it('takes its build from the skill levels when they are known', () => {
    expect(characterLook([], 'blue', { arms: 99, shoulders: 99 }).build).toEqual({ arms: 'built', frame: 'lean' });
    expect(characterLook([], 'blue', null)).not.toHaveProperty('build');
  });

  it('tints each equipped slot with its tier colour', () => {
    expect(characterLook([titanGloves, rookieBelt], 'rust').gear).toEqual({
      belt: TIER_COLORS.rookie,
      gloves: TIER_COLORS.titan,
    });
  });
});

describe('characterBuild', () => {
  const levels = (level: number, ...skills: string[]) => Object.fromEntries(skills.map((skill) => [skill, level]));

  it('starts a new lifter lean', () => {
    expect(characterBuild({})).toEqual({ arms: 'lean', frame: 'lean' });
    expect(characterBuild(levels(1, 'arms', 'shoulders', 'chest', 'back', 'legs', 'core'))).toEqual({
      arms: 'lean',
      frame: 'lean',
    });
  });

  it('grows the arms with the average of arms and shoulders', () => {
    expect(BUILD_TIER_MIN_LEVEL).toEqual({ lean: 0, fit: 30, built: 60 });
    expect(characterBuild({ arms: 30, shoulders: 30 }).arms).toBe('fit');
    expect(characterBuild({ arms: 59, shoulders: 1 }).arms).toBe('fit');
    expect(characterBuild({ arms: 58, shoulders: 1 }).arms).toBe('lean');
    expect(characterBuild({ arms: 99, shoulders: 21 }).arms).toBe('built');
    expect(characterBuild({ arms: 99, shoulders: 99 })).toEqual({ arms: 'built', frame: 'lean' });
  });

  it('grows the frame with the average of chest, back, legs and core', () => {
    expect(characterBuild(levels(30, 'chest', 'back', 'legs', 'core'))).toEqual({ arms: 'lean', frame: 'fit' });
    expect(characterBuild({ chest: 99, back: 21 }).frame).toBe('fit');
    expect(characterBuild({ legs: 99, back: 20 }).frame).toBe('lean');
    expect(characterBuild(levels(60, 'chest', 'back', 'legs', 'core')).frame).toBe('built');
  });

  it('ignores the skills that build no muscle', () => {
    expect(characterBuild(levels(99, 'grip', 'endurance', 'agility', 'mobility'))).toEqual({
      arms: 'lean',
      frame: 'lean',
    });
  });
});

describe('characterLabel', () => {
  it('says when the character wears nothing', () => {
    expect(characterLabel([])).toBe('Character with no gear');
  });

  it('says when the gear is hidden', () => {
    expect(characterLabel(null)).toBe('Character, gear hidden');
  });

  it('lists the gear in slot order', () => {
    expect(characterLabel([titanGloves, forgedChalk, rookieBelt])).toBe(
      'Character wearing Rookie belt, Forged chalk and Titan gloves',
    );
  });

  it('says what the character is doing when it is not standing idle', () => {
    expect(characterLabel([], 'idle')).toBe('Character with no gear');
    expect(characterLabel([], 'lifting')).toBe('Character with no gear, lifting');
    expect(characterLabel([rookieBelt], 'flexing')).toBe('Character wearing Rookie belt, flexing after a record');
    expect(characterLabel([rookieBelt], 'resting')).toBe('Character wearing Rookie belt, resting');
  });
});

describe('characterLinkLabel', () => {
  it('names the character and where the link goes', () => {
    expect(characterLinkLabel([])).toBe('Character with no gear. Open Items');
    expect(characterLinkLabel([rookieBelt])).toBe('Character wearing Rookie belt. Open Items');
    expect(characterLinkLabel([rookieBelt], 'lifting')).toBe('Character wearing Rookie belt, lifting. Open Items');
  });
});

describe('gearLandingTop', () => {
  it('places the dropped icon at its slot as a share of the character height', () => {
    expect(gearLandingTop('belt')).toMatch(/^\d+(\.\d+)?%$/);
    expect(parseFloat(gearLandingTop('gloves'))).toBeLessThan(parseFloat(gearLandingTop('shoes')));
    expect(parseFloat(gearLandingTop('shoes'))).toBeLessThan(100);
  });
});
