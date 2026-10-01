import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const stackEnvPath = join(import.meta.dirname, '.stack.env');
if (existsSync(stackEnvPath)) {
  const expected = /^SUPABASE_PROJECT_ID=(.*)$/m.exec(readFileSync(stackEnvPath, 'utf8'))?.[1]?.trim();
  if (expected && process.env.SUPABASE_PROJECT_ID !== expected) {
    throw new Error(
      `.stack.env sets SUPABASE_PROJECT_ID=${expected} but the environment has ${process.env.SUPABASE_PROJECT_ID ?? 'none'}; ` +
        'run through make, or `set -a; . ./.stack.env; set +a` first, so e2e never drives another stack',
    );
  }
}

const localAppUrl = `https://localhost:${process.env.GAINSCAPE_WEB_PORT ?? 5173}`;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: localAppUrl,
    ignoreHTTPSErrors: true,
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
