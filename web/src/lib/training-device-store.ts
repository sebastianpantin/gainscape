import { parseTrainingDeviceSettings, type TrainingDeviceSettings } from './training-device-rules.ts';

const TRAINING_DEVICE_KEY_PREFIX = 'gainscape.training-device.';

function trainingDeviceKey(userId: string): string {
  return `${TRAINING_DEVICE_KEY_PREFIX}${userId}`;
}

export function readTrainingDeviceSettings(storage: Storage | null, userId: string): TrainingDeviceSettings {
  try {
    return parseTrainingDeviceSettings(storage?.getItem(trainingDeviceKey(userId)) ?? null);
  } catch {
    return parseTrainingDeviceSettings(null);
  }
}

export function saveTrainingDeviceSettings(
  storage: Storage | null,
  userId: string,
  settings: TrainingDeviceSettings,
): void {
  try {
    storage?.setItem(trainingDeviceKey(userId), JSON.stringify(settings));
  } catch {
    return;
  }
}

const REST_ALERTED_KEY_PREFIX = 'gainscape.rest-alerted.';

function restAlertedKey(userId: string): string {
  return `${REST_ALERTED_KEY_PREFIX}${userId}`;
}

export function claimRestAlert(storage: Storage | null, userId: string, endsAt: number): boolean {
  const key = restAlertedKey(userId);
  try {
    if (storage?.getItem(key) === String(endsAt)) return false;
    storage?.setItem(key, String(endsAt));
  } catch {
    return true;
  }
  return true;
}

const NOTIFY_PROMPT_KEY_PREFIX = 'gainscape.notify-prompt.';
const NOTIFY_PROMPT_ANSWERED = 'answered';

function notifyPromptKey(userId: string): string {
  return `${NOTIFY_PROMPT_KEY_PREFIX}${userId}`;
}

export function notifyPromptAnswered(storage: Storage | null, userId: string): boolean {
  try {
    return storage === null || storage.getItem(notifyPromptKey(userId)) === NOTIFY_PROMPT_ANSWERED;
  } catch {
    return true;
  }
}

export function answerNotifyPrompt(storage: Storage | null, userId: string): void {
  try {
    storage?.setItem(notifyPromptKey(userId), NOTIFY_PROMPT_ANSWERED);
  } catch {
    return;
  }
}

export function forgetTrainingDevice(storage: Storage | null, userId: string): void {
  try {
    storage?.removeItem(trainingDeviceKey(userId));
    storage?.removeItem(restAlertedKey(userId));
    storage?.removeItem(notifyPromptKey(userId));
  } catch {
    return;
  }
}
