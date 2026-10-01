import { defineConfig, devices } from '@playwright/test';
import { assertStackEnvironment } from './e2e/support/stack-guard.ts';
import { webPort } from './web/build/ports.ts';

assertStackEnvironment();

const localAppUrl = `https://localhost:${webPort()}`;

export default defineConfig({
  testDir: 'e2e',
  testIgnore: 'pwa/**',
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: localAppUrl,
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  webServer: {
    command: 'npx vite web --host',
    url: localAppUrl,
    ignoreHTTPSErrors: true,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
