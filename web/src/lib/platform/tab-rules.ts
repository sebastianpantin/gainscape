const PROFILE_TAB = '/profile';
const OPENED_FROM_PROFILE = ['/programs', '/exercises'];

function isWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function activeTabPath(pathname: string, tabPaths: readonly string[]): string | null {
  if (OPENED_FROM_PROFILE.some((root) => isWithin(pathname, root))) return PROFILE_TAB;
  if (pathname === '/') return tabPaths.includes('/') ? '/' : null;
  return tabPaths.find((tab) => tab !== '/' && isWithin(pathname, tab)) ?? null;
}
