import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRAINING_DEVICE_SETTINGS,
  holdsWakeLock,
  parseTrainingDeviceSettings,
  restAlertActions,
  restAlertDelayMs,
} from '../../web/src/lib/training-device-rules.ts';
import { readTrainingDeviceSettings, saveTrainingDeviceSettings } from '../../web/src/lib/training-device-store.ts';
import { MemoryStorage } from './memory-storage.ts';

const now = Date.UTC(2026, 9, 5, 18, 0, 0);
const userId = 'user-1';

describe('training device settings', () => {
  it('vibrates, plays a sound and keeps the screen on by default, but asks before notifying', () => {
    expect(DEFAULT_TRAINING_DEVICE_SETTINGS).toEqual({
      vibrate: true,
      sound: true,
      notify: false,
      keepAwake: true,
    });
    expect(parseTrainingDeviceSettings(null)).toEqual(DEFAULT_TRAINING_DEVICE_SETTINGS);
    expect(parseTrainingDeviceSettings('not json')).toEqual(DEFAULT_TRAINING_DEVICE_SETTINGS);
  });

  it('keeps each saved choice and falls back per field', () => {
    expect(parseTrainingDeviceSettings(JSON.stringify({ vibrate: false, notify: true, sound: 'loud' }))).toEqual({
      vibrate: false,
      sound: true,
      notify: true,
      keepAwake: true,
    });
  });

  it('round-trips through storage per user', () => {
    const storage = new MemoryStorage();
    const changed = { ...DEFAULT_TRAINING_DEVICE_SETTINGS, keepAwake: false };
    saveTrainingDeviceSettings(storage, userId, changed);
    expect(readTrainingDeviceSettings(storage, userId)).toEqual(changed);
    expect(readTrainingDeviceSettings(storage, 'user-2')).toEqual(DEFAULT_TRAINING_DEVICE_SETTINGS);
    expect(readTrainingDeviceSettings(null, userId)).toEqual(DEFAULT_TRAINING_DEVICE_SETTINGS);
  });
});

describe('rest alert', () => {
  it('waits until a running rest ends', () => {
    expect(restAlertDelayMs({ endsAt: now + 90_000, setId: 's' }, now)).toBe(90_000);
  });

  it('never alerts for a rest that already ended or is not running', () => {
    expect(restAlertDelayMs({ endsAt: now, setId: 's' }, now)).toBeNull();
    expect(restAlertDelayMs({ endsAt: now - 1000, setId: 's' }, now)).toBeNull();
    expect(restAlertDelayMs(null, now)).toBeNull();
  });

  it('vibrates and plays a sound as chosen', () => {
    const visible = { hidden: false, notificationsAllowed: true };
    expect(restAlertActions(DEFAULT_TRAINING_DEVICE_SETTINGS, visible)).toEqual(['vibrate', 'sound']);
    expect(restAlertActions({ ...DEFAULT_TRAINING_DEVICE_SETTINGS, vibrate: false, sound: false }, visible)).toEqual(
      [],
    );
  });

  it('notifies only while the app is hidden and notifications are allowed', () => {
    const notifying = { ...DEFAULT_TRAINING_DEVICE_SETTINGS, vibrate: false, sound: false, notify: true };
    expect(restAlertActions(notifying, { hidden: true, notificationsAllowed: true })).toEqual(['notify']);
    expect(restAlertActions(notifying, { hidden: false, notificationsAllowed: true })).toEqual([]);
    expect(restAlertActions(notifying, { hidden: true, notificationsAllowed: false })).toEqual([]);
  });
});

describe('wake lock', () => {
  it('holds the screen on during an open workout while the page is visible', () => {
    expect(holdsWakeLock({ keepAwake: true, workoutOpen: true, visible: true })).toBe(true);
    expect(holdsWakeLock({ keepAwake: false, workoutOpen: true, visible: true })).toBe(false);
    expect(holdsWakeLock({ keepAwake: true, workoutOpen: false, visible: true })).toBe(false);
    expect(holdsWakeLock({ keepAwake: true, workoutOpen: true, visible: false })).toBe(false);
  });
});
