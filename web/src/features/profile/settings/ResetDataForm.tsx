import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { RESET_CONFIRMATION, resetMyData } from '../../../lib/account.ts';
import { announceDataChange } from '../../../lib/data-changes.ts';
import { messageOf } from '../../../lib/error-text.ts';
import { forgetUserProgressData } from '../../../offline/user-device-data.ts';
import { forgetOnThisDevice, hasUnsyncedDraftHere } from './device-data.ts';

export function ResetDataForm({ userId, onDone }: { userId: string; onDone: (text: string) => void }) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    if (
      (await hasUnsyncedDraftHere(userId)) &&
      !window.confirm('You have a workout that has not synced yet. It will be lost. Reset anyway?')
    ) {
      setBusy(false);
      return;
    }
    try {
      await resetMyData();
    } catch (error) {
      setProblem(messageOf(error, 'Could not reset your data.'));
      setBusy(false);
      return;
    }
    await forgetOnThisDevice(forgetUserProgressData, userId).catch(() => undefined);
    await announceDataChange(queryClient, 'account-reset');
    onDone('Your data was reset. You start again from level 1.');
  };

  return (
    <form className="danger-zone" onSubmit={submit}>
      <p>
        This wipes your workouts, XP, records, loot, gear, bodyweight log, notes and goals for good. Your account,
        profile, friends, settings, custom exercises and programs stay. Export first if you want a copy.
      </p>
      <label className="field">
        Type {RESET_CONFIRMATION} to confirm
        <input autoCapitalize="characters" value={typed} onChange={(event) => setTyped(event.target.value)} />
      </label>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <button className="button danger" type="submit" disabled={busy || typed.trim() !== RESET_CONFIRMATION}>
        Reset everything
      </button>
    </form>
  );
}
