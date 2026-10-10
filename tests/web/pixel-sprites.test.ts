import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ITEM_ICON_KINDS } from '../../supabase/functions/_shared/domain/crafting.ts';
import {
  itemSprite,
  LEVEL_UP,
  LOGO,
  SKILL_SPRITES,
  type Sprite,
  TROPHY,
} from '../../web/src/components/pixel-sprites.ts';

const root = join(import.meta.dirname, '../..');
const seedSkillKeys = [
  ...readFileSync(join(root, 'supabase/seed.sql'), 'utf8')
    .split('insert into public.skills')[1]
    .split(';')[0]
    .matchAll(/'[0-9a-f-]+'::uuid, '([a-z_]+)'\), '([a-z_]+)'/g),
].map((match) => match[2]);
const tokenColours = new Set(
  [...readFileSync(join(root, 'web/src/styles/tokens.css'), 'utf8').matchAll(/#[0-9a-f]{3,6}\b/gi)].map((match) =>
    match[0].toLowerCase(),
  ),
);

const ITEM_KINDS = [...ITEM_ICON_KINDS, 'locked'] as const;

const allSprites: [string, Sprite][] = [
  ['logo', LOGO],
  ['trophy', TROPHY],
  ['level up', LEVEL_UP],
  ...Object.entries(SKILL_SPRITES),
  ...ITEM_KINDS.map((kind): [string, Sprite] => [kind, itemSprite(kind, '#ffb000')]),
];

function fills(sprite: Sprite): Set<string> {
  return new Set(sprite.pixels.map((pixel) => pixel.fill.toLowerCase()));
}

describe('pixel sprites', () => {
  it.each(allSprites)('%s stays inside its grid', (_name, sprite) => {
    for (const pixel of sprite.pixels) {
      expect(pixel.x).toBeGreaterThanOrEqual(0);
      expect(pixel.y).toBeGreaterThanOrEqual(0);
      expect(pixel.w).toBeGreaterThan(0);
      expect(pixel.h).toBeGreaterThan(0);
      expect(pixel.x + pixel.w).toBeLessThanOrEqual(sprite.cols);
      expect(pixel.y + pixel.h).toBeLessThanOrEqual(sprite.rows);
    }
  });

  it('has art for exactly the seeded skills', () => {
    expect(seedSkillKeys).toEqual([
      'chest',
      'back',
      'shoulders',
      'arms',
      'legs',
      'core',
      'grip',
      'endurance',
      'agility',
    ]);
    expect(Object.keys(SKILL_SPRITES).sort()).toEqual([...seedSkillKeys].sort());
  });

  it.each(Object.entries(SKILL_SPRITES))('%s is 12x12 in at most 4 palette colours plus black', (_key, sprite) => {
    expect([sprite.cols, sprite.rows]).toEqual([12, 12]);
    const used = fills(sprite);
    expect(used.size).toBeLessThanOrEqual(5);
    const palette = [...used].filter((fill) => fill !== '#000');
    expect(palette.length).toBeLessThanOrEqual(4);
    for (const fill of palette) expect(tokenColours.has(fill), fill).toBe(true);
  });

  it('draws the level-up art at 12x12 in palette colours', () => {
    expect([LEVEL_UP.cols, LEVEL_UP.rows]).toEqual([12, 12]);
    for (const fill of fills(LEVEL_UP)) expect(fill === '#000' || tokenColours.has(fill), fill).toBe(true);
  });
});
