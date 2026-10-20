type NavigationKind = 'PUSH' | 'REPLACE' | 'POP';

export function shouldScrollToTop(navigationType: NavigationKind, previousPathname: string, pathname: string): boolean {
  return navigationType !== 'POP' && previousPathname !== pathname;
}

export function restoredScrollY(navigationType: NavigationKind, savedScrollY: number | undefined): number | null {
  return navigationType === 'POP' && savedScrollY !== undefined ? savedScrollY : null;
}
