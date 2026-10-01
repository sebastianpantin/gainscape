import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { shellBuildFor } from '../../web/build/service-worker-plugin.ts';
import { SERVICE_WORKER_FILE } from '../../web/src/pwa/shell-rules.ts';

const distDir = join(import.meta.dirname, '../../web/dist');
export const serviceWorkerPath = join(distDir, SERVICE_WORKER_FILE);

export const OFFLINE_BANNER = 'Offline. Your workout is saved on this device.';
export const UPDATE_READY = 'A new version of Gainscape is ready.';

export function builtShell() {
  return shellBuildFor(distDir);
}

export async function waitForController(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect
    .poll(async () => {
      if (await page.evaluate(() => navigator.serviceWorker.controller !== null)) return true;
      await page.reload();
      return false;
    })
    .toBe(true);
}

export async function markPageOffline(page: Page): Promise<() => Promise<void>> {
  const conditions = { latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.emulateNetworkConditions', { ...conditions, offline: true });
  return async () => {
    await cdp.send('Network.emulateNetworkConditions', { ...conditions, offline: false });
    await cdp.detach();
  };
}

export async function fetchOutcome(page: Page, path: string): Promise<'ok' | 'rejected'> {
  return page.evaluate(
    (url) =>
      fetch(url).then(
        () => 'ok' as const,
        () => 'rejected' as const,
      ),
    path,
  );
}

export async function cachedPaths(page: Page): Promise<{ cacheName: string; paths: string[] }[]> {
  return page.evaluate(async () => {
    const names = await caches.keys();
    return Promise.all(
      names.map(async (cacheName) => {
        const requests = await (await caches.open(cacheName)).keys();
        return { cacheName, paths: requests.map((request) => new URL(request.url).pathname) };
      }),
    );
  });
}

export function replaceBuildId(fromId: string, toId: string): string {
  const original = readFileSync(serviceWorkerPath, 'utf8');
  if (!original.includes(fromId)) throw new Error(`${SERVICE_WORKER_FILE} does not contain build ${fromId}`);
  writeFileSync(serviceWorkerPath, original.replaceAll(fromId, toId));
  return original;
}

export function swapServiceWorker(replacement: string): string {
  const original = readFileSync(serviceWorkerPath, 'utf8');
  writeFileSync(serviceWorkerPath, replacement);
  return original;
}

export function restoreServiceWorker(original: string): void {
  writeFileSync(serviceWorkerPath, original);
}
