import { describe, expect, it } from 'vitest';
import {
  precacheEntries,
  shellBuildManifestText,
  shellCacheName,
  shellDecision,
  type ShellDecision,
} from '../../web/src/pwa/shell-rules.ts';

const origin = 'https://gainscape.test';
const precached = new Set(['/index.html', '/assets/index-abc.js', '/licenses/index.html']);

function decide(method: string, path: string, mode: string): ShellDecision {
  const url = path.startsWith('http') ? path : `${origin}${path}`;
  return shellDecision({ method, url, mode, origin }, precached);
}

describe('shellDecision', () => {
  it.each([
    ['POST', '/', 'navigate', 'network'],
    ['GET', 'https://abc.supabase.co/rest/v1/x', 'cors', 'network'],
    ['GET', '/sb/rest/v1/exercises', 'cors', 'network'],
    ['GET', '/sb/rest/v1/exercises', 'navigate', 'network'],
    ['GET', '/sb', 'navigate', 'network'],
    ['GET', '/sb', 'cors', 'network'],
    ['GET', '/', 'navigate', 'index'],
    ['GET', '/collection/history/abc', 'navigate', 'index'],
    ['GET', '/auth/confirm?token_hash=x&type=email', 'navigate', 'index'],
    ['GET', '/assets/index-abc.js', 'no-cors', 'precached'],
    ['GET', '/licenses/index.html', 'navigate', 'precached'],
    ['GET', '/assets/other.js', 'no-cors', 'network'],
    ['GET', '/robots.txt', 'no-cors', 'network'],
  ] as const)('%s %s (%s) is %s', (method, path, mode, expected) => {
    expect(decide(method, path, mode)).toBe(expected);
  });
});

describe('precacheEntries', () => {
  const listing = [
    'index.html',
    'sw.js',
    'manifest.webmanifest',
    'favicon.svg',
    '.vite/manifest.json',
    'icons/icon-192.png',
    'icons/maskable-512.png',
    'screenshots/train.png',
    'licenses/index.html',
    'licenses/silkscreen-OFL.txt',
    'assets/index-abc.js',
    'assets/index-abc.js.map',
    'assets/index-abc.css',
    'assets/font-latin-400.woff2',
    'assets/font-latin-400.woff',
    'robots.txt',
    'index.html',
  ];

  it('includes the shell files and excludes the worker, maps, woff and build metadata', () => {
    const entries = precacheEntries(listing);
    for (const included of [
      '/index.html',
      '/manifest.webmanifest',
      '/favicon.svg',
      '/icons/icon-192.png',
      '/licenses/index.html',
      '/licenses/silkscreen-OFL.txt',
      '/assets/index-abc.js',
      '/assets/index-abc.css',
      '/assets/font-latin-400.woff2',
    ])
      expect(entries).toContain(included);
    for (const excluded of [
      '/sw.js',
      '/.vite/manifest.json',
      '/assets/font-latin-400.woff',
      '/assets/index-abc.js.map',
      '/robots.txt',
      '/screenshots/train.png',
    ])
      expect(entries).not.toContain(excluded);
  });

  it('leaves out the files the Pages build does not publish', () => {
    const entries = precacheEntries([...listing, 'icons/AGENTS.md', 'licenses/AGENTS.md', 'AGENTS.md']);
    expect(entries.filter((entry) => entry.endsWith('AGENTS.md'))).toEqual([]);
    expect(entries).toContain('/licenses/index.html');
  });

  it('is sorted and unique', () => {
    const entries = precacheEntries(listing);
    expect(entries).toEqual([...new Set(entries)].sort());
  });
});

describe('shellBuildManifestText', () => {
  const entries = [
    { path: '/index.html', sha256: 'a'.repeat(64) },
    { path: '/assets/index-abc.js', sha256: 'b'.repeat(64) },
    { path: '/manifest.webmanifest', sha256: 'c'.repeat(64) },
  ];

  it('is the same under any input order', () => {
    expect(shellBuildManifestText([...entries].reverse())).toBe(shellBuildManifestText(entries));
    expect(shellBuildManifestText([entries[1], entries[2], entries[0]])).toBe(shellBuildManifestText(entries));
  });

  it('changes when a digest changes or a file is added', () => {
    const base = shellBuildManifestText(entries);
    expect(shellBuildManifestText([{ ...entries[0], sha256: 'd'.repeat(64) }, entries[1], entries[2]])).not.toBe(base);
    expect(shellBuildManifestText([...entries, { path: '/favicon.svg', sha256: 'e'.repeat(64) }])).not.toBe(base);
  });

  it('names the cache after the build id', () => {
    expect(shellCacheName('0123456789abcdef')).toBe('gainscape-shell-0123456789abcdef');
  });
});
