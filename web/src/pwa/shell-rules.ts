export const SHELL_CACHE_PREFIX = 'gainscape-shell-';
export const SUPABASE_PROXY_PREFIX = '/sb/';
export const SHELL_INDEX = '/index.html';
export const SHELL_MANIFEST = '/manifest.webmanifest';
export const SERVICE_WORKER_FILE = 'sw.js';
export const BUILD_ID_LENGTH = 16;
export const ACTIVATE_MESSAGE = 'gainscape:activate';

export type ShellDecision = 'index' | 'precached' | 'network';

export interface ShellRequest {
  method: string;
  url: string;
  mode: string;
  origin: string;
}

export interface ShellFile {
  path: string;
  sha256: string;
}

export interface ShellBuild {
  id: string;
  files: ShellFile[];
}

const PRECACHED_EXTENSIONS = ['.js', '.css', '.woff2'];
const PRECACHED_FILES = ['index.html', 'manifest.webmanifest', 'favicon.svg'];
const PRECACHED_DIRECTORIES = ['icons/', 'licenses/'];
const EXCLUDED_EXTENSIONS = ['.map', '.woff'];

export function shellDecision(request: ShellRequest, precached: ReadonlySet<string>): ShellDecision {
  if (request.method !== 'GET') return 'network';
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return 'network';
  }
  if (url.origin !== request.origin) return 'network';
  if (url.pathname === SUPABASE_PROXY_PREFIX.slice(0, -1) || url.pathname.startsWith(SUPABASE_PROXY_PREFIX))
    return 'network';
  if (precached.has(url.pathname)) return 'precached';
  if (request.mode === 'navigate') return 'index';
  return 'network';
}

function isPrecached(file: string): boolean {
  if (file === SERVICE_WORKER_FILE || file.startsWith('.vite/')) return false;
  if (EXCLUDED_EXTENSIONS.some((extension) => file.endsWith(extension))) return false;
  return (
    PRECACHED_FILES.includes(file) ||
    PRECACHED_DIRECTORIES.some((directory) => file.startsWith(directory)) ||
    PRECACHED_EXTENSIONS.some((extension) => file.endsWith(extension))
  );
}

export function precacheEntries(distFiles: readonly string[]): string[] {
  return [...new Set(distFiles.filter(isPrecached).map((file) => `/${file}`))].sort();
}

export function shellBuildManifestText(entries: readonly ShellFile[]): string {
  return [...entries]
    .sort((first, second) => (first.path < second.path ? -1 : first.path > second.path ? 1 : 0))
    .map((entry) => `${entry.path}\0${entry.sha256}\n`)
    .join('');
}

export function shellCacheName(buildId: string): string {
  return `${SHELL_CACHE_PREFIX}${buildId}`;
}
