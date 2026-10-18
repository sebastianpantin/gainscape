import { defineConfig, devices } from '@playwright/test';
import { chromiumLaunchOptions, failureArtifacts, reuseLocalServer, runSettings } from './e2e/support/run-settings.ts';
import { assertStackEnvironment } from './e2e/support/stack-guard.ts';
import { webPort } from './web/build/ports.ts';

assertStackEnvironment();

const localAppUrl = `https://localhost:${webPort()}`;

export default defineConfig({
  testDir: 'e2e',
  testIgnore: ['pwa/**', 'pages/**'],
  timeout: 90_000,
  fullyParallel: true,
  ...runSettings,
  use: {
    baseURL: localAppUrl,
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
    ...failureArtifacts,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Pixel 7'],
        launchOptions: chromiumLaunchOptions,
      },
    },
    {
      name: 'webkit',
      use: { ...devices['iPhone 14'] },
    },
  ],
  webServer: {
    command: 'npx vite web --host',
    url: localAppUrl,
    ignoreHTTPSErrors: true,
    reuseExistingServer: reuseLocalServer,
    timeout: 60_000,
  },
});
