import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../../scripts/icons/png.ts';

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
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#241b13',
      theme_color: '#241b13',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    });
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

  it('links the manifest, the favicons and the apple-touch-icon from index.html', () => {
    expect(indexHtml).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(indexHtml).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />');
    expect(indexHtml).toContain('href="/icons/favicon-32.png"');
    expect(indexHtml).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />');
    for (const href of ['/favicon.svg', '/icons/favicon-32.png', '/icons/apple-touch-icon-180.png'])
      expect(existsSync(join(webDir, 'public', href))).toBe(true);
  });
});
