import { vibrate } from './rest-alert-effects.ts';

const NEW_RECORD_VIBRATION_MS = [60, 40, 60];

export function vibrateNewRecord(): void {
  vibrate(NEW_RECORD_VIBRATION_MS);
}
