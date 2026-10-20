import { useSyncExternalStore } from 'react';
import { type InstallState, installState, isIosSafari, readInstallCard, writeInstallCard } from './install-state.ts';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedThisSession = false;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event as BeforeInstallPromptEvent;
  notify();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  installedThisSession = true;
  notify();
});

export function runsStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function currentInstallState(): InstallState {
  return installState({
    standalone: runsStandalone(),
    iosSafari: isIosSafari(navigator.userAgent, navigator.maxTouchPoints),
    hasDeferredPrompt: deferredPrompt !== null,
    installedThisSession,
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, currentInstallState);
}

export async function promptInstall(): Promise<void> {
  const event = deferredPrompt;
  if (!event) return;
  deferredPrompt = null;
  notify();
  await event.prompt().catch(() => undefined);
}

export const INSTALL_CARD_DUE = 'due';
const INSTALL_CARD_DISMISSED = 'dismissed';

export function markInstallCardDue(userId: string): void {
  if (readInstallCard(userId) === null) writeInstallCard(userId, INSTALL_CARD_DUE);
}

export function dismissInstallCard(userId: string): string {
  writeInstallCard(userId, INSTALL_CARD_DISMISSED);
  return INSTALL_CARD_DISMISSED;
}
