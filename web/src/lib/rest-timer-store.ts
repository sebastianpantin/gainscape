import { parseRestState, type RestState } from './rest-timer-rules.ts';

const REST_KEY_PREFIX = 'gainscape.rest.';

export function restStateKey(userId: string): string {
  return `${REST_KEY_PREFIX}${userId}`;
}

export function deviceStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRestState(storage: Storage | null, userId: string): RestState {
  try {
    return parseRestState(storage?.getItem(restStateKey(userId)) ?? null);
  } catch {
    return parseRestState(null);
  }
}

export function saveRestState(storage: Storage | null, userId: string, state: RestState): void {
  try {
    storage?.setItem(restStateKey(userId), JSON.stringify(state));
  } catch {
    return;
  }
}

export function forgetRestState(storage: Storage | null, userId: string): void {
  try {
    storage?.removeItem(restStateKey(userId));
  } catch {
    return;
  }
}
