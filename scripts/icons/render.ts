import { APP_ICON_BACKGROUND, APP_ICON_FRAME, LOGO, type Sprite } from '../../web/src/components/pixel-sprites.ts';
import type { RgbaImage } from './png.ts';

export interface IconLayout {
  file: string;
  size: number;
  scale: number;
  frame: boolean;
}

const FRAME_INSET_FRACTION = 0.08;
export const MASKABLE_SAFE_RADIUS_FRACTION = 0.4;

export const APP_ICONS: readonly IconLayout[] = [
  { file: 'icon-192.png', size: 192, scale: 5, frame: true },
  { file: 'icon-512.png', size: 512, scale: 13, frame: true },
  { file: 'maskable-512.png', size: 512, scale: 12, frame: false },
  { file: 'apple-touch-icon-180.png', size: 180, scale: 4, frame: false },
  { file: 'favicon-32.png', size: 32, scale: 1, frame: false },
];

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

function renderSprite(sprite: Sprite, size: number, scale: number, frame: boolean): RgbaImage {
  const image: RgbaImage = { width: size, height: size, rgba: new Uint8Array(size * size * 4) };
  fillRect(image, 0, 0, size, size, parseColor(APP_ICON_BACKGROUND));
  if (frame) drawFrame(image, Math.round(size * FRAME_INSET_FRACTION), scale, parseColor(APP_ICON_FRAME));
  const left = Math.floor((size - sprite.cols * scale) / 2);
  const top = Math.floor((size - sprite.rows * scale) / 2);
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
  return renderSprite(LOGO, layout.size, layout.scale, layout.frame);
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
