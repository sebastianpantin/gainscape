export type InstallState = 'installed' | 'promptable' | 'ios_manual' | 'unavailable';

export interface InstallFacts {
  standalone: boolean;
  iosSafari: boolean;
  hasDeferredPrompt: boolean;
  installedThisSession: boolean;
}

const IOS_DEVICE = /iPhone|iPad|iPod/;
const IPADOS_DESKTOP = /Macintosh/;
const OTHER_IOS_BROWSERS = /CriOS|FxiOS|EdgiOS/;

export function installState({
  standalone,
  iosSafari,
  hasDeferredPrompt,
  installedThisSession,
}: InstallFacts): InstallState {
  if (standalone || installedThisSession) return 'installed';
  if (hasDeferredPrompt) return 'promptable';
  if (iosSafari) return 'ios_manual';
  return 'unavailable';
}

export function isIosSafari(userAgent: string, maxTouchPoints: number): boolean {
  const iosDevice = IOS_DEVICE.test(userAgent) || (IPADOS_DESKTOP.test(userAgent) && maxTouchPoints > 1);
  return iosDevice && !OTHER_IOS_BROWSERS.test(userAgent);
}

export function installCardKey(userId: string): string {
  return `gainscape.install-card.${userId}`;
}

export function forgetInstallCard(storage: Storage | null, userId: string): void {
  try {
    storage?.removeItem(installCardKey(userId));
  } catch {
    return;
  }
}
