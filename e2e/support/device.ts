import { type Page } from '@playwright/test';

type VibrationLog = { vibrations: number[][] };

export async function recordVibrations(page: Page) {
  await page.addInitScript(() => {
    const log = window as unknown as VibrationLog;
    log.vibrations = [];
    navigator.vibrate = (pattern: number | Iterable<number>) => {
      log.vibrations.push(typeof pattern === 'number' ? [pattern] : [...pattern]);
      return true;
    };
  });
}

export function vibrations(page: Page): Promise<number[][]> {
  return page.evaluate(() => [...(window as unknown as VibrationLog).vibrations]);
}

export function takeVibrations(page: Page): Promise<number[][]> {
  return page.evaluate(() => (window as unknown as VibrationLog).vibrations.splice(0));
}
