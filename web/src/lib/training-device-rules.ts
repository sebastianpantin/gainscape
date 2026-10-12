import { isRecord } from '@domain/types.ts';
import { parsedJson } from './json-rules.ts';

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

export function restAlertDelayMs(endsAt: number | null, now: number): number | null {
  if (endsAt === null || endsAt <= now) return null;
  return endsAt - now;
}

const REST_ALERT_GRACE_MS = 5000;

export function restAlertIsFresh(endsAt: number, now: number): boolean {
  return now - endsAt <= REST_ALERT_GRACE_MS;
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

export interface NotifyPromptFacts {
  standalone: boolean;
  permission: NotificationPermission | 'unsupported';
  notifyOn: boolean;
  answered: boolean;
}

export function offersNotifyPrompt(facts: NotifyPromptFacts): boolean {
  return facts.standalone && facts.permission === 'default' && !facts.notifyOn && !facts.answered;
}

export type LevelUpCue = 'vibrate' | 'sound';

export function levelUpCues(settings: TrainingDeviceSettings): LevelUpCue[] {
  const cues: LevelUpCue[] = [];
  if (settings.vibrate) cues.push('vibrate');
  if (settings.sound) cues.push('sound');
  return cues;
}
