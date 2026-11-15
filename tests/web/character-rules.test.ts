import { describe, expect, it } from 'vitest';
import {
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

  it('tints each equipped slot with its tier colour', () => {
    expect(characterLook([titanGloves, rookieBelt], 'rust').gear).toEqual({
      belt: TIER_COLORS.rookie,
      gloves: TIER_COLORS.titan,
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
});

describe('characterLinkLabel', () => {
  it('names the character and where the link goes', () => {
    expect(characterLinkLabel([])).toBe('Character with no gear. Open Items');
    expect(characterLinkLabel([rookieBelt])).toBe('Character wearing Rookie belt. Open Items');
  });
});

describe('gearLandingTop', () => {
  it('places the dropped icon at its slot as a share of the character height', () => {
    expect(gearLandingTop('belt')).toMatch(/^\d+(\.\d+)?%$/);
    expect(parseFloat(gearLandingTop('gloves'))).toBeLessThan(parseFloat(gearLandingTop('shoes')));
    expect(parseFloat(gearLandingTop('shoes'))).toBeLessThan(100);
  });
});
