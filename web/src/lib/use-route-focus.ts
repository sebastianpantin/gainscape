import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { APP_TITLE, routeTitle } from './route-title-rules.ts';

const SCREEN_WAIT_MS = 3_000;
const LOADED_SCREEN = 'main:not([aria-busy="true"])';
const ROUTE_FOCUS_TARGET = 'route-focus-target';

function focusRouteTarget(target: HTMLElement): void {
  if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
  target.classList.add(ROUTE_FOCUS_TARGET);
  target.focus();
}

function hasOpenDialog(): boolean {
  return document.querySelector('dialog[open]') !== null;
}

function screenOwnsFocus(focused: Element | null): boolean {
  return focused !== null && focused !== document.body && focused.closest('main') !== null;
}

function moveFocusToScreen(): () => void {
  const focusedAtNavigation = document.activeElement;
  if (hasOpenDialog() || screenOwnsFocus(focusedAtNavigation)) return () => undefined;
  const deadline = performance.now() + SCREEN_WAIT_MS;
  let frame = 0;
  const attempt = () => {
    if (document.activeElement !== focusedAtNavigation || hasOpenDialog()) return;
    const heading = document.querySelector<HTMLElement>(`${LOADED_SCREEN} h1`);
    if (heading) return focusRouteTarget(heading);
    if (performance.now() >= deadline) {
      const screen = document.querySelector<HTMLElement>('main');
      if (screen) focusRouteTarget(screen);
      return;
    }
    frame = requestAnimationFrame(attempt);
  };
  frame = requestAnimationFrame(attempt);
  return () => cancelAnimationFrame(frame);
}

export function useRouteFocusAndTitle(): void {
  const { pathname } = useLocation();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    document.title = routeTitle(pathname);
  }, [pathname]);

  useEffect(() => () => void (document.title = APP_TITLE), []);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    return moveFocusToScreen();
  }, [pathname]);
}
