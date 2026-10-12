import { playTones, type Tone, vibrate } from '../../lib/device-effects.ts';

const VIBRATION_PATTERN_MS = [200, 100, 200];
const BEEP_LENGTH_S = 0.15;
const BEEP_GAP_S = 0.05;
const BEEP_VOLUME = 0.2;
const REST_BEEPS: Tone[] = [880, 1320].map((frequencyHz, index) => ({
  frequencyHz,
  startS: index * (BEEP_LENGTH_S + BEEP_GAP_S),
  lengthS: BEEP_LENGTH_S,
}));
const REST_OVER_TAG = 'rest-over';

export function playRestSound(): void {
  playTones(REST_BEEPS, BEEP_VOLUME);
}

export function vibrateRestOver(): void {
  vibrate(VIBRATION_PATTERN_MS);
}

export function notificationsAllowed(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

export async function askToNotify(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export async function notifyRestOver(): Promise<void> {
  const options: NotificationOptions = { body: 'Time for your next set.', tag: REST_OVER_TAG };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.showNotification('Rest over', options);
    else new Notification('Rest over', options);
  } catch {
    return;
  }
}
