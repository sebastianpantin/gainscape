import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRAINING_DEVICE_SETTINGS,
  holdsWakeLock,
  offersNotifyPrompt,
  celebrationCues,
  parseTrainingDeviceSettings,
  restAlertActions,
  restAlertDelayMs,
  restAlertIsFresh,
} from '../../web/src/lib/training-device-rules.ts';
import {
  answerNotifyPrompt,
  claimRestAlert,
  forgetTrainingDevice,
  notifyPromptAnswered,
  readTrainingDeviceSettings,
  saveTrainingDeviceSettings,
} from '../../web/src/lib/training-device-store.ts';
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
    expect(restAlertDelayMs(now + 90_000, now)).toBe(90_000);
  });

  it('never alerts for a rest that already ended or is not running', () => {
    expect(restAlertDelayMs(now, now)).toBeNull();
    expect(restAlertDelayMs(now - 1000, now)).toBeNull();
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

describe('stale rest alerts', () => {
  it('alerts right after the rest ends but not when a frozen page wakes up later', () => {
    expect(restAlertIsFresh(now, now)).toBe(true);
    expect(restAlertIsFresh(now, now + 5_000)).toBe(true);
    expect(restAlertIsFresh(now, now + 5_001)).toBe(false);
  });
});

describe('rest alert claim', () => {
  it('lets only the first tab alert for a rest', () => {
    const storage = new MemoryStorage();
    expect(claimRestAlert(storage, userId, now)).toBe(true);
    expect(claimRestAlert(storage, userId, now)).toBe(false);
    expect(claimRestAlert(storage, userId, now + 90_000)).toBe(true);
    expect(claimRestAlert(storage, 'user-2', now)).toBe(true);
  });

  it('still alerts when storage is unavailable', () => {
    expect(claimRestAlert(null, userId, now)).toBe(true);
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

describe('notification prompt', () => {
  const firstRestInTheApp = {
    standalone: true,
    permission: 'default',
    notifyOn: false,
    answered: false,
  } as const;

  it('offers notifications in the installed app while the browser has not asked yet', () => {
    expect(offersNotifyPrompt(firstRestInTheApp)).toBe(true);
  });

  it('stays away in a browser tab, once asked, without notification support, or when already on', () => {
    expect(offersNotifyPrompt({ ...firstRestInTheApp, standalone: false })).toBe(false);
    expect(offersNotifyPrompt({ ...firstRestInTheApp, permission: 'granted' })).toBe(false);
    expect(offersNotifyPrompt({ ...firstRestInTheApp, permission: 'denied' })).toBe(false);
    expect(offersNotifyPrompt({ ...firstRestInTheApp, permission: 'unsupported' })).toBe(false);
    expect(offersNotifyPrompt({ ...firstRestInTheApp, notifyOn: true })).toBe(false);
    expect(offersNotifyPrompt({ ...firstRestInTheApp, answered: true })).toBe(false);
  });

  it('remembers an answer per user until the user is forgotten on this device', () => {
    const storage = new MemoryStorage();
    expect(notifyPromptAnswered(storage, userId)).toBe(false);
    answerNotifyPrompt(storage, userId);
    expect(notifyPromptAnswered(storage, userId)).toBe(true);
    expect(notifyPromptAnswered(storage, 'user-2')).toBe(false);
    forgetTrainingDevice(storage, userId);
    expect(notifyPromptAnswered(storage, userId)).toBe(false);
  });

  it('never asks again when storage is blocked rather than asking every rest', () => {
    expect(notifyPromptAnswered(null, userId)).toBe(true);
  });
});

describe('celebrationCues', () => {
  it('vibrates and chimes with the default settings', () => {
    expect(celebrationCues(DEFAULT_TRAINING_DEVICE_SETTINGS)).toEqual(['vibrate', 'sound']);
  });

  it('follows the vibrate and sound switches and ignores notifications', () => {
    const quiet = { ...DEFAULT_TRAINING_DEVICE_SETTINGS, sound: false, notify: true };
    expect(celebrationCues(quiet)).toEqual(['vibrate']);
    expect(celebrationCues({ ...quiet, vibrate: false })).toEqual([]);
  });
});
