import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteMyAccount } from '../../../lib/profile/account.ts';
import { signOutKeepingDrafts } from '../../../offline/sync-workout.ts';
import { forgetUserDeviceData } from '../../../offline/user-device-data.ts';
import { ConfirmDialog } from '../../../components/ConfirmDialog.tsx';
import { forgetOnThisDevice, UNSYNCED_DRAFT_LOSS_TEXT, useDraftLossGuard } from './device-data.ts';

export function DeleteAccountForm({ userId, username }: { userId: string; username: string }) {
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const guard = useDraftLossGuard(userId, {
    failureText: 'Could not delete your account.',
    perform: async () => {
      await deleteMyAccount(typed, accountPassword);
      navigate('/', { replace: true });
      try {
        await signOutKeepingDrafts();
      } finally {
        await forgetOnThisDevice(forgetUserDeviceData, userId).catch(() => undefined);
      }
    },
  });

  return (
    <form
      className="danger-zone"
      onSubmit={(event) => {
        event.preventDefault();
        void guard.ask();
      }}
    >
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
      {guard.problem && (
        <p className="problem" role="alert">
          {guard.problem}
        </p>
      )}
      <button
        className="button danger"
        type="submit"
        disabled={guard.busy || typed.trim().toLowerCase() !== username || accountPassword === ''}
      >
        Delete forever
      </button>
      {guard.confirmingDraftLoss && (
        <ConfirmDialog
          title="Delete anyway?"
          confirmLabel="Delete anyway"
          danger
          onConfirm={() => void guard.run()}
          onCancel={guard.cancel}
        >
          <p>{UNSYNCED_DRAFT_LOSS_TEXT}</p>
        </ConfirmDialog>
      )}
    </form>
  );
}
