import { parsePlateSettings, type PlateSettings } from './plate-rules.ts';

const PLATE_SETTINGS_KEY_PREFIX = 'gainscape.plates.';

function plateSettingsKey(userId: string): string {
  return `${PLATE_SETTINGS_KEY_PREFIX}${userId}`;
}

export function readPlateSettings(storage: Storage | null, userId: string): PlateSettings {
  try {
    return parsePlateSettings(storage?.getItem(plateSettingsKey(userId)) ?? null);
  } catch {
    return parsePlateSettings(null);
  }
}

export function savePlateSettings(storage: Storage | null, userId: string, settings: PlateSettings): void {
  try {
    storage?.setItem(plateSettingsKey(userId), JSON.stringify(settings));
  } catch {
    return;
  }
}

export function forgetPlateSettings(storage: Storage | null, userId: string): void {
  try {
    storage?.removeItem(plateSettingsKey(userId));
  } catch {
    return;
  }
}
