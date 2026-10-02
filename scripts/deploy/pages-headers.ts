const YEAR_SECONDS = 31_536_000;
const NEVER_CACHED = ['/', '/index.html', '/sw.js', '/manifest.webmanifest'];
const UNPUBLISHED_FILE_NAMES = new Set(['AGENTS.md']);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);
const PERMISSIONS_OFF = ['camera', 'microphone', 'geolocation', 'payment', 'usb'];

function supabaseOrigin(supabaseUrl: string): string {
  const url = new URL(supabaseUrl);
  const isLoopback = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !isLoopback) throw new Error(`VITE_SUPABASE_URL must be https, got ${supabaseUrl}`);
  if (url.origin !== supabaseUrl.replace(/\/$/, '')) {
    throw new Error(`VITE_SUPABASE_URL must be a bare origin, got ${supabaseUrl}`);
  }
  return url.origin;
}

function contentSecurityPolicy(apiOrigin: string): string {
  return [
    "default-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function block(path: string, rules: readonly string[]): string {
  return [path, ...rules.map((rule) => `  ${rule}`)].join('\n');
}

export function pagesHeaders(supabaseUrl: string): string {
  const everywhere = block('/*', [
    `Content-Security-Policy: ${contentSecurityPolicy(supabaseOrigin(supabaseUrl))}`,
    'Cross-Origin-Opener-Policy: same-origin',
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy: strict-origin-when-cross-origin',
    `Permissions-Policy: ${PERMISSIONS_OFF.map((feature) => `${feature}=()`).join(', ')}`,
  ]);
  const neverCached = NEVER_CACHED.map((path) => block(path, ['Cache-Control: no-cache']));
  const hashedAssets = block('/assets/*', [`Cache-Control: public, max-age=${YEAR_SECONDS}, immutable`]);
  return [everywhere, ...neverCached, hashedAssets].join('\n\n') + '\n';
}

export function unpublishedFiles(paths: readonly string[]): string[] {
  return paths.filter((path) => UNPUBLISHED_FILE_NAMES.has(path.split('/').at(-1) ?? ''));
}
