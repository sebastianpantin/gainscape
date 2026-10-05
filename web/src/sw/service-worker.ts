import {
  ACTIVATE_MESSAGE,
  SHELL_CACHE_PREFIX,
  SHELL_INDEX,
  shellCacheName,
  shellDecision,
  type ShellBuild,
  type ShellFile,
} from '../pwa/shell-rules.ts';

declare const self: ServiceWorkerGlobalScope;

const shell: ShellBuild = __SHELL_BUILD__;
const cacheName = shellCacheName(shell.id);
const precached = new Set(shell.files.map((file) => file.path));

const BODY_ENCODING_HEADERS = ['content-encoding', 'content-length'];

function hex(digest: ArrayBuffer): string {
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifiedFile(file: ShellFile): Promise<[string, Response]> {
  const response = await fetch(new Request(file.path, { cache: 'reload' }));
  if (!response.ok) throw new Error(`${file.path} answered ${response.status}`);
  const body = await response.arrayBuffer();
  if (hex(await crypto.subtle.digest('SHA-256', body)) !== file.sha256)
    throw new Error(`${file.path} does not match this build`);
  const headers = new Headers(response.headers);
  for (const encodingHeader of BODY_ENCODING_HEADERS) headers.delete(encodingHeader);
  const unredirected = new Response(body, { status: response.status, statusText: response.statusText, headers });
  return [file.path, unredirected];
}

async function installShell(): Promise<void> {
  const verified = await Promise.all(shell.files.map(verifiedFile));
  const existed = await caches.has(cacheName);
  const cache = await caches.open(cacheName);
  try {
    await Promise.all(verified.map(([path, response]) => cache.put(path, response)));
  } catch (error) {
    if (!existed) await caches.delete(cacheName);
    throw error;
  }
}

async function deleteOldShells(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== cacheName)
      .map((name) => caches.delete(name)),
  );
}

async function fromShell(path: string, request: Request): Promise<Response> {
  let cached: Response | undefined;
  try {
    cached = await (await caches.open(cacheName)).match(path);
  } catch {
    cached = undefined;
  }
  return cached ?? fetch(request);
}

self.addEventListener('install', (event) => event.waitUntil(installShell()));

self.addEventListener('activate', (event) => event.waitUntil(deleteOldShells()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const decision = shellDecision(
    { method: request.method, url: request.url, mode: request.mode, origin: self.location.origin },
    precached,
  );
  if (decision === 'network') return;
  event.respondWith(fromShell(decision === 'index' ? SHELL_INDEX : new URL(request.url).pathname, request));
});

self.addEventListener('message', (event) => {
  if ((event.data as { type?: unknown } | null)?.type === ACTIVATE_MESSAGE) void self.skipWaiting();
});

async function focusOpenApp(): Promise<void> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const open = windows.at(0);
  if (open) await open.focus();
  else await self.clients.openWindow(self.registration.scope);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(focusOpenApp());
});
