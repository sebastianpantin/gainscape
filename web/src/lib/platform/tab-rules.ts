const TRAIN_TAB = '/';
const PROFILE_TAB = '/profile';
const OPENED_FROM_TRAIN = ['/programs'];
const OPENED_FROM_PROFILE = ['/exercises'];

function isWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function activeTabPath(pathname: string, tabPaths: readonly string[]): string | null {
  if (OPENED_FROM_TRAIN.some((root) => isWithin(pathname, root))) return TRAIN_TAB;
  if (OPENED_FROM_PROFILE.some((root) => isWithin(pathname, root))) return PROFILE_TAB;
  if (pathname === TRAIN_TAB) return tabPaths.includes(TRAIN_TAB) ? TRAIN_TAB : null;
  return tabPaths.find((tab) => tab !== TRAIN_TAB && isWithin(pathname, tab)) ?? null;
}
