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

export function claimRestAlert(storage: Storage | null, userId: string, endsAt: number): boolean {
  const key = `${REST_ALERTED_KEY_PREFIX}${userId}`;
  try {
    if (storage?.getItem(key) === String(endsAt)) return false;
    storage?.setItem(key, String(endsAt));
  } catch {
    return true;
  }
  return true;
}
