import {
  type Scene,
  type SceneEquipment,
  type SceneLight,
  type TorchFlame,
  type TrophyMetal,
} from '../lib/progress/scene-rules.ts';
import { fromRows, type Pixel, type Sprite } from './pixel-sprites.ts';

export const SCENE_COLS = 176;
export const SCENE_ROWS = 36;
export const SCENE_VISIBLE_FROM_COL = 40;
export const SCENE_VISIBLE_TO_COL = 136;

const INK = '#000';
const WALL = '#2e251c';
const WALL_JOINT = '#2a2219';
const SKIRTING = '#5c4f3d';
const FLOOR = '#3e3529';
const FLOOR_SEAM = '#2a2219';
const WOOD = '#7a6a52';
const WOOD_DARK = '#5c4f3d';
const STEEL = '#9a9488';
const STEEL_DARK = '#6b5f4b';
const PLATE_RED = '#d64541';
const PLATE_BLUE = '#3d7dd8';
const PLATE_YELLOW = '#f2c230';
const PLATE_WHITE = '#ece6da';
const GOLD = '#ffb000';
const GOLD_LIGHT = '#ffd166';
const GOLD_DARK = '#b87d00';
const BANNER_CLOTH = '#e0554b';
const XP = '#7fd46a';
const RARE = '#6fa8dc';
const CLOUD = '#f0e6d0';
const STAR = '#f0e6d0';
const MOON = '#ffe27a';
const BUILDING = '#5c4f3d';
const BUILDING_FAR = '#3e3529';
const UNLIT_WINDOW = '#958468';
const ROPE = '#d8c8a8';
const ROPE_SHADE = '#b3a58c';
const MAT = '#3fa35b';
const MAT_SHADE = '#4e8f3f';

const WALL_BOTTOM_ROW = 29;
const FLOOR_TOP_ROW = 30;
const BRICK_COURSE_ROWS = 6;
const BRICK_COLS = 12;
const PLANK_COLS = 20;

const WINDOW = { left: 56, top: 5, width: 38, height: 20 };
const GLASS = { left: 58, top: 7, right: 92, bottom: 23 };

const SKY_BANDS: Record<SceneLight, readonly [string, string, string]> = {
  dawn: [RARE, GOLD_LIGHT, '#e8827a'],
  day: [PLATE_BLUE, RARE, '#78afe0'],
  dusk: [WOOD_DARK, BANNER_CLOTH, GOLD],
  night: ['#1d160f', '#1d160f', '#241b13'],
};

const LIGHT_TINT: Record<SceneLight, { fill: string; opacity: number } | null> = {
  dawn: { fill: GOLD_LIGHT, opacity: 0.08 },
  day: null,
  dusk: { fill: BANNER_CLOTH, opacity: 0.1 },
  night: { fill: INK, opacity: 0.3 },
};

function rect(x: number, y: number, w: number, h: number, fill: string, opacity?: number): Pixel {
  return opacity === undefined ? { x, y, w, h, fill } : { x, y, w, h, fill, opacity };
}

function placed(rows: readonly string[], palette: Record<string, string>, left: number, top: number): Pixel[] {
  return fromRows(rows, palette).pixels.map((pixel) => ({ ...pixel, x: pixel.x + left, y: pixel.y + top }));
}

function room(): Pixel[] {
  const pixels: Pixel[] = [rect(0, 0, SCENE_COLS, WALL_BOTTOM_ROW, WALL)];
  for (let course = 0; course * BRICK_COURSE_ROWS < WALL_BOTTOM_ROW; course++) {
    const top = course * BRICK_COURSE_ROWS;
    if (top > 0) pixels.push(rect(0, top - 1, SCENE_COLS, 1, WALL_JOINT));
    const offset = course % 2 === 0 ? 0 : BRICK_COLS / 2;
    for (let x = offset; x < SCENE_COLS; x += BRICK_COLS)
      pixels.push(rect(x, top, 1, Math.min(BRICK_COURSE_ROWS - 1, WALL_BOTTOM_ROW - top), WALL_JOINT));
  }
  pixels.push(rect(0, WALL_BOTTOM_ROW, SCENE_COLS, 1, SKIRTING));
  pixels.push(rect(0, FLOOR_TOP_ROW, SCENE_COLS, SCENE_ROWS - FLOOR_TOP_ROW, FLOOR));
  for (const [row, offset] of [
    [32, 0],
    [34, PLANK_COLS / 2],
  ] as const) {
    pixels.push(rect(0, row, SCENE_COLS, 1, FLOOR_SEAM));
    for (let x = offset; x < SCENE_COLS; x += PLANK_COLS) pixels.push(rect(x, row - 2, 1, 2, FLOOR_SEAM));
  }
  return pixels;
}

const PLATE_ROWS = ['..KKKK..', '.KPPPPK.', 'KPPPPPPK', 'KPPKKPPK', 'KPPKKPPK', 'KPPPPPPK', '.KPPPPK.', '..KKKK..'];

function rack(): Pixel[] {
  return [
    rect(101, 32, 9, 2, INK),
    rect(119, 32, 9, 2, INK),
    rect(102, 32, 7, 1, STEEL_DARK),
    rect(120, 32, 7, 1, STEEL_DARK),
    rect(104, 10, 3, 22, INK),
    rect(122, 10, 3, 22, INK),
    rect(105, 10, 1, 22, STEEL),
    rect(123, 10, 1, 22, STEEL),
    rect(104, 10, 21, 1, INK),
    rect(107, 22, 15, 1, STEEL_DARK),
    rect(107, 14, 2, 1, INK),
    rect(120, 14, 2, 1, INK),
    rect(95, 13, 39, 1, STEEL),
    rect(97, 8, 4, 11, INK),
    rect(98, 9, 2, 9, PLATE_RED),
    rect(128, 8, 4, 11, INK),
    rect(129, 9, 2, 9, PLATE_RED),
  ];
}

function wallPlates(): Pixel[] {
  return [
    rect(40, 18, 16, 1, STEEL_DARK),
    rect(43, 17, 1, 1, INK),
    rect(51, 17, 1, 1, INK),
    ...placed(PLATE_ROWS, { K: INK, P: PLATE_BLUE }, 40, 19),
    ...placed(PLATE_ROWS, { K: INK, P: PLATE_YELLOW }, 48, 19),
  ];
}

function banner(): Pixel[] {
  return placed(
    [
      'WWWWWWWWWWWW',
      '..KRRRRRRK..',
      '..KRRRRRRK..',
      '..KRRRRRRK..',
      '..KRGRRGRK..',
      '..KRGGGGRK..',
      '..KRGRRGRK..',
      '..KRRRRRRK..',
      '..KRRRRRRK..',
      '..KRRRRRRK..',
      '..KRRKKRRK..',
      '..KRK..KRK..',
      '..KK....KK..',
    ],
    { W: WOOD, K: INK, R: BANNER_CLOTH, G: GOLD },
    44,
    1,
  );
}

function sky(light: SceneLight): Pixel[] {
  const [top, middle, bottom] = SKY_BANDS[light];
  const width = GLASS.right - GLASS.left;
  const pixels = [
    rect(GLASS.left, GLASS.top, width, 5, top),
    rect(GLASS.left, GLASS.top + 5, width, 6, middle),
    rect(GLASS.left, GLASS.top + 11, width, GLASS.bottom - GLASS.top - 11, bottom),
  ];
  if (light === 'night') pixels.push(rect(84, 8, 3, 3, MOON), rect(84, 8, 1, 1, '#1d160f'));
  if (light === 'dawn' || light === 'dusk') pixels.push(rect(80, GLASS.bottom - 3, 6, 3, GOLD_LIGHT));
  return pixels;
}

type FramePair = readonly [Pixel[], Pixel[]];

const STILL: FramePair = [[], []];

type Cell = readonly [number, number];
type CellFrames = readonly [readonly Cell[], readonly Cell[]];

function dots(cells: readonly Cell[], fill: string): Pixel[] {
  return cells.map(([x, y]) => rect(x, y, 1, 1, fill));
}

const STEADY_STARS = [
  [62, 9],
  [79, 8],
  [60, 10],
] as const;
const TWINKLING_STARS: CellFrames = [
  [
    [69, 8],
    [90, 9],
  ],
  [
    [66, 10],
    [88, 8],
  ],
];

const CLOUDS = [
  { left: 62, top: 9, width: 6 },
  { left: 60, top: 10, width: 10 },
  { left: 84, top: 8, width: 6 },
  { left: 83, top: 9, width: 8 },
] as const;

function skyFrames(light: SceneLight): FramePair {
  if (light === 'night') {
    const steady = dots(STEADY_STARS, STAR);
    return [
      [...steady, ...dots(TWINKLING_STARS[0], STAR)],
      [...steady, ...dots(TWINKLING_STARS[1], STAR)],
    ];
  }
  if (light !== 'day') return STILL;
  const drifted = (cols: number) => CLOUDS.map(({ left, top, width }) => rect(left + cols, top, width, 1, CLOUD));
  return [drifted(0), drifted(1)];
}

const SNOWFLAKES: CellFrames = [
  [
    [60, 8],
    [66, 11],
    [71, 9],
    [79, 10],
    [85, 12],
    [90, 12],
    [63, 17],
    [69, 20],
    [78, 18],
    [83, 21],
    [88, 16],
    [61, 22],
  ],
  [
    [61, 10],
    [67, 13],
    [72, 11],
    [80, 12],
    [86, 15],
    [91, 15],
    [64, 19],
    [70, 22],
    [79, 20],
    [84, 11],
    [89, 18],
    [62, 8],
  ],
];

const SNOW_FRAMES: FramePair = [dots(SNOWFLAKES[0], CLOUD), dots(SNOWFLAKES[1], CLOUD)];

const BUILDINGS: readonly { left: number; top: number; width: number; far: boolean }[] = [
  { left: 61, top: 12, width: 5, far: true },
  { left: 80, top: 11, width: 6, far: true },
  { left: 58, top: 16, width: 6, far: false },
  { left: 64, top: 14, width: 6, far: false },
  { left: 70, top: 18, width: 6, far: false },
  { left: 76, top: 15, width: 7, far: false },
  { left: 83, top: 17, width: 4, far: false },
  { left: 87, top: 13, width: 5, far: false },
];

const CITY_WINDOWS: readonly Cell[] = BUILDINGS.filter(({ far }) => !far).flatMap(({ left, top, width }) => {
  const cells: Cell[] = [];
  for (let y = top + 2; y < GLASS.bottom - 1; y += 3)
    for (let x = left + 1; x < left + width - 1; x += 2) if ((x + y) % 4 !== 0) cells.push([x, y]);
  return cells;
});

function cityIsLit(light: SceneLight): boolean {
  return light === 'night' || light === 'dusk';
}

function skyline(light: SceneLight): Pixel[] {
  return [
    ...BUILDINGS.map(({ left, top, width, far }) =>
      rect(left, top, width, GLASS.bottom - top, far ? BUILDING_FAR : BUILDING),
    ),
    ...dots(CITY_WINDOWS, cityIsLit(light) ? GOLD_LIGHT : UNLIT_WINDOW),
  ];
}

const CITY_FLICKER_EVERY = 5;

function cityFrames(light: SceneLight): FramePair {
  if (!cityIsLit(light)) return STILL;
  return [
    [],
    dots(
      CITY_WINDOWS.filter(([x, y]) => (x + 2 * y) % CITY_FLICKER_EVERY === 0),
      BUILDING_FAR,
    ),
  ];
}

function windowFrame(): Pixel[] {
  const { left, top, width, height } = WINDOW;
  return [
    rect(left, top, width, 2, INK),
    rect(left, top + height - 2, width, 2, INK),
    rect(left, top, 2, height, INK),
    rect(left + width - 2, top, 2, height, INK),
    rect(left + 1, top + 1, width - 2, 1, WOOD),
    rect(left + 1, top + 1, 1, height - 2, WOOD),
    rect(left + width - 2, top + 1, 1, height - 2, WOOD),
    rect(74, GLASS.top, 2, GLASS.bottom - GLASS.top, WOOD),
    rect(GLASS.left, 14, GLASS.right - GLASS.left, 1, WOOD),
    rect(left - 1, top + height - 1, width + 2, 2, WOOD_DARK),
    rect(left - 1, top + height - 1, width + 2, 1, WOOD),
  ];
}

function windowWithView(light: SceneLight, seesCity: boolean): Pixel[] {
  return [...sky(light), ...(seesCity ? skyline(light) : []), ...windowFrame()];
}

const TROPHY_ROWS = ['GGGGG', 'GLGGG', '.GGG.', '..D..', '.GGG.', '.DDD.'];
const TROPHY_COLS = [113, 106, 120] as const;
const TROPHY_PALETTE: Record<TrophyMetal, Record<string, string>> = {
  gold: { G: GOLD, L: GOLD_LIGHT, D: GOLD_DARK },
  silver: { G: STEEL, L: PLATE_WHITE, D: STEEL_DARK },
  bronze: { G: GOLD_DARK, L: UNLIT_WINDOW, D: WOOD_DARK },
};

function trophies(metals: readonly TrophyMetal[]): Pixel[] {
  if (metals.length === 0) return [];
  return [
    rect(103, 7, 23, 1, WOOD),
    rect(103, 8, 23, 1, WOOD_DARK),
    rect(105, 9, 1, 1, WOOD_DARK),
    rect(123, 9, 1, 1, WOOD_DARK),
    ...metals.flatMap((metal, index) => placed(TROPHY_ROWS, TROPHY_PALETTE[metal], TROPHY_COLS[index], 1)),
  ];
}

function trophyFrames(metals: readonly TrophyMetal[]): FramePair {
  const golden = metals.flatMap((metal, index) => (metal === 'gold' ? [TROPHY_COLS[index]] : []));
  return [
    dots(
      golden.map((left) => [left - 1, 1]),
      CLOUD,
    ),
    dots(
      golden.map((left) => [left + 5, 3]),
      CLOUD,
    ),
  ];
}

const PENNANT_ROWS = ['PPPPP', '.PPP.', '..P..'];
const PENNANTS = [
  { left: 70, fill: GOLD },
  { left: 76, fill: XP },
  { left: 64, fill: RARE },
  { left: 82, fill: RARE },
  { left: 58, fill: XP },
  { left: 88, fill: GOLD },
] as const;

function pennants(count: number): Pixel[] {
  if (count === 0) return [];
  return [
    rect(WINDOW.left, 1, WINDOW.width, 1, WOOD),
    ...PENNANTS.slice(0, count).flatMap(({ left, fill }) => placed(PENNANT_ROWS, { P: fill }, left, 2)),
  ];
}

const ROPE_KNOT_TOP = 13;
const ROPE_TWIST_ROWS = 3;

function climbingRope(): Pixel[] {
  const pixels: Pixel[] = [rect(41, 0, 2, ROPE_KNOT_TOP, ROPE)];
  for (let y = ROPE_TWIST_ROWS - 1; y < ROPE_KNOT_TOP; y += ROPE_TWIST_ROWS) pixels.push(rect(41, y, 2, 1, ROPE_SHADE));
  return [
    ...pixels,
    ...placed(['KKKK', 'KRRK', 'KrrK', '.KK.', '.RR.'], { K: INK, R: ROPE, r: ROPE_SHADE }, 40, ROPE_KNOT_TOP),
  ];
}

function jumpRope(): Pixel[] {
  return placed(['G...G', 'G...G', 'R...R', 'R...R', 'R...R', '.RRR.'], { G: XP, R: ROPE }, 108, 15);
}

const EQUIPMENT_ART: Record<SceneEquipment, () => Pixel[]> = {
  bench: () =>
    placed(
      ['KKKKKKKKKKKK', 'KBBBBBBBBBBK', 'KKKKKKKKKKKK', '.KS......SK.', '.KS......SK.', '.KS......SK.', 'KKKK....KKKK'],
      { K: INK, B: PLATE_BLUE, S: STEEL_DARK },
      109,
      26,
    ),
  'climbing-rope': climbingRope,
  'medicine-ball': () =>
    placed(['.KKK.', 'KRRRK', 'KWWWK', 'KRRRK', '.KKK.'], { K: INK, R: BANNER_CLOTH, W: CLOUD }, 54, 30),
  dumbbells: () => {
    const dumbbell = ['SS.SS', 'SSDSS', 'SS.SS'];
    const palette = { S: STEEL, D: STEEL_DARK };
    return [...placed(dumbbell, palette, 109, 33), ...placed(dumbbell, palette, 116, 33)];
  },
  'bar-plates': () => [
    rect(94, 9, 3, 9, INK),
    rect(95, 10, 1, 7, PLATE_YELLOW),
    rect(132, 9, 3, 9, INK),
    rect(133, 10, 1, 7, PLATE_YELLOW),
  ],
  kettlebell: () =>
    placed(['.KKK.', '.K.K.', 'KKKKK', 'KSSSK', 'KSsSK', '.KKK.'], { K: INK, S: STEEL, s: STEEL_DARK }, 42, 29),
  'chalk-bowl': () =>
    placed(
      ['.WWWW.', 'KKKKKK', '.KSSK.', '..KK..', '..SS..', '..SS..', '..SS..', '..SS..', '..SS..', '.KSSK.', 'KKKKKK'],
      { K: INK, W: CLOUD, S: STEEL_DARK },
      128,
      24,
    ),
  'jump-rope': jumpRope,
  cones: () => placed(['..O..', '.OOO.', '.WWW.', 'OOOOO', 'KKKKK'], { K: INK, O: GOLD, W: CLOUD }, 48, 30),
  mat: () => [rect(84, 33, 15, 2, MAT), rect(84, 34, 15, 1, MAT_SHADE), rect(84, 33, 1, 2, MAT_SHADE)],
};

function equipment(pieces: readonly SceneEquipment[]): Pixel[] {
  return pieces.flatMap((piece) => EQUIPMENT_ART[piece]());
}

const TORCH_LEFT = 96;
const TORCH_HOLDER_TOP = 4;
const TORCH_HOLDER_ROWS = ['KKKKK', '.KWK.', '..W..', '.KWK.'];
const TORCH_FLAME_ROWS: Record<TorchFlame, readonly [readonly string[], readonly string[]]> = {
  small: [
    ['..F..', '.FYF.'],
    ['.F...', '.FYF.'],
  ],
  steady: [
    ['..F..', '.FYF.', '.FYF.'],
    ['...F.', '..FF.', '.FYF.'],
  ],
  roaring: [
    ['..F..', '.FYF.', 'FYLYF', 'FYLYF'],
    ['.F...', '.FYFF', 'FYLYF', 'FLYYF'],
  ],
};
const TORCH_GLOW_OPACITY = 0.06;

function torch(flame: TorchFlame): Pixel[] {
  const flameRows = TORCH_FLAME_ROWS[flame][0].length;
  const flameTop = TORCH_HOLDER_TOP - flameRows;
  return [
    rect(TORCH_LEFT - 2, flameTop + 1, 9, flameRows, GOLD_LIGHT, TORCH_GLOW_OPACITY),
    rect(TORCH_LEFT - 1, flameTop, 7, flameRows + 2, GOLD_LIGHT, TORCH_GLOW_OPACITY),
    ...placed(TORCH_HOLDER_ROWS, { K: INK, W: WOOD }, TORCH_LEFT, TORCH_HOLDER_TOP),
  ];
}

function torchFrames(flame: TorchFlame): FramePair {
  const palette = { F: GOLD, Y: GOLD_LIGHT, L: MOON };
  const [steady, flickered] = TORCH_FLAME_ROWS[flame];
  const flameTop = TORCH_HOLDER_TOP - steady.length;
  return [placed(steady, palette, TORCH_LEFT, flameTop), placed(flickered, palette, TORCH_LEFT, flameTop)];
}

function lightTint(light: SceneLight): Pixel[] {
  const tint = LIGHT_TINT[light];
  return tint ? [rect(0, 0, SCENE_COLS, SCENE_ROWS, tint.fill, tint.opacity)] : [];
}

function stillPixels(scene: Scene | null): Pixel[] {
  const pixels = room();
  if (scene) {
    const has = (prop: Scene['props'][number]) => scene.props.includes(prop);
    if (has('window')) pixels.push(...windowWithView(scene.light, has('skyline')));
    if (has('banner')) pixels.push(...banner());
    if (has('wall-plates')) pixels.push(...wallPlates());
    pixels.push(
      ...pennants(scene.pennants),
      ...trophies(scene.trophies),
      ...rack(),
      ...equipment(scene.equipment),
      ...lightTint(scene.light),
    );
    if (scene.torch) pixels.push(...torch(scene.torch.flame));
  }
  return pixels;
}

function movingPixels(scene: Scene | null): FramePair {
  if (!scene) return STILL;
  const hasWindow = scene.props.includes('window');
  const moving = [
    hasWindow ? skyFrames(scene.light) : STILL,
    scene.props.includes('skyline') ? cityFrames(scene.light) : STILL,
    scene.weather === 'snow' ? SNOW_FRAMES : STILL,
    trophyFrames(scene.trophies),
    scene.torch ? torchFrames(scene.torch.flame) : STILL,
  ];
  return [moving.flatMap(([first]) => first), moving.flatMap(([, second]) => second)];
}

function sprite(pixels: Pixel[]): Sprite {
  return { cols: SCENE_COLS, rows: SCENE_ROWS, pixels };
}

export interface SceneArt {
  still: Sprite;
  frames: readonly [Sprite, Sprite];
}

export function sceneArt(scene: Scene | null): SceneArt {
  const [first, second] = movingPixels(scene);
  return { still: sprite(stillPixels(scene)), frames: [sprite(first), sprite(second)] };
}
