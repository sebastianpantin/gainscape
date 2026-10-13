import { Fragment } from 'react';
import { type TrainingDeviceSettings } from '../../../lib/workout/training-device-rules.ts';
import { Choice } from './Choice.tsx';
import { useTrainingDeviceSettings } from './use-training-device-settings.ts';

const ON_OFF_OPTIONS: { value: 'on' | 'off'; label: string }[] = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

const DEVICE_CHOICES: { name: keyof TrainingDeviceSettings; label: string; hint?: string }[] = [
  { name: 'vibrate', label: 'Vibration', hint: 'Buzz when a set is logged, a record falls and rest ends.' },
  { name: 'sound', label: 'Sound when rest ends' },
  { name: 'notify', label: 'Notify when rest ends in the background' },
  { name: 'keepAwake', label: 'Keep screen on during workouts' },
];

export function TrainingDeviceChoices({ userId }: { userId: string }) {
  const { settings, notifyBlocked, askingToNotify, pick } = useTrainingDeviceSettings(userId);
  return (
    <>
      {DEVICE_CHOICES.map(({ name, label, hint }) => (
        <Fragment key={name}>
          <Choice
            label={label}
            options={ON_OFF_OPTIONS}
            current={settings[name] ? 'on' : 'off'}
            disabled={name === 'notify' && askingToNotify}
            onPick={(value) => void pick(name, value)}
          />
          {hint && <span className="hint">{hint}</span>}
        </Fragment>
      ))}
      {notifyBlocked && (
        <p className="problem" role="alert">
          This browser blocks notifications from Gainscape. Allow them in the browser's site settings.
        </p>
      )}
      <span className="hint">
        Saved on this device only. Phones can pause the app while the screen is off, so keep the screen on for alerts
        you can count on.
      </span>
    </>
  );
}
