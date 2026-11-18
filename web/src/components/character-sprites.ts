import type { GearSlot } from '@domain/crafting.ts';
import { fromRows, type Pixel, type Sprite } from './pixel-sprites.ts';

export interface ShirtColors {
  fill: string;
  dark: string;
}

export interface CharacterLook {
  shirt: ShirtColors;
  gear: Partial<Record<GearSlot, string>>;
}

export const CHARACTER_POSES = ['idle', 'lifting', 'flexing', 'resting'] as const;
export type CharacterPose = (typeof CHARACTER_POSES)[number];

export const CHARACTER_COLS = 24;
export const CHARACTER_ROWS = 32;
export const IDLE_BOB_ROWS = 1;
export const LIFT_DIP_ROWS = 3;
export const FLEX_HOP_ROWS = 1;
export const REST_SIT_ROWS = 4;

const INK = '#000';
const SKIN = '#d8c8a8';
const SKIN_SHADE = '#b3a58c';
const HAIR = '#7a6a52';
const SHORTS = '#3e3529';
const SHORTS_SHADE = '#2f2419';
const CHALK = '#f0e6d0';
const WEIGHT = '#d64541';
const WEIGHT_HUB = '#9a9488';
const BENCH = '#7a6a52';
const GEAR_SHADE_OPACITY = 0.35;

interface Layer {
  top: number;
  rows: readonly string[];
}

const BODY_UPPER: Layer = {
  top: 0,
  rows: [
    '........................',
    '.........KKKKKK.........',
    '........KHHHHHHK........',
    '........KHHHHHHK........',
    '........KHSSSSHK........',
    '........KSSSSSSK........',
    '........KSKSSKSK........',
    '........KSSSSSSK........',
    '.........KsSSsK.........',
    '.......KKKSSSSKKK.......',
    '.....KKSTTSSSSTTSKK.....',
    '...KKSSSTTTSSTTTSSSKK...',
    '..KSSSSSKTTTTTTKSSSSSK..',
    '..KSSSSsKTTTTTTKsSSSSK..',
    '..KSSSsKTTTTTTTTKsSSSK..',
    '..KSSSKKTTTTTTTTKKSSSK..',
    '..KSSKKTTTTTTTTTTKKSSK..',
    '..KSSSKtTTTTTTTTtKSSSK..',
    '..KSSSKtTTTTTTTTtKSSSK..',
    '..KsSSKKtTTTTTTtKKSSsK..',
    '...KSSKKPPPPPPPPKKSSK...',
    '..KSSSKPPPPPPPPPPKSSSK..',
    '..KSSSKPPPPPPPPPPKSSSK..',
    '...KKKKPPPPPPPPPPKKKK...',
  ],
};

const BODY_LOWER: Layer = {
  top: 24,
  rows: [
    '......KpPPPKKPPPpK......',
    '.......KSSSKKSSSK.......',
    '.......KSSSKKSSSK.......',
    '.......KSSSKKSSSK.......',
    '.......KsSSKKSSsK.......',
    '.......KSSSKKSSSK.......',
    '......KSSSSKKSSSSK......',
    '......KKKKKKKKKKKK......',
  ],
};

const BODY_UPPER_RAISED: Layer = {
  top: 0,
  rows: [
    '........................',
    '...KKK...KKKKKK...KKK...',
    '..KSSSK.KHHHHHHK.KSSSK..',
    '..KSSSK.KHHHHHHK.KSSSK..',
    '..KSSSK.KHSSSSHK.KSSSK..',
    '..KSSSK.KSSSSSSK.KSSSK..',
    '..KSSSK.KSKSSKSK.KSSSK..',
    '..KSSSK.KSSSSSSK.KSSSK..',
    '..KsSSK..KsSSsK..KSSsK..',
    '..KSSSKKKKSSSSKKKKSSSK..',
    '..KSSSSSTTSSSSTTSSSSSK..',
    '..KSSSSSTTTSSTTTSSSSSK..',
    '...KKsSSKTTTTTTKSSsKK...',
    '.....KKKTTTTTTTTKKK.....',
    '......KTTTTTTTTTTK......',
    '......KTTTTTTTTTTK......',
    '.......KTTTTTTTTK.......',
    '.......KtTTTTTTtK.......',
    '.......KtTTTTTTtK.......',
    '.......KKtTTTTtKK.......',
    '.......KPPPPPPPPK.......',
    '......KPPPPPPPPPPK......',
    '......KPPPPPPPPPPK......',
    '......KPPPPPPPPPPK......',
  ],
};

const EYES_ROW = 6;
const CLOSED_EYES = '........KSsSSsSK........';

const BODY_UPPER_ASLEEP: Layer = {
  top: 0,
  rows: BODY_UPPER.rows.map((row, index) => (index === EYES_ROW ? CLOSED_EYES : row)),
};

const WEIGHTS: Layer = {
  top: 23,
  rows: [
    '..KKKKK..........KKKKK..',
    '..KRRRK..........KRRRK..',
    '..KRDRK..........KRDRK..',
    '..KRRRK..........KRRRK..',
    '...KKK............KKK...',
  ],
};

const BENCH_SEAT: Layer = {
  top: 27,
  rows: [
    'KKKKKKKKKKKKKKKKKKKKKKKK',
    'KBBBBBBBBBBBBBBBBBBBBBBK',
    'KBBBBBBBBBBBBBBBBBBBBBBK',
    'KKK..................KKK',
    '.KK..................KK.',
  ],
};

const SNORE_ROWS = ['WWWW', '..W.', '.W..', 'WWWW'];
const SNORE: Layer = { top: 5, rows: SNORE_ROWS.map((row) => `.................${row}...`) };
const SNORE_RISING: Layer = { top: 1, rows: SNORE_ROWS.map((row) => `...................${row}.`) };

interface GearPart {
  moves: boolean;
  worn: Layer;
  raised?: Layer;
}

const GEAR_PARTS: Record<GearSlot, readonly GearPart[]> = {
  chalk: [
    {
      moves: true,
      worn: { top: 20, rows: ['....WW............WW....', '...WWW............WWW...', '...W.W............W.W...'] },
      raised: { top: 1, rows: ['...W.W............W.W...', '...WWW............WWW...', '....WW............WW....'] },
    },
    {
      moves: true,
      worn: {
        top: 22,
        rows: [
          '.............KKKK.......',
          '.............KWWK.......',
          '.............KGGK.......',
          '.............KGGK.......',
          '.............KggK.......',
          '.............KKKK.......',
        ],
      },
    },
  ],
  gloves: [
    {
      moves: true,
      worn: {
        top: 19,
        rows: [
          '...GGG............GGG...',
          '...KggK..........KggK...',
          '..KGGGK..........KGGGK..',
          '..KGGGK..........KGGGK..',
          '...KgK............KgK...',
        ],
      },
      raised: {
        top: 1,
        rows: [
          '...KgK............KgK...',
          '..KGGGK..........KGGGK..',
          '..KGGGK..........KGGGK..',
          '...KggK..........KggK...',
          '...GGG............GGG...',
        ],
      },
    },
  ],
  straps: [
    {
      moves: true,
      worn: {
        top: 19,
        rows: [
          '...GGG............GGG...',
          '....GG............GG....',
          '......G..........G......',
          '......G..........G......',
          '......G..........G......',
          '.....GG..........GG.....',
        ],
      },
      raised: {
        top: 5,
        rows: [
          '...GGG............GGG...',
          '....GG............GG....',
          '......G..........G......',
          '......G..........G......',
        ],
      },
    },
  ],
  belt: [
    {
      moves: true,
      worn: { top: 19, rows: ['.......GGKWWWWKGG.......', '.......GGKWKKWKGG.......', '.......ggKKKKKKgg.......'] },
    },
  ],
  sleeves: [
    {
      moves: false,
      worn: { top: 25, rows: ['.......GGGG..GGGG.......', '.......GGGG..GGGG.......', '.......gggg..gggg.......'] },
    },
  ],
  shoes: [
    {
      moves: false,
      worn: { top: 29, rows: ['.......GGGG..GGGG.......', '.....GGGGGG..GGGGGG.....', '.....WWWWWK..KWWWWW.....'] },
    },
  ],
};

interface PoseFrame {
  dip: number;
  hop: number;
  front: readonly Layer[];
}

interface Pose {
  upper: Layer;
  armsRaised: boolean;
  behind: readonly Layer[];
  carried: readonly Layer[];
  frames: readonly [PoseFrame, PoseFrame];
}

function upright(dip: number): PoseFrame {
  return { dip, hop: 0, front: [] };
}

const POSES: Record<CharacterPose, Pose> = {
  idle: {
    upper: BODY_UPPER,
    armsRaised: false,
    behind: [],
    carried: [],
    frames: [upright(0), upright(IDLE_BOB_ROWS)],
  },
  lifting: {
    upper: BODY_UPPER,
    armsRaised: false,
    behind: [],
    carried: [WEIGHTS],
    frames: [upright(0), upright(LIFT_DIP_ROWS)],
  },
  flexing: {
    upper: BODY_UPPER_RAISED,
    armsRaised: true,
    behind: [],
    carried: [],
    frames: [upright(0), { dip: 0, hop: FLEX_HOP_ROWS, front: [] }],
  },
  resting: {
    upper: BODY_UPPER_ASLEEP,
    armsRaised: false,
    behind: [BENCH_SEAT],
    carried: [],
    frames: [
      { dip: REST_SIT_ROWS, hop: 0, front: [SNORE] },
      { dip: REST_SIT_ROWS + IDLE_BOB_ROWS, hop: 0, front: [SNORE_RISING] },
    ],
  },
};

const GEAR_DRAW_ORDER: readonly GearSlot[] = ['sleeves', 'shoes', 'belt', 'chalk', 'gloves', 'straps'];

function layerPixels(layer: Layer, palette: Record<string, string>): Pixel[] {
  return fromRows(layer.rows, palette).pixels.map((pixel) => ({ ...pixel, y: pixel.y + layer.top }));
}

function gearPixels(layer: Layer, color: string): Pixel[] {
  const tinted = layerPixels(layer, { G: color, g: color, K: INK, W: CHALK });
  const shade = layerPixels(layer, { g: INK }).map((pixel) => ({ ...pixel, opacity: GEAR_SHADE_OPACITY }));
  return [...tinted, ...shade];
}

function artPalette(shirt: ShirtColors): Record<string, string> {
  return {
    K: INK,
    H: HAIR,
    S: SKIN,
    s: SKIN_SHADE,
    T: shirt.fill,
    t: shirt.dark,
    P: SHORTS,
    p: SHORTS_SHADE,
    R: WEIGHT,
    D: WEIGHT_HUB,
    B: BENCH,
    W: CHALK,
  };
}

function lowered(pixels: readonly Pixel[], rows: number): Pixel[] {
  return rows === 0 ? [...pixels] : pixels.map((pixel) => ({ ...pixel, y: pixel.y + rows }));
}

function characterFrame(look: CharacterLook, pose: Pose, frame: PoseFrame): Sprite {
  const palette = artPalette(look.shirt);
  const art = (layers: readonly Layer[]) => layers.flatMap((layer) => layerPixels(layer, palette));
  const worn = GEAR_DRAW_ORDER.flatMap((slot) => {
    const color = look.gear[slot];
    return color ? GEAR_PARTS[slot].map((part) => ({ part, color })) : [];
  });
  const gearThat = (moves: boolean) =>
    worn
      .filter(({ part }) => part.moves === moves)
      .flatMap(({ part, color }) => gearPixels((pose.armsRaised && part.raised) || part.worn, color));
  const upper = [...art([pose.upper]), ...gearThat(true), ...art(pose.carried)];
  const figure = [...art(pose.behind), ...art([BODY_LOWER]), ...gearThat(false), ...lowered(upper, frame.dip)];
  return {
    cols: CHARACTER_COLS,
    rows: CHARACTER_ROWS,
    pixels: [...lowered(figure, -frame.hop), ...art(frame.front)].filter((pixel) => pixel.y < CHARACTER_ROWS),
  };
}

export function characterFrames(look: CharacterLook, pose: CharacterPose = 'idle'): readonly [Sprite, Sprite] {
  const [first, second] = POSES[pose].frames;
  return [characterFrame(look, POSES[pose], first), characterFrame(look, POSES[pose], second)];
}

export function gearLandingRow(slot: GearSlot): number {
  const tintedRows = GEAR_PARTS[slot].flatMap(({ worn }) =>
    worn.rows.flatMap((row, index) => (/[Gg]/.test(row) ? [worn.top + index] : [])),
  );
  return tintedRows[Math.floor(tintedRows.length / 2)];
}
