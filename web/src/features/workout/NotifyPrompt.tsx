import { useState } from 'react';
import { deviceStorage } from '../../lib/keyed-store.ts';
import { offersNotifyPrompt } from '../../lib/training-device-rules.ts';
import {
  answerNotifyPrompt,
  notifyPromptAnswered,
  readTrainingDeviceSettings,
  saveTrainingDeviceSettings,
} from '../../lib/training-device-store.ts';
import { runsStandalone } from '../../pwa/install.ts';
import { askToNotify, notificationPermission } from './rest-alert-effects.ts';

interface NotifyPromptProps {
  userId: string;
  onAnswered: () => void;
}

export function NotifyPrompt({ userId, onAnswered }: NotifyPromptProps) {
  const [offered] = useState(() =>
    offersNotifyPrompt({
      standalone: runsStandalone(),
      permission: notificationPermission(),
      notifyOn: readTrainingDeviceSettings(deviceStorage(), userId).notify,
      answered: notifyPromptAnswered(deviceStorage(), userId),
    }),
  );
  const [answered, setAnswered] = useState(false);
  if (!offered || answered) return null;

  const answer = () => {
    answerNotifyPrompt(deviceStorage(), userId);
    setAnswered(true);
    onAnswered();
  };
  const turnOn = async () => {
    const asking = askToNotify();
    answer();
    if (!(await asking)) return;
    saveTrainingDeviceSettings(deviceStorage(), userId, {
      ...readTrainingDeviceSettings(deviceStorage(), userId),
      notify: true,
    });
  };
  return (
    <section className="notify-prompt" aria-label="Rest notifications">
      <p>Get a buzz when rest ends, even with the screen locked?</p>
      <span className="row">
        <button className="button primary" type="button" onClick={() => void turnOn()}>
          Turn on
        </button>
        <button className="button" type="button" onClick={answer}>
          Not now
        </button>
      </span>
    </section>
  );
}
