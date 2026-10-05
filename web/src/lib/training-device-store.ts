import { parseTrainingDeviceSettings, type TrainingDeviceSettings } from './training-device-rules.ts';

const TRAINING_DEVICE_KEY_PREFIX = 'gainscape.training-device.';

export function trainingDeviceKey(userId: string): string {
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
