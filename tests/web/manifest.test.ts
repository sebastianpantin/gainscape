import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../../scripts/icons/png.ts';
import { SCREENSHOT_MAX_BYTES, SCREENSHOT_SIZE, WIDE_SCREENSHOT_SIZE } from '../../scripts/screenshots/screens.ts';
import { APP_TITLE, routeTitle } from '../../web/src/lib/platform/route-title-rules.ts';

const shortcutIcon = (src: string) => ({ src, sizes: '192x192', type: 'image/png' });
const narrowScreenshot = {
  sizes: `${SCREENSHOT_SIZE.width}x${SCREENSHOT_SIZE.height}`,
  type: 'image/png',
  form_factor: 'narrow',
};
const wideScreenshot = {
  sizes: `${WIDE_SCREENSHOT_SIZE.width}x${WIDE_SCREENSHOT_SIZE.height}`,
  type: 'image/png',
  form_factor: 'wide',
};

const webDir = join(import.meta.dirname, '../../web');
const manifest = JSON.parse(readFileSync(join(webDir, 'public/manifest.webmanifest'), 'utf8'));
const indexHtml = readFileSync(join(webDir, 'index.html'), 'utf8');
const tokens = readFileSync(join(webDir, 'src/styles/tokens.css'), 'utf8');

describe('web manifest', () => {
  it('has exactly the planned fields', () => {
    expect(manifest).toEqual({
      id: '/',
      name: 'Gainscape',
      short_name: 'Gainscape',
      description: 'Strength training log with skills, levels and loot.',
      lang: 'en',
      dir: 'ltr',
      categories: ['health', 'fitness', 'sports'],
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#241b13',
      theme_color: '#241b13',
      launch_handler: { client_mode: 'focus-existing' },
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      shortcuts: [
        { name: 'Train', url: '/', icons: [shortcutIcon('/icons/icon-192.png')] },
        { name: 'Program', url: '/programs/active', icons: [shortcutIcon('/icons/shortcut-program-192.png')] },
        { name: 'Skills', url: '/skills', icons: [shortcutIcon('/icons/shortcut-skills-192.png')] },
      ],
      screenshots: [
        { ...narrowScreenshot, src: '/screenshots/train.png', label: 'Logging a workout' },
        { ...narrowScreenshot, src: '/screenshots/skills.png', label: 'Skills and levels' },
        { ...narrowScreenshot, src: '/screenshots/collection.png', label: 'Personal records' },
        { ...wideScreenshot, src: '/screenshots/train-wide.png', label: 'Logging a workout on a wide screen' },
      ],
    });
  });

  it('points shortcuts at app routes and at generated icons whose PNG size matches sizes', () => {
    for (const shortcut of manifest.shortcuts as { url: string; icons: { src: string; sizes: string }[] }[]) {
      expect(routeTitle(shortcut.url)).not.toBe(APP_TITLE);
      for (const icon of shortcut.icons) {
        const path = join(webDir, 'public', icon.src);
        expect(existsSync(path), icon.src).toBe(true);
        const { width, height } = decodePng(readFileSync(path));
        expect(`${width}x${height}`).toBe(icon.sizes);
      }
    }
  });

  it('gives each shortcut its own icon', () => {
    const sources = (manifest.shortcuts as { icons: { src: string }[] }[]).map((shortcut) => shortcut.icons[0].src);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it('points at small screenshots whose PNG size matches sizes', () => {
    for (const screenshot of manifest.screenshots as { src: string; sizes: string }[]) {
      const path = join(webDir, 'public', screenshot.src);
      expect(existsSync(path), screenshot.src).toBe(true);
      expect(statSync(path).size, screenshot.src).toBeLessThan(SCREENSHOT_MAX_BYTES);
      const { width, height } = decodePng(readFileSync(path));
      expect(`${width}x${height}`).toBe(screenshot.sizes);
    }
  });

  it('points at icon files whose PNG size matches sizes', () => {
    for (const icon of manifest.icons as { src: string; sizes: string }[]) {
      const path = join(webDir, 'public', icon.src);
      expect(existsSync(path)).toBe(true);
      const { width, height } = decodePng(readFileSync(path));
      expect(`${width}x${height}`).toBe(icon.sizes);
    }
  });

  it('uses the background token as the theme colour in the manifest and index.html', () => {
    const background = /--color-background:\s*(#[0-9a-f]+);/i.exec(tokens)?.[1];
    const meta = /<meta name="theme-color" content="([^"]+)"/.exec(indexHtml)?.[1];
    expect(manifest.theme_color).toBe(background);
    expect(meta).toBe(background);
  });

  it('describes the app in index.html with the manifest description', () => {
    const meta = /<meta name="description" content="([^"]+)"/.exec(indexHtml)?.[1];
    expect(meta).toBe(manifest.description);
  });

  it('links the manifest, the favicons and the apple-touch-icon from index.html', () => {
    expect(indexHtml).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(indexHtml).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
    expect(indexHtml).toContain('href="/icons/favicon-32.png"');
    expect(indexHtml).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />');
    for (const href of ['/favicon.svg', '/icons/favicon-32.png', '/icons/apple-touch-icon-180.png'])
      expect(existsSync(join(webDir, 'public', href))).toBe(true);
  });
});
