import { defineConfig, devices } from '@playwright/test';
import { failureArtifacts, runSettings } from './e2e/support/run-settings.ts';
import { assertStackEnvironment } from './e2e/support/stack-guard.ts';
import { localStackStatus } from './scripts/local-stack.ts';
import { previewPort } from './web/build/ports.ts';

assertStackEnvironment();

const pagesPort = previewPort() + 1;
const pagesUrl = `http://127.0.0.1:${pagesPort}`;
const status = localStackStatus();

export default defineConfig({
  testDir: 'e2e/pages',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  ...runSettings,
  use: {
    ...devices['Pixel 7'],
    baseURL: pagesUrl,
    serviceWorkers: 'block',
    ...failureArtifacts,
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  webServer: {
    command: `node scripts/deploy/build-pages.ts && node_modules/.bin/wrangler pages dev web/dist --ip 127.0.0.1 --port ${pagesPort}`,
    url: pagesUrl,
    env: { VITE_SUPABASE_URL: new URL(status.API_URL).origin, VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
