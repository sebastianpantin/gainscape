import { ACTIVATE_MESSAGE, SHELL_CACHE_PREFIX } from '../pwa/shell-rules.ts';

declare const self: ServiceWorkerGlobalScope;

async function retire(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith(SHELL_CACHE_PREFIX)).map((name) => caches.delete(name)));
  await self.registration.unregister();
  const windows = await self.clients.matchAll({ type: 'window' });
  await Promise.all(windows.map((client) => client.navigate(client.url).catch(() => null)));
}

self.addEventListener('install', () => void self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil(retire()));

self.addEventListener('message', (event) => {
  if ((event.data as { type?: unknown } | null)?.type === ACTIVATE_MESSAGE) void self.skipWaiting();
});
