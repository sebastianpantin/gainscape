import { defineConfig, devices } from '@playwright/test';
import { failureArtifacts, runSettings } from './e2e/support/run-settings.ts';
import { assertStackEnvironment } from './e2e/support/stack-guard.ts';
import { previewPort } from './web/build/ports.ts';

assertStackEnvironment();

const previewUrl = `http://localhost:${previewPort()}`;

export default defineConfig({
  testDir: 'e2e/pwa',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  ...runSettings,
  use: {
    ...devices['Pixel 7'],
    baseURL: previewUrl,
    serviceWorkers: 'allow',
    ...failureArtifacts,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  webServer: {
    command: 'npx vite preview web',
    url: previewUrl,
    env: { GAINSCAPE_PLAIN_HTTP: '1' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
