import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GEAR_SLOTS, type GearSlot, ITEM_TIERS } from '../../supabase/functions/_shared/domain/crafting.ts';
import {
  BUILD_TIERS,
  CHARACTER_COLS,
  CHARACTER_POSES,
  CHARACTER_ROWS,
  type CharacterLook,
  characterFrames,
  FLEX_HOP_ROWS,
  gearLandingRow,
  IDLE_BOB_ROWS,
  LIFT_DIP_ROWS,
  REST_SIT_ROWS,
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

const TINTED_HAND_GEAR: readonly GearSlot[] = ['gloves', 'straps'];
const CHALK_DUST = '#f0e6d0';
const WEIGHT_RED = '#d64541';

function top(sprite: Sprite): number {
  return Math.min(...sprite.pixels.map((pixel) => pixel.y));
}

function bottom(sprite: Sprite): number {
  return Math.max(...sprite.pixels.map((pixel) => pixel.y + pixel.h));
}

function topOf(sprite: Sprite, fill: string): number {
  return Math.min(...pixelsIn(sprite, fill).map((pixel) => pixel.y));
}

describe('character poses', () => {
  it.each(CHARACTER_POSES)('draws %s inside the grid in token colours, bare and fully dressed', (pose) => {
    for (const gear of [{}, fullLoadout(GEAR_TINT)])
      for (const frame of characterFrames(lookWith(gear), pose)) {
        expectInBounds(frame);
        for (const fill of fills(frame)) {
          if (fill === GEAR_TINT) continue;
          expect(tokenColours.has(fill), fill).toBe(true);
        }
      }
  });

  it('stands idle unless told otherwise', () => {
    expect(characterFrames(lookWith({}))).toEqual(characterFrames(lookWith({}), 'idle'));
  });

  it.each(CHARACTER_POSES.filter((pose) => pose !== 'idle'))(
    'draws %s unlike idle and moves between frames',
    (pose) => {
      const [first, second] = characterFrames(lookWith({}), pose);
      expect(first).not.toEqual(characterFrames(lookWith({}))[0]);
      expect(second).not.toEqual(first);
    },
  );

  it('holds a weight in each hand while lifting and dips deeper than the idle bob', () => {
    const [up, down] = characterFrames(lookWith({}), 'lifting');
    expect(pixelsIn(characterFrames(lookWith({}))[0], WEIGHT_RED)).toEqual([]);
    expect(new Set(pixelsIn(up, WEIGHT_RED).map((pixel) => pixel.x < CHARACTER_COLS / 2)).size).toBe(2);
    expect(top(down)).toBe(top(up) + LIFT_DIP_ROWS);
    expect(topOf(down, WEIGHT_RED)).toBe(topOf(up, WEIGHT_RED) + LIFT_DIP_ROWS);
    expect(bottom(down)).toBe(bottom(up));
    expect(LIFT_DIP_ROWS).toBeGreaterThan(IDLE_BOB_ROWS);
  });

  it('dusts the raised fists with chalk while flexing and keeps the bag on the hip', () => {
    const [idle] = characterFrames(lookWith({ chalk: GEAR_TINT }));
    const [flexing] = characterFrames(lookWith({ chalk: GEAR_TINT }), 'flexing');
    expect(topOf(flexing, CHALK_DUST)).toBeLessThan(CHARACTER_ROWS / 4);
    expect(topOf(flexing, GEAR_TINT)).toBe(topOf(idle, GEAR_TINT));
  });

  it.each(TINTED_HAND_GEAR)('raises %s with the fists while flexing', (slot) => {
    const [idle] = characterFrames(lookWith({ [slot]: GEAR_TINT }));
    const [flexing] = characterFrames(lookWith({ [slot]: GEAR_TINT }), 'flexing');
    expect(topOf(flexing, GEAR_TINT)).toBeLessThan(topOf(idle, GEAR_TINT));
    expect(topOf(flexing, GEAR_TINT)).toBeLessThan(CHARACTER_ROWS / 4);
  });

  it('hops off the ground in the second flexing frame', () => {
    const [grounded, hopped] = characterFrames(lookWith(fullLoadout(GEAR_TINT)), 'flexing');
    expect(top(hopped)).toBe(top(grounded) - FLEX_HOP_ROWS);
    expect(bottom(hopped)).toBe(bottom(grounded) - FLEX_HOP_ROWS);
  });

  it('sits lower while resting, feet on the ground, with closed eyes', () => {
    const [idle] = characterFrames(lookWith({}));
    const [resting, breathing] = characterFrames(lookWith({}), 'resting');
    const head = (sprite: Sprite) => topOf(sprite, '#7a6a52');
    expect(head(resting)).toBe(head(idle) + REST_SIT_ROWS);
    expect(head(breathing)).toBe(head(resting) + IDLE_BOB_ROWS);
    expect(bottom(resting)).toBe(bottom(idle));
    const eyeRow = head(idle) + 4;
    const inked = (sprite: Sprite, row: number) =>
      pixelsIn(sprite, '#000').filter((pixel) => pixel.y === row && pixel.w === 1 && pixel.x > 8 && pixel.x < 15);
    expect(inked(idle, eyeRow).length).toBe(2);
    expect(inked(resting, eyeRow + REST_SIT_ROWS)).toEqual([]);
  });
});

const EVERY_BUILD = BUILD_TIERS.flatMap((arms) => BUILD_TIERS.map((frame) => ({ arms, frame })));
const HAIR = '#7a6a52';

function width(sprite: Sprite): number {
  const left = Math.min(...sprite.pixels.map((pixel) => pixel.x));
  const right = Math.max(...sprite.pixels.map((pixel) => pixel.x + pixel.w));
  return right - left;
}

describe('character builds', () => {
  it.each(EVERY_BUILD)('keeps arms $arms on a $frame frame inside the grid in every pose, fully dressed', (build) => {
    for (const pose of CHARACTER_POSES)
      for (const frame of characterFrames({ ...lookWith(fullLoadout(GEAR_TINT)), build }, pose)) expectInBounds(frame);
  });

  it('draws a fit build when none is given', () => {
    expect(characterFrames({ ...lookWith({}), build: { arms: 'fit', frame: 'fit' } })).toEqual(
      characterFrames(lookWith({})),
    );
  });

  it.each(['arms', 'frame'] as const)('widens the character as the %s grow', (part) => {
    const widths = BUILD_TIERS.map((tier) => {
      const build = { arms: 'fit', frame: 'fit', [part]: tier } as const;
      return width(characterFrames({ ...lookWith({}), build })[0]);
    });
    expect(widths[1]).toBe(widths[0] + 2);
    expect(widths[2]).toBe(widths[1] + 2);
  });

  it.each(CHARACTER_POSES)('keeps the head the same size in every build while %s', (pose) => {
    const hairOf = (build: (typeof EVERY_BUILD)[number]) =>
      pixelsIn(characterFrames({ ...lookWith({}), build }, pose)[0], HAIR);
    for (const build of EVERY_BUILD) expect(hairOf(build)).toEqual(hairOf({ arms: 'fit', frame: 'fit' }));
  });

  it.each(EVERY_BUILD)('keeps gloves on the hands with arms $arms on a $frame frame', (build) => {
    const [bare] = characterFrames({ ...lookWith({}), build });
    const [gloved] = characterFrames({ ...lookWith({ gloves: GEAR_TINT }), build });
    const bodyCells = new Set(
      bare.pixels.flatMap((pixel) => Array.from({ length: pixel.w }, (_, index) => `${pixel.x + index},${pixel.y}`)),
    );
    for (const pixel of pixelsIn(gloved, GEAR_TINT))
      for (let x = pixel.x; x < pixel.x + pixel.w; x++)
        expect(bodyCells.has(`${x},${pixel.y}`), `${x},${pixel.y}`).toBe(true);
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
