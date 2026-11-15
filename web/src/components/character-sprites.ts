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

export const CHARACTER_COLS = 24;
export const CHARACTER_ROWS = 32;
export const IDLE_BOB_ROWS = 1;

const INK = '#000';
const SKIN = '#d8c8a8';
const SKIN_SHADE = '#b3a58c';
const HAIR = '#7a6a52';
const SHORTS = '#3e3529';
const SHORTS_SHADE = '#2f2419';
const CHALK = '#f0e6d0';
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

interface GearLayer extends Layer {
  moves: boolean;
}

const GEAR_LAYERS: Record<GearSlot, GearLayer> = {
  chalk: {
    top: 20,
    moves: true,
    rows: [
      '....WW............WW....',
      '...WWW............WWW...',
      '...W.W.......KKKK.W.W...',
      '.............KWWK.......',
      '.............KGGK.......',
      '.............KGGK.......',
      '.............KggK.......',
      '.............KKKK.......',
    ],
  },
  gloves: {
    top: 19,
    moves: true,
    rows: [
      '...GGG............GGG...',
      '...KggK..........KggK...',
      '..KGGGK..........KGGGK..',
      '..KGGGK..........KGGGK..',
      '...KgK............KgK...',
    ],
  },
  straps: {
    top: 19,
    moves: true,
    rows: [
      '...GGG............GGG...',
      '....GG............GG....',
      '......G..........G......',
      '......G..........G......',
      '......G..........G......',
      '.....GG..........GG.....',
    ],
  },
  belt: {
    top: 19,
    moves: true,
    rows: ['.......GGKWWWWKGG.......', '.......GGKWKKWKGG.......', '.......ggKKKKKKgg.......'],
  },
  sleeves: {
    top: 25,
    moves: false,
    rows: ['.......GGGG..GGGG.......', '.......GGGG..GGGG.......', '.......gggg..gggg.......'],
  },
  shoes: {
    top: 29,
    moves: false,
    rows: ['.......GGGG..GGGG.......', '.....GGGGGG..GGGGGG.....', '.....WWWWWK..KWWWWW.....'],
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

function bodyPalette(shirt: ShirtColors): Record<string, string> {
  return {
    K: INK,
    H: HAIR,
    S: SKIN,
    s: SKIN_SHADE,
    T: shirt.fill,
    t: shirt.dark,
    P: SHORTS,
    p: SHORTS_SHADE,
  };
}

function lowered(pixels: readonly Pixel[], rows: number): Pixel[] {
  return pixels.map((pixel) => ({ ...pixel, y: pixel.y + rows }));
}

function characterFrame(look: CharacterLook, bob: number): Sprite {
  const palette = bodyPalette(look.shirt);
  const equipped = GEAR_DRAW_ORDER.flatMap((slot) => {
    const color = look.gear[slot];
    return color ? [{ layer: GEAR_LAYERS[slot], color }] : [];
  });
  const gearThat = (moves: boolean) =>
    equipped.filter(({ layer }) => layer.moves === moves).flatMap(({ layer, color }) => gearPixels(layer, color));
  return {
    cols: CHARACTER_COLS,
    rows: CHARACTER_ROWS,
    pixels: [
      ...layerPixels(BODY_LOWER, palette),
      ...gearThat(false),
      ...lowered([...layerPixels(BODY_UPPER, palette), ...gearThat(true)], bob),
    ],
  };
}

export function characterFrames(look: CharacterLook): readonly [Sprite, Sprite] {
  return [characterFrame(look, 0), characterFrame(look, IDLE_BOB_ROWS)];
}
