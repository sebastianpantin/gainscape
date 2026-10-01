import type { ItemIconKey } from '@domain/crafting.ts';

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

export function itemSprite(kind: ItemIconKind, color: string): Sprite {
  return { cols: 12, rows: 12, pixels: itemPixels(kind, color) };
}

function itemPixels(kind: ItemIconKind, color: string): Pixel[] {
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
