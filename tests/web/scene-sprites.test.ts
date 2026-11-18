import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type Sprite } from '../../web/src/components/pixel-sprites.ts';
import {
  SCENE_COLS,
  SCENE_ROWS,
  SCENE_VISIBLE_FROM_COL,
  SCENE_VISIBLE_TO_COL,
  sceneArt,
  sceneSprite,
} from '../../web/src/components/scene-sprites.ts';
import {
  EQUIPMENT_SKILL,
  PENNANT_QUEST_POINTS,
  SCENE_EQUIPMENT,
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
    recordDates: [],
    questPoints: 0,
    streakWeeks: 0,
    skillLevels: {},
    today: TODAY,
    hour: 12,
    ...extras,
  });
}

const TODAY = '2026-11-18';
const THREE_RECORDS = [TODAY, '2026-11-01', '2026-06-01'];
const EVERY_SKILL_MAXED = Object.fromEntries(Object.values(EQUIPMENT_SKILL).map((skill) => [skill, 99]));

const FULLEST: Scene = sceneFor({
  totalLevel: 990,
  recordDates: THREE_RECORDS,
  questPoints: 99,
  streakWeeks: 52,
  skillLevels: EVERY_SKILL_MAXED,
  today: TODAY,
  hour: 23,
});

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
        sceneAt(stage, {
          recordDates: THREE_RECORDS,
          questPoints: 21,
          streakWeeks: 12,
          skillLevels: EVERY_SKILL_MAXED,
          hour: LIGHT_HOUR[light],
        }),
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
      (count) =>
        addedPixels(
          sceneSprite(sceneAt('bare')),
          sceneSprite(sceneAt('bare', { recordDates: THREE_RECORDS.slice(0, count) })),
        ).length,
    );
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBeGreaterThan(0);
    expect(counts[2]).toBeGreaterThan(counts[1]);
    expect(counts[3]).toBeGreaterThan(counts[2]);
  });

  it('casts each trophy in its own metal', () => {
    const pictures = ['2026-11-18', '2026-11-01', '2026-06-01'].map((recordDate) =>
      JSON.stringify(sceneSprite(sceneAt('bare', { recordDates: [recordDate] }))),
    );
    expect(new Set(pictures).size).toBe(3);
  });

  it('strings up a pennant for each one the scene holds', () => {
    const counts = [0, ...PENNANT_QUEST_POINTS].map(
      (questPoints) => addedPixels(sceneSprite(sceneAt('bare')), sceneSprite(sceneAt('bare', { questPoints }))).length,
    );
    expect(counts[0]).toBe(0);
    for (let index = 1; index < counts.length; index++) expect(counts[index]).toBeGreaterThan(counts[index - 1]);
  });

  it.each([...SCENE_EQUIPMENT])('draws the %s once its skill brings it in', (piece) => {
    const bare = sceneSprite(sceneAt('bare'));
    const equipped = sceneSprite(sceneAt('bare', { skillLevels: { [EQUIPMENT_SKILL[piece]]: 99 } }));
    expect(addedPixels(bare, equipped).length).toBeGreaterThan(0);
    expect(addedPixels(equipped, bare)).toEqual([]);
  });

  it('gives every piece of equipment its own spot', () => {
    const bare = sceneSprite(sceneAt('bare'));
    const cells = new Map<string, string>();
    for (const piece of SCENE_EQUIPMENT) {
      const added = addedPixels(bare, sceneSprite(sceneAt('bare', { skillLevels: { [EQUIPMENT_SKILL[piece]]: 99 } })));
      for (const pixel of added)
        for (let x = pixel.x; x < pixel.x + pixel.w; x++)
          for (let y = pixel.y; y < pixel.y + pixel.h; y++) {
            expect(cells.get(`${x},${y}`) ?? piece, `${piece} at ${x},${y}`).toBe(piece);
            cells.set(`${x},${y}`, piece);
          }
    }
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

describe('sceneArt', () => {
  const WINTER = '2026-12-24';
  const framesOf = (scene: Scene | null) => sceneArt(scene).frames.map((frame) => JSON.stringify(frame.pixels));
  const moves = (scene: Scene | null) => new Set(framesOf(scene)).size === 2;

  it('is the still picture plus the first frame', () => {
    const { still, frames } = sceneArt(FULLEST);
    expect(sceneSprite(FULLEST).pixels).toEqual([...still.pixels, ...frames[0].pixels]);
  });

  it.each([...SCENE_STAGES])('keeps both frames of the %s stage in the grid, in token colours', (stage) => {
    for (const light of Object.keys(LIGHT_HOUR) as SceneLight[]) {
      const scene = sceneAt(stage, {
        recordDates: THREE_RECORDS,
        streakWeeks: 12,
        today: WINTER,
        hour: LIGHT_HOUR[light],
      });
      for (const frame of sceneArt(scene).frames) {
        expectInBounds(frame);
        for (const pixel of frame.pixels) {
          expect(tokenColours.has(pixel.fill.toLowerCase()), pixel.fill).toBe(true);
          expect(pixel.x).toBeGreaterThanOrEqual(SCENE_VISIBLE_FROM_COL);
          expect(pixel.x + pixel.w).toBeLessThanOrEqual(SCENE_VISIBLE_TO_COL);
        }
      }
    }
  });

  it('holds still while nothing in the room moves', () => {
    expect(framesOf(null)).toEqual(['[]', '[]']);
    expect(framesOf(sceneAt('banners'))).toEqual(['[]', '[]']);
    expect(moves(sceneAt('window', { hour: LIGHT_HOUR.dawn }))).toBe(false);
    expect(moves(sceneAt('bare', { recordDates: ['2026-06-01'] }))).toBe(false);
  });

  it('flickers the torch, drifts the clouds, twinkles the stars and a gold trophy', () => {
    expect(moves(sceneAt('bare', { streakWeeks: 1 }))).toBe(true);
    expect(moves(sceneAt('bare', { streakWeeks: 4 }))).toBe(true);
    expect(moves(sceneAt('bare', { streakWeeks: 12 }))).toBe(true);
    expect(moves(sceneAt('window', { hour: LIGHT_HOUR.day }))).toBe(true);
    expect(moves(sceneAt('window', { hour: LIGHT_HOUR.night }))).toBe(true);
    expect(moves(sceneAt('bare', { recordDates: [TODAY] }))).toBe(true);
  });

  it('switches city lights off and on after dark only', () => {
    const cityOnly = (hour: number) => {
      const [, withCity] = sceneArt(sceneAt('skyline', { hour })).frames;
      const [, withoutCity] = sceneArt(sceneAt('window', { hour })).frames;
      return addedPixels(withoutCity, withCity).length;
    };
    expect(cityOnly(LIGHT_HOUR.day)).toBe(0);
    expect(cityOnly(LIGHT_HOUR.dusk)).toBeGreaterThan(0);
    expect(cityOnly(LIGHT_HOUR.night)).toBeGreaterThan(0);
  });

  it('lets it snow outside the window in winter, in both frames, never on the frame', () => {
    const snowIn = (stage: SceneStage) => {
      const clear = sceneArt(sceneAt(stage, { hour: LIGHT_HOUR.dawn })).frames;
      const snowy = sceneArt(sceneAt(stage, { today: WINTER, hour: LIGHT_HOUR.dawn })).frames;
      return snowy.map((frame, index) => addedPixels(clear[index], frame));
    };
    expect(snowIn('banners')).toEqual([[], []]);
    const [first, second] = snowIn('window');
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBe(first.length);
    expect(second).not.toEqual(first);
    const windowFrame = new Set(
      addedPixels(sceneSprite(sceneAt('banners')), sceneSprite(sceneAt('window', { hour: LIGHT_HOUR.dawn })))
        .filter((pixel) => pixel.fill === '#000' || pixel.fill === '#7a6a52')
        .flatMap((pixel) =>
          Array.from(
            { length: pixel.w * pixel.h },
            (_, cell) => `${pixel.x + (cell % pixel.w)},${pixel.y + Math.floor(cell / pixel.w)}`,
          ),
        ),
    );
    for (const flake of [...first, ...second]) expect(windowFrame.has(`${flake.x},${flake.y}`)).toBe(false);
  });
});
