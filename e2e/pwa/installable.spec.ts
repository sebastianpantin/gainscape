import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, devices, expect, test } from '@playwright/test';
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
    const icons = JSON.parse(manifest.data ?? '{}').icons as { src: string }[];
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      const response = await page.request.get(icon.src);
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()['content-type'], icon.src).toContain('image/png');
    }
  } finally {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  }
});
