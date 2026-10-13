import {
  APP_ICON_BACKGROUND,
  APP_ICON_FRAME,
  itemSprite,
  LEVEL_UP,
  LOGO,
  type Sprite,
} from '../../web/src/components/pixel-sprites.ts';
import type { RgbaImage } from './png.ts';

export interface IconLayout {
  file: string;
  size: number;
  scale: number;
  frame: boolean;
  sprite?: Sprite;
}

const FRAME_INSET_FRACTION = 0.08;
export const MASKABLE_SAFE_RADIUS_FRACTION = 0.4;

export const APP_ICONS: readonly IconLayout[] = [
  { file: 'icon-192.png', size: 192, scale: 5, frame: true },
  { file: 'icon-512.png', size: 512, scale: 13, frame: true },
  { file: 'maskable-512.png', size: 512, scale: 12, frame: false },
  { file: 'apple-touch-icon-180.png', size: 180, scale: 4, frame: false },
  { file: 'favicon-32.png', size: 32, scale: 1, frame: false },
  { file: 'shortcut-program-192.png', size: 192, scale: 10, frame: true, sprite: itemSprite('scroll', APP_ICON_FRAME) },
  { file: 'shortcut-skills-192.png', size: 192, scale: 10, frame: true, sprite: LEVEL_UP },
];

export interface SplashLayout {
  width: number;
  height: number;
  ratio: number;
}

const SPLASH_LOGO_WIDTH_FRACTION = 0.35;

export const SPLASH_SCREENS: readonly SplashLayout[] = [
  { width: 375, height: 667, ratio: 2 },
  { width: 414, height: 736, ratio: 3 },
  { width: 375, height: 812, ratio: 3 },
  { width: 414, height: 896, ratio: 2 },
  { width: 414, height: 896, ratio: 3 },
  { width: 390, height: 844, ratio: 3 },
  { width: 428, height: 926, ratio: 3 },
  { width: 393, height: 852, ratio: 3 },
  { width: 430, height: 932, ratio: 3 },
  { width: 402, height: 874, ratio: 3 },
  { width: 420, height: 912, ratio: 3 },
  { width: 440, height: 956, ratio: 3 },
  { width: 744, height: 1133, ratio: 2 },
  { width: 768, height: 1024, ratio: 2 },
  { width: 810, height: 1080, ratio: 2 },
  { width: 820, height: 1180, ratio: 2 },
  { width: 834, height: 1112, ratio: 2 },
  { width: 834, height: 1194, ratio: 2 },
  { width: 834, height: 1210, ratio: 2 },
  { width: 1024, height: 1366, ratio: 2 },
  { width: 1032, height: 1376, ratio: 2 },
];

export function splashFile(layout: SplashLayout): string {
  return `splash-${layout.width * layout.ratio}x${layout.height * layout.ratio}.png`;
}

type Rgba = [number, number, number, number];

export function parseColor(hex: string): Rgba {
  const digits = hex.replace('#', '');
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  return [0, 2, 4].map((start) => parseInt(full.slice(start, start + 2), 16)).concat(255) as Rgba;
}

function fillRect(image: RgbaImage, x: number, y: number, w: number, h: number, color: Rgba, opacity = 1) {
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      const offset = (row * image.width + col) * 4;
      for (let channel = 0; channel < 3; channel++) {
        image.rgba[offset + channel] = Math.round(
          color[channel] * opacity + image.rgba[offset + channel] * (1 - opacity),
        );
      }
      image.rgba[offset + 3] = 255;
    }
  }
}

function drawFrame(image: RgbaImage, inset: number, thickness: number, color: Rgba) {
  const span = image.width - 2 * inset;
  fillRect(image, inset, inset, span, thickness, color);
  fillRect(image, inset, image.height - inset - thickness, span, thickness, color);
  fillRect(image, inset, inset, thickness, span, color);
  fillRect(image, image.width - inset - thickness, inset, thickness, span, color);
}

function renderSprite(sprite: Sprite, width: number, height: number, scale: number, frame: boolean): RgbaImage {
  const image: RgbaImage = { width, height, rgba: new Uint8Array(width * height * 4) };
  fillRect(image, 0, 0, width, height, parseColor(APP_ICON_BACKGROUND));
  if (frame) drawFrame(image, Math.round(width * FRAME_INSET_FRACTION), scale, parseColor(APP_ICON_FRAME));
  const left = Math.floor((width - sprite.cols * scale) / 2);
  const top = Math.floor((height - sprite.rows * scale) / 2);
  for (const pixel of sprite.pixels) {
    fillRect(
      image,
      left + pixel.x * scale,
      top + pixel.y * scale,
      pixel.w * scale,
      pixel.h * scale,
      parseColor(pixel.fill),
      pixel.opacity,
    );
  }
  return image;
}

export function renderAppIcon(layout: IconLayout): RgbaImage {
  return renderSprite(layout.sprite ?? LOGO, layout.size, layout.size, layout.scale, layout.frame);
}

export function renderSplash(layout: SplashLayout): RgbaImage {
  const width = layout.width * layout.ratio;
  const scale = Math.round((width * SPLASH_LOGO_WIDTH_FRACTION) / LOGO.cols);
  return renderSprite(LOGO, width, layout.height * layout.ratio, scale, false);
}

function spriteSvg(sprite: Sprite): string {
  const rects = sprite.pixels.map(
    (pixel) =>
      `  <rect x="${pixel.x}" y="${pixel.y}" width="${pixel.w}" height="${pixel.h}" fill="${pixel.fill}"${
        pixel.opacity === undefined ? '' : ` opacity="${pixel.opacity}"`
      }/>`,
  );
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sprite.cols} ${sprite.rows}" shape-rendering="crispEdges">`,
    ...rects,
    '</svg>',
    '',
  ].join('\n');
}

export function faviconSvg(): string {
  return spriteSvg(LOGO);
}
