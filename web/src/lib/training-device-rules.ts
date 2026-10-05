import type { RestTimer } from './rest-timer-rules.ts';

export interface TrainingDeviceSettings {
  vibrate: boolean;
  sound: boolean;
  notify: boolean;
  keepAwake: boolean;
}

export const DEFAULT_TRAINING_DEVICE_SETTINGS: TrainingDeviceSettings = {
  vibrate: true,
  sound: true,
  notify: false,
  keepAwake: true,
};

const SETTING_NAMES = Object.keys(DEFAULT_TRAINING_DEVICE_SETTINGS) as (keyof TrainingDeviceSettings)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsedJson(raw: string | null): unknown {
  try {
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseTrainingDeviceSettings(raw: string | null): TrainingDeviceSettings {
  const parsed = parsedJson(raw);
  const settings = { ...DEFAULT_TRAINING_DEVICE_SETTINGS };
  if (!isRecord(parsed)) return settings;
  for (const name of SETTING_NAMES) {
    const saved = parsed[name];
    if (typeof saved === 'boolean') settings[name] = saved;
  }
  return settings;
}

export function restAlertDelayMs(timer: RestTimer | null, now: number): number | null {
  if (timer === null || timer.endsAt <= now) return null;
  return timer.endsAt - now;
}

export type RestAlertAction = 'vibrate' | 'sound' | 'notify';

export function restAlertActions(
  settings: TrainingDeviceSettings,
  page: { hidden: boolean; notificationsAllowed: boolean },
): RestAlertAction[] {
  const actions: RestAlertAction[] = [];
  if (settings.vibrate) actions.push('vibrate');
  if (settings.sound) actions.push('sound');
  if (settings.notify && page.hidden && page.notificationsAllowed) actions.push('notify');
  return actions;
}

export function holdsWakeLock(state: { keepAwake: boolean; workoutOpen: boolean; visible: boolean }): boolean {
  return state.keepAwake && state.workoutOpen && state.visible;
}
