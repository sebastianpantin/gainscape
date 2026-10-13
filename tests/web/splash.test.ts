import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../../scripts/icons/png.ts';
import { type SplashLayout, SPLASH_SCREENS, splashFile } from '../../scripts/icons/render.ts';

const webDir = join(import.meta.dirname, '../../web');
const indexHtml = readFileSync(join(webDir, 'index.html'), 'utf8');
const startupLinks = [
  ...indexHtml.matchAll(/<link\s+rel="apple-touch-startup-image"\s+href="([^"]+)"\s+media="([^"]+)"\s*\/>/g),
];

function portraitMedia(layout: SplashLayout): string {
  return `(device-width: ${layout.width}px) and (device-height: ${layout.height}px) and (-webkit-device-pixel-ratio: ${layout.ratio}) and (orientation: portrait)`;
}

describe('iOS splash screens', () => {
  it('lists each device size once', () => {
    const media = SPLASH_SCREENS.map(portraitMedia);
    expect(new Set(media).size).toBe(media.length);
    const files = SPLASH_SCREENS.map(splashFile);
    expect(new Set(files).size).toBe(files.length);
  });

  it('covers the iPhone SE, the current iPhones and the current iPads', () => {
    const triples = SPLASH_SCREENS.map((layout) => `${layout.width}x${layout.height}@${layout.ratio}`);
    for (const expected of ['375x667@2', '402x874@3', '420x912@3', '440x956@3', '744x1133@2', '1032x1376@2'])
      expect(triples).toContain(expected);
  });

  it('links exactly one portrait startup image per splash layout from index.html', () => {
    expect(indexHtml.match(/apple-touch-startup-image/g)?.length ?? 0).toBe(SPLASH_SCREENS.length);
    expect(startupLinks.map(([, href, media]) => [href, media]).sort()).toEqual(
      SPLASH_SCREENS.map((layout) => [`/splash/${splashFile(layout)}`, portraitMedia(layout)]).sort(),
    );
  });

  it('points at committed PNGs whose size is the CSS size times the pixel ratio', () => {
    for (const layout of SPLASH_SCREENS) {
      const path = join(webDir, 'public/splash', splashFile(layout));
      expect(existsSync(path), path).toBe(true);
      const { width, height } = decodePng(readFileSync(path));
      expect([width, height]).toEqual([layout.width * layout.ratio, layout.height * layout.ratio]);
    }
  });
});
