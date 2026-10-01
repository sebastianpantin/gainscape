import { useSyncExternalStore } from 'react';
import { flushOpenDraftSessions } from '../offline/draft-session.ts';
import { SERVICE_WORKER_FILE } from './shell-rules.ts';
import { createUpdateFlow, type UpdateFlow, type UpdateState } from './update-flow.ts';

let currentFlow: UpdateFlow | null = null;
let currentUserId: string | null = null;
const flowListeners = new Set<() => void>();

function subscribeToFlow(listener: () => void): () => void {
  flowListeners.add(listener);
  return () => flowListeners.delete(listener);
}

function subscribeToState(listener: () => void): () => void {
  let unsubscribeState = currentFlow?.subscribe(listener);
  const unsubscribeFlow = subscribeToFlow(() => {
    unsubscribeState?.();
    unsubscribeState = currentFlow?.subscribe(listener);
    listener();
  });
  return () => {
    unsubscribeFlow();
    unsubscribeState?.();
  };
}

export function useUpdateFlow(): UpdateFlow | null {
  return useSyncExternalStore(subscribeToFlow, () => currentFlow);
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(subscribeToState, () => currentFlow?.state() ?? 'idle');
}

export function setUpdateUser(userId: string | null): void {
  currentUserId = userId;
}

function startUpdateFlow(registration: ServiceWorkerRegistration, hadControllerAtLoad: boolean): void {
  currentFlow = createUpdateFlow({
    registration,
    serviceWorker: navigator.serviceWorker,
    locks: navigator.locks ?? null,
    flushDrafts: flushOpenDraftSessions,
    reload: () => window.location.reload(),
    now: () => Date.now(),
    userId: () => currentUserId,
    hadControllerAtLoad,
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') currentFlow?.checkOnVisible();
  });
  for (const listener of flowListeners) listener();
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const hadControllerAtLoad = navigator.serviceWorker.controller !== null;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`/${SERVICE_WORKER_FILE}`, { scope: '/' }).then(
      (registration) => startUpdateFlow(registration, hadControllerAtLoad),
      () => undefined,
    );
  });
}
