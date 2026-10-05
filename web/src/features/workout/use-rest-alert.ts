import { useEffect } from 'react';
import type { RestTimer } from '../../lib/rest-timer-rules.ts';
import { deviceStorage } from '../../lib/rest-timer-store.ts';
import { restAlertActions, restAlertDelayMs } from '../../lib/training-device-rules.ts';
import { readTrainingDeviceSettings } from '../../lib/training-device-store.ts';
import { notificationsAllowed, notifyRestOver, playRestSound, vibrateRestOver } from './rest-alert-effects.ts';

export function useRestAlert(userId: string, timer: RestTimer | null): void {
  const endsAt = timer?.endsAt ?? null;

  useEffect(() => {
    const delayMs = restAlertDelayMs(endsAt, Date.now());
    if (delayMs === null) return;
    const alarm = setTimeout(() => {
      const settings = readTrainingDeviceSettings(deviceStorage(), userId);
      const page = { hidden: document.visibilityState === 'hidden', notificationsAllowed: notificationsAllowed() };
      for (const action of restAlertActions(settings, page)) {
        if (action === 'vibrate') vibrateRestOver();
        if (action === 'sound') playRestSound();
        if (action === 'notify') void notifyRestOver();
      }
    }, delayMs);
    return () => clearTimeout(alarm);
  }, [userId, endsAt]);
}
