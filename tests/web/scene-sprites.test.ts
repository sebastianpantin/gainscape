import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Sprite } from '../../web/src/components/pixel-sprites.ts';
import {
  SCENE_COLS,
  SCENE_ROWS,
  SCENE_VISIBLE_FROM_COL,
  SCENE_VISIBLE_TO_COL,
  sceneSprite,
} from '../../web/src/components/scene-sprites.ts';
import {
  SCENE_STAGES,
  type Scene,
  type SceneInput,
  type SceneLight,
  type SceneStage,
  sceneFor,
  TORCH_FLAME_MIN_STREAK_WEEKS,
  TORCH_FLAMES,
} from '../../web/src/lib/progress/scene-rules.ts';

const root = join(import.meta.dirname, '../..');
const tokenColours = new Set(
  [...readFileSync(join(root, 'web/src/styles/tokens.css'), 'utf8').matchAll(/#[0-9a-f]{3,6}\b/gi)].map((match) =>
    match[0].toLowerCase(),
  ),
);

const STAGE_TOTAL_LEVEL: Record<SceneStage, number> = { bare: 10, plates: 15, banners: 40, window: 100, skyline: 300 };
const LIGHT_HOUR: Record<SceneLight, number> = { dawn: 6, day: 12, dusk: 19, night: 23 };

function sceneAt(stage: SceneStage, extras: Partial<Omit<SceneInput, 'totalLevel'>> = {}) {
  return sceneFor({
    totalLevel: STAGE_TOTAL_LEVEL[stage],
    recordCount: 0,
    questPoints: 0,
    streakWeeks: 0,
    hour: 12,
    ...extras,
  });
}

const FULLEST: Scene = sceneFor({ totalLevel: 990, recordCount: 9, questPoints: 99, streakWeeks: 52, hour: 23 });

function expectInBounds(sprite: Sprite) {
  expect([sprite.cols, sprite.rows]).toEqual([SCENE_COLS, SCENE_ROWS]);
  for (const pixel of sprite.pixels) {
    expect(pixel.x).toBeGreaterThanOrEqual(0);
    expect(pixel.y).toBeGreaterThanOrEqual(0);
    expect(pixel.w).toBeGreaterThan(0);
    expect(pixel.h).toBeGreaterThan(0);
    expect(pixel.x + pixel.w).toBeLessThanOrEqual(sprite.cols);
    expect(pixel.y + pixel.h).toBeLessThanOrEqual(sprite.rows);
  }
}

function addedPixels(before: Sprite, after: Sprite) {
  const seen = new Set(before.pixels.map((pixel) => JSON.stringify(pixel)));
  return after.pixels.filter((pixel) => !seen.has(JSON.stringify(pixel)));
}

describe('sceneSprite', () => {
  it.each([...SCENE_STAGES])('paints the %s stage inside the grid in token colours only', (stage) => {
    for (const light of Object.keys(LIGHT_HOUR) as SceneLight[]) {
      const sprite = sceneSprite(
        sceneAt(stage, { recordCount: 3, questPoints: 15, streakWeeks: 12, hour: LIGHT_HOUR[light] }),
      );
      expectInBounds(sprite);
      for (const pixel of sprite.pixels) expect(tokenColours.has(pixel.fill.toLowerCase()), pixel.fill).toBe(true);
    }
  });

  it('paints an empty room while the scene is unknown, in token colours', () => {
    const empty = sceneSprite(null);
    expectInBounds(empty);
    for (const pixel of empty.pixels) expect(tokenColours.has(pixel.fill.toLowerCase()), pixel.fill).toBe(true);
    expect(addedPixels(empty, sceneSprite(sceneAt('bare'))).length).toBeGreaterThan(0);
  });

  it('adds to the picture at every stage', () => {
    for (const [index, stage] of SCENE_STAGES.entries()) {
      if (index === 0) continue;
      const before = sceneSprite(sceneAt(SCENE_STAGES[index - 1]));
      expect(addedPixels(before, sceneSprite(sceneAt(stage))).length, stage).toBeGreaterThan(0);
    }
  });

  it('keeps everything that grows inside the columns a 320 px phone shows', () => {
    const added = addedPixels(sceneSprite(null), sceneSprite(FULLEST)).filter((pixel) => pixel.w < SCENE_COLS);
    expect(added.length).toBeGreaterThan(0);
    for (const pixel of added) {
      expect(pixel.x).toBeGreaterThanOrEqual(SCENE_VISIBLE_FROM_COL);
      expect(pixel.x + pixel.w).toBeLessThanOrEqual(SCENE_VISIBLE_TO_COL);
    }
    expect(SCENE_VISIBLE_TO_COL - SCENE_VISIBLE_FROM_COL).toBeLessThanOrEqual(96);
  });

  it('hangs a trophy for each one the scene holds', () => {
    const counts = [0, 1, 2, 3].map(
      (recordCount) => addedPixels(sceneSprite(sceneAt('bare')), sceneSprite(sceneAt('bare', { recordCount }))).length,
    );
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBeGreaterThan(0);
    expect(counts[2]).toBeGreaterThan(counts[1]);
    expect(counts[3]).toBeGreaterThan(counts[2]);
  });

  it('strings up a pennant for each one the scene holds', () => {
    const counts = [0, 1, 5, 15].map(
      (questPoints) => addedPixels(sceneSprite(sceneAt('bare')), sceneSprite(sceneAt('bare', { questPoints }))).length,
    );
    expect(counts[0]).toBe(0);
    expect(counts[2]).toBeGreaterThan(counts[1]);
    expect(counts[3]).toBeGreaterThan(counts[2]);
  });

  it('lights a torch that burns higher with the streak', () => {
    const bare = sceneSprite(sceneAt('bare'));
    const flames = TORCH_FLAMES.map(
      (flame) =>
        addedPixels(bare, sceneSprite(sceneAt('bare', { streakWeeks: TORCH_FLAME_MIN_STREAK_WEEKS[flame] }))).length,
    );
    expect(flames[0]).toBeGreaterThan(0);
    expect(flames[1]).toBeGreaterThan(flames[0]);
    expect(flames[2]).toBeGreaterThan(flames[1]);
  });

  it('changes the light with the time of day, also before the window', () => {
    for (const stage of ['bare', 'window'] as const) {
      const pictures = (Object.keys(LIGHT_HOUR) as SceneLight[]).map((light) =>
        JSON.stringify(sceneSprite(sceneAt(stage, { hour: LIGHT_HOUR[light] }))),
      );
      expect(new Set(pictures).size, stage).toBe(4);
    }
  });
});
