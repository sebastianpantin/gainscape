import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { chromiumLaunchOptions, reuseLocalServer } from '../../e2e/support/run-settings.ts';
import { assertStackEnvironment } from '../../e2e/support/stack-guard.ts';
import { webPort } from '../../web/build/ports.ts';
import { SCREENSHOT_SCALE, SCREENSHOT_VIEWPORT } from './screens.ts';

assertStackEnvironment();

const localAppUrl = `https://localhost:${webPort()}`;

export default defineConfig({
  testDir: '.',
  testMatch: 'capture.ts',
  outputDir: join(import.meta.dirname, '../../test-results/screenshots'),
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    viewport: SCREENSHOT_VIEWPORT,
    deviceScaleFactor: SCREENSHOT_SCALE,
    baseURL: localAppUrl,
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
    contextOptions: { reducedMotion: 'reduce' },
    launchOptions: chromiumLaunchOptions,
  },
  webServer: {
    command: 'npx vite web --host',
    cwd: join(import.meta.dirname, '../..'),
    url: localAppUrl,
    ignoreHTTPSErrors: true,
    reuseExistingServer: reuseLocalServer,
    timeout: 60_000,
  },
});
