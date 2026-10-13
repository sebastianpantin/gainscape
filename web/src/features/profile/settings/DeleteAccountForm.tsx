import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteMyAccount } from '../../../lib/account.ts';
import { messageOf } from '../../../lib/error-text.ts';
import { signOutKeepingDrafts } from '../../../offline/sync-workout.ts';
import { forgetUserDeviceData } from '../../../offline/user-device-data.ts';
import { forgetOnThisDevice, hasUnsyncedDraftHere } from './device-data.ts';

export function DeleteAccountForm({ userId, username }: { userId: string; username: string }) {
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      (await hasUnsyncedDraftHere(userId)) &&
      !window.confirm('You have a workout that has not synced yet. It will be lost. Delete anyway?')
    )
      return;
    setBusy(true);
    setProblem(null);
    try {
      await deleteMyAccount(typed, accountPassword);
      navigate('/', { replace: true });
      try {
        await signOutKeepingDrafts();
      } finally {
        await forgetOnThisDevice(forgetUserDeviceData, userId).catch(() => undefined);
      }
    } catch (error) {
      setProblem(messageOf(error, 'Could not delete your account.'));
      setBusy(false);
    }
  };

  return (
    <form className="danger-zone" onSubmit={submit}>
      <p>
        This deletes your workouts, records, programs and custom exercises for good. Export first if you want a copy.
      </p>
      <label className="field">
        Type your username ({username}) to confirm
        <input autoCapitalize="none" value={typed} onChange={(event) => setTyped(event.target.value)} />
      </label>
      <label className="field">
        Your password
        <input
          type="password"
          autoComplete="current-password"
          value={accountPassword}
          onChange={(event) => setAccountPassword(event.target.value)}
        />
      </label>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <button
        className="button danger"
        type="submit"
        disabled={busy || typed.trim().toLowerCase() !== username || accountPassword === ''}
      >
        Delete forever
      </button>
    </form>
  );
}
