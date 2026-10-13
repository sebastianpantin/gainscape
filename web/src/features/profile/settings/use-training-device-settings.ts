import { useState } from 'react';
import { deviceStorage } from '../../../lib/rest-timer-store.ts';
import { type TrainingDeviceSettings } from '../../../lib/training-device-rules.ts';
import { readTrainingDeviceSettings, saveTrainingDeviceSettings } from '../../../lib/training-device-store.ts';
import { askToNotify } from '../../workout/rest-alert-effects.ts';

export function useTrainingDeviceSettings(userId: string) {
  const [settings, setSettings] = useState(() => readTrainingDeviceSettings(deviceStorage(), userId));
  const [notifyBlocked, setNotifyBlocked] = useState(false);
  const [askingToNotify, setAskingToNotify] = useState(false);
  const change = (changes: Partial<TrainingDeviceSettings>) => {
    const next = { ...readTrainingDeviceSettings(deviceStorage(), userId), ...changes };
    setSettings(next);
    saveTrainingDeviceSettings(deviceStorage(), userId, next);
  };
  const pick = async (name: keyof TrainingDeviceSettings, value: 'on' | 'off') => {
    const on = value === 'on';
    if (name === 'notify') setNotifyBlocked(false);
    if (name === 'notify' && on) {
      setAskingToNotify(true);
      const allowed = await askToNotify();
      setAskingToNotify(false);
      setNotifyBlocked(!allowed);
      if (!allowed) return;
    }
    change({ [name]: on });
  };
  return { settings, notifyBlocked, askingToNotify, pick };
}
