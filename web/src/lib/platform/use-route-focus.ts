import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { APP_TITLE, routeTitle } from './route-title-rules.ts';
import { restoredScrollY, shouldScrollToTop } from './route-scroll-rules.ts';

const SCREEN_WAIT_MS = 3_000;
const LOADED_SCREEN = 'main:not([aria-busy="true"])';
const ROUTE_FOCUS_TARGET = 'route-focus-target';
const scrollPositions = new Map<string, number>();

function focusRouteTarget(target: HTMLElement): boolean {
  if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
  target.classList.add(ROUTE_FOCUS_TARGET);
  target.focus({ preventScroll: true });
  return document.activeElement === target;
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
    if (heading && focusRouteTarget(heading)) return;
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
  const { pathname, key } = useLocation();
  const navigationType = useNavigationType();
  const previousPathname = useRef(pathname);
  const shownKey = useRef(key);

  useEffect(() => {
    document.title = routeTitle(pathname);
  }, [pathname]);

  useEffect(() => () => void (document.title = APP_TITLE), []);

  useEffect(() => {
    const rememberScroll = () => scrollPositions.set(shownKey.current, window.scrollY);
    window.addEventListener('scroll', rememberScroll, { passive: true });
    return () => window.removeEventListener('scroll', rememberScroll);
  }, []);

  useLayoutEffect(() => {
    shownKey.current = key;
    if (previousPathname.current === pathname) return;
    if (shouldScrollToTop(navigationType, previousPathname.current, pathname)) window.scrollTo(0, 0);
    const restoreTo = restoredScrollY(navigationType, scrollPositions.get(key));
    if (restoreTo !== null) window.scrollTo(0, restoreTo);
  }, [key, pathname, navigationType]);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    return moveFocusToScreen();
  }, [pathname]);
}
