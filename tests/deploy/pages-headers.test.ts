import { describe, expect, it } from 'vitest';
import { pagesHeaders, unpublishedFiles } from '../../scripts/deploy/pages-headers.ts';

const headers = pagesHeaders('https://abcdefghijklmnop.supabase.co');

function rulesFor(path: string): string[] {
  const blocks = headers.split('\n\n');
  const block = blocks.find((candidate) => candidate.split('\n')[0] === path);
  return block
    ? block
        .split('\n')
        .slice(1)
        .map((line) => line.trim())
    : [];
}

describe('Cloudflare Pages headers', () => {
  it('allows the Supabase API and nothing else outside the app origin', () => {
    const [csp] = rulesFor('/*').filter((line) => line.startsWith('Content-Security-Policy:'));
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self' https://abcdefghijklmnop.supabase.co");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("font-src 'self' data:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('allows inline images but no blob images, which the app never uses', () => {
    const [csp] = rulesFor('/*').filter((line) => line.startsWith('Content-Security-Policy:'));
    expect(csp).toContain("img-src 'self' data:;");
  });

  it('sets the hardening headers on every path', () => {
    expect(rulesFor('/*')).toEqual(
      expect.arrayContaining([
        'Cross-Origin-Opener-Policy: same-origin',
        'X-Content-Type-Options: nosniff',
        'Referrer-Policy: strict-origin-when-cross-origin',
        expect.stringMatching(/^Permissions-Policy: camera=\(\), /),
      ]),
    );
  });

  it.each(['/sw.js', '/index.html', '/', '/manifest.webmanifest'])('never lets the browser cache %s', (path) => {
    expect(rulesFor(path)).toContain('Cache-Control: no-cache');
  });

  it('caches hashed assets for a year', () => {
    expect(rulesFor('/assets/*')).toContain('Cache-Control: public, max-age=31536000, immutable');
  });

  it('accepts a plain http loopback origin for checking the build against the local stack', () => {
    expect(pagesHeaders('http://127.0.0.1:54321')).toContain("connect-src 'self' http://127.0.0.1:54321");
  });

  it('refuses a Supabase URL that is not a plain https origin', () => {
    expect(() => pagesHeaders('http://abc.supabase.co')).toThrow(/https/);
    expect(() => pagesHeaders('https://abc.supabase.co/rest')).toThrow(/origin/);
    expect(() => pagesHeaders("https://abc.supabase.co; script-src 'unsafe-inline'")).toThrow();
  });
});

describe('files kept out of the published site', () => {
  it('drops agent docs anywhere in the build and keeps the app files', () => {
    expect(
      unpublishedFiles(['index.html', 'AGENTS.md', 'licenses/AGENTS.md', 'assets/index.js', 'licenses/fonts.txt']),
    ).toEqual(['AGENTS.md', 'licenses/AGENTS.md']);
  });
});
