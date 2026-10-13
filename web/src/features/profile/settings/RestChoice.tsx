import { useState } from 'react';
import { REST_CHOICES_S, REST_OFF, restClock, withChosenRest } from '../../../lib/rest-timer-rules.ts';
import { deviceStorage } from '../../../lib/keyed-store.ts';
import { readRestState, saveRestState } from '../../../lib/rest-timer-store.ts';
import { Choice } from './Choice.tsx';

const REST_OPTIONS = REST_CHOICES_S.map((restS) => ({
  value: String(restS),
  label: restS === REST_OFF ? 'Off' : restClock(restS),
}));

export function RestChoice({ userId }: { userId: string }) {
  const [restS, setRestS] = useState(() => readRestState(deviceStorage(), userId).restS);
  const pick = (value: string) => {
    const picked = Number(value);
    setRestS(picked);
    saveRestState(deviceStorage(), userId, withChosenRest(readRestState(deviceStorage(), userId), picked));
  };
  return (
    <>
      <Choice label="Rest timer" options={REST_OPTIONS} current={String(restS)} disabled={false} onPick={pick} />
      <span className="hint">
        Starts when you finish a set. Compound lifts rest at least 3:00. Adjusting a rest keeps it for that exercise
        until you choose here again. Saved on this device only.
      </span>
    </>
  );
}
