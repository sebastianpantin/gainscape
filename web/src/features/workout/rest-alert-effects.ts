const VIBRATION_PATTERN_MS = [200, 100, 200];
const BEEP_FREQUENCIES_HZ = [880, 1320];
const BEEP_LENGTH_S = 0.15;
const BEEP_GAP_S = 0.05;
const BEEP_VOLUME = 0.2;
const REST_OVER_TAG = 'rest-over';

let audio: AudioContext | null = null;

export function primeRestSound(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

export function playRestSound(): void {
  primeRestSound();
  const context = audio;
  if (context === null) return;
  try {
    BEEP_FREQUENCIES_HZ.forEach((frequency, index) => {
      const beepStart = context.currentTime + index * (BEEP_LENGTH_S + BEEP_GAP_S);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.value = BEEP_VOLUME;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(beepStart);
      oscillator.stop(beepStart + BEEP_LENGTH_S);
    });
  } catch {
    return;
  }
}

export function vibrate(pattern: readonly number[]): void {
  try {
    navigator.vibrate?.([...pattern]);
  } catch {
    return;
  }
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
