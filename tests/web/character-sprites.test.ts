import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GEAR_SLOTS, type GearSlot, ITEM_TIERS } from '../../supabase/functions/_shared/domain/crafting.ts';
import {
  CHARACTER_COLS,
  CHARACTER_ROWS,
  type CharacterLook,
  characterFrames,
  gearLandingRow,
  IDLE_BOB_ROWS,
} from '../../web/src/components/character-sprites.ts';
import { type Sprite } from '../../web/src/components/pixel-sprites.ts';
import { TIER_COLORS } from '../../web/src/lib/collection/item-rules.ts';
import { BADGE_COLORS, BADGE_COLOR_KEYS } from '../../web/src/lib/profile/profile-rules.ts';

const root = join(import.meta.dirname, '../..');
const tokenColours = new Set(
  [...readFileSync(join(root, 'web/src/styles/tokens.css'), 'utf8').matchAll(/#[0-9a-f]{3,6}\b/gi)].map((match) =>
    match[0].toLowerCase(),
  ),
);

const TOKEN_SHIRT = { fill: '#6fa8dc', dark: '#3d7dd8' };
const GEAR_TINT = '#b784e0';

function lookWith(gear: CharacterLook['gear'], shirt = TOKEN_SHIRT): CharacterLook {
  return { shirt, gear };
}

function fullLoadout(color: string): CharacterLook['gear'] {
  return Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, color]));
}

function fills(sprite: Sprite): Set<string> {
  return new Set(sprite.pixels.map((pixel) => pixel.fill.toLowerCase()));
}

function pixelsIn(sprite: Sprite, fill: string) {
  return sprite.pixels.filter((pixel) => pixel.fill === fill && pixel.opacity === undefined);
}

function expectInBounds(sprite: Sprite) {
  expect([sprite.cols, sprite.rows]).toEqual([CHARACTER_COLS, CHARACTER_ROWS]);
  for (const pixel of sprite.pixels) {
    expect(pixel.x).toBeGreaterThanOrEqual(0);
    expect(pixel.y).toBeGreaterThanOrEqual(0);
    expect(pixel.w).toBeGreaterThan(0);
    expect(pixel.h).toBeGreaterThan(0);
    expect(pixel.x + pixel.w).toBeLessThanOrEqual(sprite.cols);
    expect(pixel.y + pixel.h).toBeLessThanOrEqual(sprite.rows);
  }
}

describe('characterFrames', () => {
  it('draws a bare character on a 24 by 32 grid in token colours only', () => {
    for (const frame of characterFrames(lookWith({}))) {
      expectInBounds(frame);
      for (const fill of fills(frame)) expect(tokenColours.has(fill), fill).toBe(true);
    }
  });

  it.each(GEAR_SLOTS.flatMap((slot) => ITEM_TIERS.map((tier) => [slot, tier] as const)))(
    'keeps %s in the %s tier inside the grid in both frames',
    (slot, tier) => {
      for (const frame of characterFrames(lookWith({ [slot]: TIER_COLORS[tier] }))) expectInBounds(frame);
    },
  );

  it.each(GEAR_SLOTS)('shows %s in its tint and changes the picture', (slot: GearSlot) => {
    const [bare] = characterFrames(lookWith({}));
    const [dressed] = characterFrames(lookWith({ [slot]: GEAR_TINT }));
    expect(dressed).not.toEqual(bare);
    expect(pixelsIn(dressed, GEAR_TINT).length).toBeGreaterThan(0);
  });

  it('paints everything but the shirt and the gear in token colours with every slot filled', () => {
    for (const frame of characterFrames(lookWith(fullLoadout(GEAR_TINT)))) {
      expectInBounds(frame);
      for (const fill of fills(frame)) {
        if (fill === GEAR_TINT) continue;
        expect(tokenColours.has(fill), fill).toBe(true);
      }
    }
  });

  it.each(BADGE_COLOR_KEYS)('wears a %s shirt in the badge fill', (badge) => {
    const shirt = { fill: BADGE_COLORS[badge].fill, dark: BADGE_COLORS[badge].dark };
    const [frame] = characterFrames(lookWith({}, shirt));
    expect(pixelsIn(frame, shirt.fill).length).toBeGreaterThan(0);
    expect(pixelsIn(frame, shirt.dark).length).toBeGreaterThan(0);
  });

  it('bobs the head down in the second frame while the feet stay planted', () => {
    const [still, bobbed] = characterFrames(lookWith({}));
    const top = (sprite: Sprite) => Math.min(...sprite.pixels.map((pixel) => pixel.y));
    const bottom = (sprite: Sprite) => Math.max(...sprite.pixels.map((pixel) => pixel.y + pixel.h));
    expect(top(bobbed)).toBe(top(still) + IDLE_BOB_ROWS);
    expect(bottom(bobbed)).toBe(bottom(still));
  });

  it('moves gloves with the arms and leaves shoes on the ground', () => {
    const [stillGloves, bobbedGloves] = characterFrames(lookWith({ gloves: GEAR_TINT }));
    expect(pixelsIn(bobbedGloves, GEAR_TINT)).toEqual(
      pixelsIn(stillGloves, GEAR_TINT).map((pixel) => ({ ...pixel, y: pixel.y + IDLE_BOB_ROWS })),
    );
    const [stillShoes, bobbedShoes] = characterFrames(lookWith({ shoes: GEAR_TINT }));
    expect(pixelsIn(bobbedShoes, GEAR_TINT)).toEqual(pixelsIn(stillShoes, GEAR_TINT));
  });
});

describe('gearLandingRow', () => {
  it.each(GEAR_SLOTS)('lands %s on a row its own layer paints', (slot: GearSlot) => {
    const [dressed] = characterFrames(lookWith({ [slot]: GEAR_TINT }));
    const rows = new Set(pixelsIn(dressed, GEAR_TINT).map((pixel) => pixel.y));
    expect(rows.has(gearLandingRow(slot))).toBe(true);
  });

  it('lands gloves above shoes and the belt above sleeves', () => {
    expect(gearLandingRow('gloves')).toBeLessThan(gearLandingRow('shoes'));
    expect(gearLandingRow('belt')).toBeLessThan(gearLandingRow('sleeves'));
  });
});
