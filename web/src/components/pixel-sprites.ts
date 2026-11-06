import type { ItemIconKey, SkillPetIconKey } from '@domain/crafting.ts';

export interface Pixel {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  opacity?: number;
}

export interface Sprite {
  cols: number;
  rows: number;
  pixels: Pixel[];
}

export type ItemIconKind = ItemIconKey | 'locked';

export const APP_ICON_BACKGROUND = '#241b13';
export const APP_ICON_FRAME = '#5c4f3d';

const GOLD = '#ffb000';
const GOLD_DARK = '#d89400';
const INK = '#000';

const ACCENT_LIGHT = '#ffd166';
const ACCENT_DARK = '#b87d00';
const XP = '#7fd46a';
const XP_LIGHT = '#b5f0a4';
const RARE = '#6fa8dc';
const PARCHMENT = '#d8c8a8';
const PARCHMENT_SHADE = '#b3a58c';
const TEXT = '#f0e6d0';
const DANGER = '#e8827a';
const DANGER_FILL = '#e0554b';
const XP_DARK = '#4e8f3f';
const PANEL_BORDER = '#5c4f3d';
const CONTROL_BORDER = '#958468';
const INPUT_ICON = '#6b5f4b';
const PLATE_STEEL = '#9a9488';

type SkillKey =
  'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core' | 'grip' | 'endurance' | 'agility' | 'mobility';

function fromRows(rows: readonly string[], palette: Record<string, string>): Sprite {
  const pixels: Pixel[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const fill = palette[row[x]];
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end++;
      if (fill) pixels.push({ x, y, w: end - x, h: 1, fill });
      x = end;
    }
  });
  return { cols: Math.max(...rows.map((row) => row.length)), rows: rows.length, pixels };
}

export const SKILL_SPRITES: Record<SkillKey, Sprite> = {
  chest: fromRows(
    [
      '............',
      '.KKKK..KKKK.',
      'KBBBBKKBBBBK',
      'KBAAABBAAABK',
      'KBAAABBAAABK',
      'KBBBBBBBBBBK',
      '.KBBBGGBBBK.',
      '.KBBBGGBBBK.',
      '..KBBBBBBK..',
      '...KBBBBK...',
      '....KKKK....',
      '............',
    ],
    { K: INK, A: PARCHMENT_SHADE, B: PARCHMENT, G: GOLD },
  ),
  back: fromRows(
    [
      '............',
      'K..........K',
      'KRK......KRK',
      'KRRK....KRRK',
      'KRRRK..KRRRK',
      '.KRRRKKRRRK.',
      '.KRRRRRRRRK.',
      '..KRRRRRRK..',
      '..KRRWWRRK..',
      '...KRRRRK...',
      '....KKKK....',
      '............',
    ],
    { K: INK, R: RARE, W: TEXT },
  ),
  shoulders: fromRows(
    [
      '............',
      '............',
      '............',
      '..KKK..KKK..',
      '.KGGGKKGGGK.',
      'KGGLGGGGLGGK',
      'KGGGGGGGGGGK',
      'KDGGGKKGGGDK',
      '.KDDK..KDDK.',
      '..KK....KK..',
      '............',
      '............',
    ],
    { K: INK, G: GOLD, L: ACCENT_LIGHT, D: ACCENT_DARK },
  ),
  arms: fromRows(
    [
      '............',
      '....KKK.....',
      '...KXXXK....',
      '...KXXK.....',
      '..KXXK......',
      '.KXXXK..KKK.',
      '.KXXXXKKXXXK',
      '.KXXLXXXXXXK',
      '.KXXXXXXXXK.',
      '..KXXXXXXK..',
      '...KKKKKK...',
      '............',
    ],
    { K: INK, X: XP, L: XP_LIGHT },
  ),
  legs: fromRows(
    [
      '............',
      '..KKKKKKKK..',
      '..KLDKKLDK..',
      '..KLDKKLDK..',
      '..KLDKKLDK..',
      '..KLDKKLDK..',
      '..KLDKKLDK..',
      '..KLDKKLDK..',
      '..KLDKKLDK..',
      '.KLLDKKLLDK.',
      '.KKKKKKKKKK.',
      '............',
    ],
    { K: INK, L: GOLD, D: ACCENT_DARK },
  ),
  core: fromRows(
    [
      '............',
      '...KKKKKK...',
      '..KLDKKLDK..',
      '..KDDKKDDK..',
      '..KKKKKKKK..',
      '..KLDKKLDK..',
      '..KDDKKDDK..',
      '..KKKKKKKK..',
      '..KLDKKLDK..',
      '..KDDKKDDK..',
      '...KKKKKK...',
      '............',
    ],
    { K: INK, L: XP_LIGHT, D: XP },
  ),
  grip: fromRows(
    [
      '............',
      '...KKKKKK...',
      '..KLLLLLLK..',
      '..KLKLKLKLK.',
      'KKKKKKKKKKKK',
      'KGGGGGGGGGGK',
      'KKKKKKKKKKKK',
      '..KLKLKLKLK.',
      '..KLLLLLLDK.',
      '..KDDDDDDK..',
      '...KKKKKK...',
      '............',
    ],
    { K: INK, L: PARCHMENT, D: PARCHMENT_SHADE, G: GOLD },
  ),
  endurance: fromRows(
    [
      '............',
      '.KKKK..KKKK.',
      'KRRLRKKRRRRK',
      'KRLRRRRRRRRK',
      'KRRRRRRRRRRK',
      'KRRRRRRRRRDK',
      '.KRRRRRRRDK.',
      '..KRRRRRDK..',
      '...KRRRDK...',
      '....KRDK....',
      '.....KK.....',
      '............',
    ],
    { K: INK, R: DANGER_FILL, L: DANGER, D: TEXT },
  ),
  agility: fromRows(
    [
      '......KKKK..',
      '.....KLXXK..',
      '....KLXXK...',
      '...KLXXK....',
      '..KLXXKKKK..',
      '.KXXXXXXXK..',
      '..KKKKXXK...',
      '.....KXDK...',
      '....KXDK....',
      '...KXDK.....',
      '...KDK......',
      '...KK.......',
    ],
    { K: INK, X: XP, L: XP_LIGHT, D: XP_DARK },
  ),
  mobility: fromRows(
    [
      '.....KK.....',
      '....KLLK....',
      '.....KK.....',
      '.KK..KK..KK.',
      '.KLKKLLKKLK.',
      '..KLLLLLLK..',
      '....KLLK....',
      '...KLKKLK...',
      '..KLK..KLK..',
      '.KLK....KLK.',
      'KLDK....KLDK',
      'KKKK....KKKK',
    ],
    { K: INK, L: RARE, D: TEXT },
  ),
};

export const LEVEL_UP: Sprite = fromRows(
  [
    '.....KK.....',
    '....KXXK....',
    '...KXXXXK...',
    '..KXXXXXXK..',
    '.KKKKXXKKKK.',
    '....KXXK....',
    '....KXXK....',
    '....KKKK....',
    '............',
    '.KKKKKKKKKK.',
    '.KGGGGGGGGK.',
    '.KKKKKKKKKK.',
  ],
  { K: INK, X: XP, G: TEXT },
);

export const LOOT_CHEST: Sprite = fromRows(
  [
    '............',
    '.KKKKKKKKKK.',
    'KLLLLLLLLLLK',
    'KDDDDGGDDDDK',
    'KDDDDGGDDDDK',
    'KKKKKYYKKKKK',
    'KDDDKYYKDDDK',
    'KDDDDKKDDDDK',
    'KDDDDDDDDDDK',
    'KGGGGGGGGGGK',
    'KDDDDDDDDDDK',
    'KKKKKKKKKKKK',
  ],
  { K: INK, L: ACCENT_LIGHT, D: ACCENT_DARK, G: GOLD, Y: '#ffe27a' },
);

export function isSkillKey(key: string): key is SkillKey {
  return Object.hasOwn(SKILL_SPRITES, key);
}

export const LOGO: Sprite = {
  cols: 30,
  rows: 12,
  pixels: [
    { x: 0, y: 3, w: 2, h: 6, fill: INK },
    { x: 2, y: 1, w: 3, h: 10, fill: INK },
    { x: 3, y: 2, w: 1, h: 8, fill: GOLD },
    { x: 5, y: 2, w: 3, h: 8, fill: INK },
    { x: 6, y: 3, w: 1, h: 6, fill: GOLD_DARK },
    { x: 8, y: 5, w: 14, h: 2, fill: INK },
    { x: 8, y: 5, w: 14, h: 1, fill: '#b3a58c' },
    { x: 22, y: 2, w: 3, h: 8, fill: INK },
    { x: 23, y: 3, w: 1, h: 6, fill: GOLD_DARK },
    { x: 25, y: 1, w: 3, h: 10, fill: INK },
    { x: 26, y: 2, w: 1, h: 8, fill: GOLD },
    { x: 28, y: 3, w: 2, h: 6, fill: INK },
  ],
};

export const TROPHY: Sprite = {
  cols: 12,
  rows: 12,
  pixels: [
    { x: 2, y: 1, w: 8, h: 1, fill: INK },
    { x: 2, y: 2, w: 8, h: 4, fill: GOLD },
    { x: 0, y: 2, w: 2, h: 1, fill: GOLD },
    { x: 10, y: 2, w: 2, h: 1, fill: GOLD },
    { x: 0, y: 3, w: 1, h: 2, fill: GOLD },
    { x: 11, y: 3, w: 1, h: 2, fill: GOLD },
    { x: 3, y: 6, w: 6, h: 1, fill: GOLD_DARK },
    { x: 5, y: 7, w: 2, h: 2, fill: GOLD_DARK },
    { x: 3, y: 9, w: 6, h: 2, fill: GOLD },
    { x: 3, y: 11, w: 6, h: 1, fill: INK },
    { x: 4, y: 3, w: 1, h: 2, fill: '#ffe27a' },
  ],
};

const SKILL_PET_SPRITES: Record<SkillPetIconKey, Sprite> = {
  pelican: fromRows(
    [
      '............',
      '..KKKK......',
      '.KWWWWK.....',
      '.KWKWWGGGGK.',
      '.KWWWWGAAAK.',
      '..KWWWKGAK..',
      '.KWWWWWKK...',
      'KWWWWWWWK...',
      'KWSWWWWWK...',
      '.KWSSWWK....',
      '..KKGKGK....',
      '............',
    ],
    { K: INK, W: TEXT, S: PARCHMENT_SHADE, G: GOLD, A: ACCENT_DARK },
  ),
  bat: fromRows(
    [
      '............',
      '....K..K....',
      'K..KBKKBK..K',
      'KK.KBBBBK.KK',
      'KDKKBRBRKKDK',
      'KDDKBBBBKDDK',
      'KDDDKBBKDDDK',
      '.KDDDBBDDDK.',
      '..KDKBBKDK..',
      '...K.KK.K...',
      '............',
      '............',
    ],
    { K: INK, B: CONTROL_BORDER, D: PANEL_BORDER, R: DANGER },
  ),
  owl: fromRows(
    [
      '............',
      '..K......K..',
      '..KK....KK..',
      '..KBBBBBBK..',
      '.KBWWBBWWBK.',
      '.KBWKBBKWBK.',
      '.KBBBGGBBBK.',
      'KBBSBBBBSBBK',
      'KBSSSBBSSSBK',
      '.KBSSSSSSBK.',
      '..KGGKKGGK..',
      '............',
    ],
    { K: INK, B: CONTROL_BORDER, W: TEXT, S: PARCHMENT_SHADE, G: GOLD },
  ),
  squirrel: fromRows(
    [
      '............',
      '.KKK....K.K.',
      'KBBBK..KBKBK',
      'KBLLBK.KBBBK',
      'KBLLBKKBKBBK',
      '.KBLBKBBBBBK',
      '..KBBKBGGBK.',
      '..KBBBGAAGK.',
      '...KBBBGGBK.',
      '...KBBBBBBK.',
      '....KBKKBK..',
      '............',
    ],
    { K: INK, B: ACCENT_DARK, L: ACCENT_LIGHT, G: GOLD, A: PANEL_BORDER },
  ),
  frog: fromRows(
    [
      '............',
      '..KKK..KKK..',
      '.KWKWKKWKWK.',
      '.KGGGGGGGGK.',
      'KGGKGGGGKGGK',
      'KGGGKKKKGGGK',
      '.KGLLLLLLGK.',
      'KGGLLLLLLGGK',
      'KGDKLLLLKDGK',
      'KGDDKKKKDDGK',
      '.KKKK..KKKK.',
      '............',
    ],
    { K: INK, G: XP, L: XP_LIGHT, D: XP_DARK, W: TEXT },
  ),
  armadillo: fromRows(
    [
      '............',
      '....KKKK....',
      '..KKSBSBKK..',
      '.KSBSBSBSBK.',
      '.KSBSBSBSBK.',
      'KSBSBSBSBSBK',
      'KSBSBSBSKPPK',
      'KSBSBSBSKKPK',
      '.KSBSBSBKPPK',
      '.KSBSBSBSKK.',
      '..KKKKKKKK..',
      '............',
    ],
    { K: INK, B: PLATE_STEEL, S: INPUT_ICON, P: DANGER },
  ),
  gecko: fromRows(
    [
      '....KKKK....',
      '...KGGGGK...',
      '...KYGGYK...',
      'GG.KGGGGK.GG',
      '.GGKGLLGKGG.',
      '..KGGLLGGK..',
      '..KGGLLGGK..',
      '...KGLLGK...',
      '.GGKGGGGKGG.',
      'GG.KGGGGK.GG',
      '....KGGK....',
      '.....KGK....',
    ],
    { K: INK, G: XP, L: XP_LIGHT, Y: GOLD },
  ),
  hare: fromRows(
    [
      '...KK.KK....',
      '..KWPKWPK...',
      '..KWPKWPK...',
      '...KWKWK....',
      '..KWWWWWK...',
      '.KWWKWWWWK..',
      'KPWWWWWWWWK.',
      '.KKWWWWWWWWK',
      '...KWWWWWWSK',
      '..KSWWKKWWK.',
      '.KKKK..KKKK.',
      '............',
    ],
    { K: INK, W: PARCHMENT, P: DANGER, S: PARCHMENT_SHADE },
  ),
  fox: fromRows(
    [
      'K..K........',
      'KOKOK.......',
      'KOOOOK....KK',
      'KOKOOK...KOK',
      'KWWOOK..KOOK',
      '.KWOOKKKKOWK',
      '.KOOOOOOOKWK',
      '..KOOOOOOK.K',
      '..KOKKKKOK..',
      '..KK....KK..',
      '............',
      '............',
    ],
    { K: INK, O: ACCENT_DARK, W: TEXT },
  ),
  cat: fromRows(
    [
      '............',
      '.K.K........',
      'KCKCK.......',
      'KYKYKK......',
      'KCCCCK.....K',
      '.KCCCCKKKKCK',
      '..KCCCCCCCK.',
      '..KCCCCCCCK.',
      '.KCKK..KKCK.',
      'KCK.....KCK.',
      'KK......KK..',
      '............',
    ],
    { K: INK, C: PLATE_STEEL, Y: GOLD },
  ),
};

function isSkillPetIcon(kind: ItemIconKind): kind is SkillPetIconKey {
  return Object.hasOwn(SKILL_PET_SPRITES, kind);
}

export function itemSprite(kind: ItemIconKind, color: string): Sprite {
  if (isSkillPetIcon(kind)) return SKILL_PET_SPRITES[kind];
  return { cols: 12, rows: 12, pixels: itemPixels(kind, color) };
}

function itemPixels(kind: Exclude<ItemIconKind, SkillPetIconKey>, color: string): Pixel[] {
  switch (kind) {
    case 'belt':
      return [
        { x: 1, y: 4, w: 10, h: 4, fill: color },
        { x: 1, y: 4, w: 10, h: 1, fill: INK, opacity: 0.25 },
        { x: 5, y: 3, w: 3, h: 6, fill: INK },
        { x: 6, y: 4, w: 1, h: 4, fill: '#d8c8a8' },
      ];
    case 'chalk':
      return [
        { x: 3, y: 3, w: 6, h: 7, fill: '#f0e6d0' },
        { x: 4, y: 2, w: 4, h: 1, fill: '#d8c8a8' },
        { x: 3, y: 5, w: 6, h: 2, fill: color },
        { x: 3, y: 10, w: 6, h: 1, fill: INK },
      ];
    case 'straps':
      return [
        { x: 2, y: 2, w: 2, h: 8, fill: color },
        { x: 5, y: 2, w: 2, h: 8, fill: color },
        { x: 8, y: 2, w: 2, h: 8, fill: color },
        { x: 2, y: 6, w: 8, h: 1, fill: INK, opacity: 0.4 },
      ];
    case 'sleeves':
      return [
        { x: 2, y: 2, w: 3, h: 8, fill: color },
        { x: 7, y: 2, w: 3, h: 8, fill: color },
        { x: 2, y: 2, w: 3, h: 1, fill: INK, opacity: 0.4 },
        { x: 7, y: 2, w: 3, h: 1, fill: INK, opacity: 0.4 },
      ];
    case 'shoes':
      return [
        { x: 2, y: 4, w: 4, h: 4, fill: color },
        { x: 2, y: 8, w: 9, h: 2, fill: color },
        { x: 2, y: 10, w: 9, h: 1, fill: INK },
      ];
    case 'gloves':
      return [
        { x: 3, y: 5, w: 6, h: 5, fill: color },
        { x: 3, y: 2, w: 1, h: 3, fill: color },
        { x: 5, y: 1, w: 1, h: 4, fill: color },
        { x: 7, y: 2, w: 1, h: 3, fill: color },
        { x: 9, y: 5, w: 2, h: 2, fill: color },
        { x: 3, y: 8, w: 6, h: 1, fill: INK, opacity: 0.35 },
        { x: 3, y: 10, w: 6, h: 1, fill: INK },
      ];
    case 'scraps':
      return [
        { x: 2, y: 6, w: 3, h: 3, fill: color },
        { x: 5, y: 4, w: 3, h: 4, fill: color, opacity: 0.8 },
        { x: 7, y: 7, w: 3, h: 3, fill: color, opacity: 0.6 },
      ];
    case 'pet':
      return [
        { x: 2, y: 2, w: 2, h: 2, fill: color },
        { x: 8, y: 2, w: 2, h: 2, fill: color },
        { x: 2, y: 4, w: 8, h: 6, fill: color },
        { x: 4, y: 6, w: 1, h: 1, fill: INK },
        { x: 7, y: 6, w: 1, h: 1, fill: INK },
        { x: 5, y: 8, w: 2, h: 1, fill: INK, opacity: 0.5 },
        { x: 2, y: 10, w: 8, h: 1, fill: INK },
      ];
    case 'scroll':
      return [
        { x: 2, y: 2, w: 8, h: 8, fill: '#d8c8a8' },
        { x: 1, y: 2, w: 10, h: 1, fill: '#8a7d66' },
        { x: 1, y: 9, w: 10, h: 1, fill: '#8a7d66' },
        { x: 4, y: 4, w: 4, h: 1, fill: '#5c4f3d' },
        { x: 4, y: 6, w: 3, h: 1, fill: '#5c4f3d' },
      ];
    case 'locked':
      return [
        { x: 4, y: 2, w: 4, h: 1, fill: '#5c4f3d' },
        { x: 7, y: 3, w: 1, h: 2, fill: '#5c4f3d' },
        { x: 5, y: 5, w: 2, h: 1, fill: '#5c4f3d' },
        { x: 5, y: 6, w: 1, h: 2, fill: '#5c4f3d' },
        { x: 5, y: 9, w: 1, h: 1, fill: '#5c4f3d' },
      ];
  }
}
