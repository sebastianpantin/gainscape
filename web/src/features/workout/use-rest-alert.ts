import { useEffect } from 'react';
import type { RestTimer } from '../../lib/workout/rest-timer-rules.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { restAlertActions, restAlertDelayMs, restAlertIsFresh } from '../../lib/workout/training-device-rules.ts';
import { claimRestAlert, readTrainingDeviceSettings } from '../../lib/workout/training-device-store.ts';
import { notificationsAllowed, notifyRestOver, playRestSound, vibrateRestOver } from './rest-alert-effects.ts';

const REST_ALERT_LOCK = 'gainscape.rest-alert';

function alertOnce(userId: string, endsAt: number): void {
  if (!restAlertIsFresh(endsAt, Date.now()) || !claimRestAlert(deviceStorage(), userId, endsAt)) return;
  const settings = readTrainingDeviceSettings(deviceStorage(), userId);
  const page = { hidden: document.visibilityState === 'hidden', notificationsAllowed: notificationsAllowed() };
  for (const action of restAlertActions(settings, page)) {
    if (action === 'vibrate') vibrateRestOver();
    if (action === 'sound') playRestSound();
    if (action === 'notify') void notifyRestOver();
  }
}

function alertInOneTab(userId: string, endsAt: number): void {
  if (!('locks' in navigator)) {
    alertOnce(userId, endsAt);
    return;
  }
  void navigator.locks.request(REST_ALERT_LOCK, () => alertOnce(userId, endsAt)).catch(() => undefined);
}

export function useRestAlert(userId: string, timer: RestTimer | null): void {
  const endsAt = timer?.endsAt ?? null;

  useEffect(() => {
    const delayMs = restAlertDelayMs(endsAt, Date.now());
    if (endsAt === null || delayMs === null) return;
    const alarm = setTimeout(() => alertInOneTab(userId, endsAt), delayMs);
    return () => clearTimeout(alarm);
  }, [userId, endsAt]);
}
