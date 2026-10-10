import { type PlaywrightTestConfig } from '@playwright/test';

const onCi = Boolean(process.env.CI);

export const runSettings = {
  forbidOnly: onCi,
  retries: onCi ? 1 : 0,
  reporter: onCi ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list']],
} satisfies PlaywrightTestConfig;

export const failureArtifacts = {
  trace: 'retain-on-failure',
  screenshot: 'only-on-failure',
} satisfies PlaywrightTestConfig['use'];

export const reuseLocalServer = !onCi;

export const chromiumLaunchOptions = { executablePath: process.env.CHROMIUM_PATH || undefined };
