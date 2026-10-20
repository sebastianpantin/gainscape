import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RESET_CONFIRMATION, resetMyData } from '../../../lib/profile/account.ts';
import { announceDataChange } from '../../../lib/query/data-changes.ts';
import { forgetUserProgressData } from '../../../offline/user-device-data.ts';
import { ConfirmDialog } from '../../../components/ConfirmDialog.tsx';
import { forgetOnThisDevice, UNSYNCED_DRAFT_LOSS_TEXT, useDraftLossGuard } from './device-data.ts';

export function ResetDataForm({ userId, onDone }: { userId: string; onDone: (text: string) => void }) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState('');
  const guard = useDraftLossGuard(userId, {
    failureText: 'Could not reset your data.',
    perform: resetMyData,
    afterPerform: async () => {
      await forgetOnThisDevice(forgetUserProgressData, userId).catch(() => undefined);
      await announceDataChange(queryClient, 'account-reset');
      onDone('Your data was reset. You start again from level 1.');
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
        This wipes your workouts, XP, records, loot, gear, bodyweight log, notes and goals for good. Your account,
        profile, friends, settings, custom exercises and programs stay. Export first if you want a copy.
      </p>
      <label className="field">
        Type {RESET_CONFIRMATION} to confirm
        <input autoCapitalize="characters" value={typed} onChange={(event) => setTyped(event.target.value)} />
      </label>
      {guard.problem && (
        <p className="problem" role="alert">
          {guard.problem}
        </p>
      )}
      <button className="button danger" type="submit" disabled={guard.busy || typed.trim() !== RESET_CONFIRMATION}>
        Reset everything
      </button>
      {guard.confirmingDraftLoss && (
        <ConfirmDialog
          title="Reset anyway?"
          confirmLabel="Reset anyway"
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
