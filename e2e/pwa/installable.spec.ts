import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, devices } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { waitForController } from '../support/pwa.ts';

test('the app is installable', async ({ baseURL }) => {
  const profileDir = mkdtempSync(join(tmpdir(), 'gainscape-installable-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    ...devices['Pixel 7'],
    baseURL,
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto('/');
    await waitForController(page);
    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    expect(installabilityErrors).toEqual([]);
    const manifest = await cdp.send('Page.getAppManifest');
    expect(manifest.errors).toEqual([]);
    expect(manifest.url.endsWith('/manifest.webmanifest')).toBe(true);
    const parsed = JSON.parse(manifest.data ?? '{}') as {
      icons: { src: string }[];
      shortcuts: { icons: { src: string }[] }[];
      screenshots: { src: string }[];
    };
    expect(parsed.icons.length).toBeGreaterThan(0);
    const startupImages = await page
      .locator('link[rel="apple-touch-startup-image"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(startupImages.length).toBeGreaterThan(0);
    const manifestImages = [
      ...parsed.icons,
      ...parsed.shortcuts.flatMap((shortcut) => shortcut.icons),
      ...parsed.screenshots,
    ];
    for (const src of [...manifestImages.map((image) => image.src), ...startupImages]) {
      const response = await page.request.get(src);
      expect(response.status(), src).toBe(200);
      expect(response.headers()['content-type'], src).toContain('image/png');
    }
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
