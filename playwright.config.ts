import { defineConfig, devices } from '@playwright/test';

const localAppUrl = 'https://localhost:5173';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: localAppUrl,
    ignoreHTTPSErrors: true,
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
