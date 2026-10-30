import { type ReactNode, useState } from 'react';
import { type UnitPref } from '../../lib/profile/profile.ts';
import { useIsOffline } from '../../lib/platform/use-online.ts';
import { type FinishStatus } from '../../offline/finish-retries.ts';
import { BodyweightPrompt } from './BodyweightPrompt.tsx';
import { DiscardWorkoutDialog } from './DiscardWorkoutDialog.tsx';
import { FINISH_HOLD_TEXT, rejectionText, savingTitle, stalledSyncText, syncingStatus } from './workout-rules.ts';

interface SavingWorkoutViewProps {
  deviceNotices: ReactNode;
  finishStatus: FinishStatus;
  holding: boolean;
  atRisk: boolean;
  unit: UnitPref;
  onSaveNow: () => void;
  onRetryNow: () => void;
  onBackToEditing: () => void;
  onSaveBodyweight: (bodyweightKg: number) => Promise<void>;
  onDiscard: () => void;
}

export function SavingWorkoutView({
  deviceNotices,
  finishStatus,
  holding,
  atRisk,
  unit,
  onSaveNow,
  onRetryNow,
  onBackToEditing,
  onSaveBodyweight,
  onDiscard,
}: SavingWorkoutViewProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const saving = { status: finishStatus, holding, offline: useIsOffline(), atRisk };
  const syncing = syncingStatus(saving);
  return (
    <main className="screen stack">
      <h1 className="title">{savingTitle(saving)}</h1>
      {deviceNotices}
      {holding && (
        <div className="panel stack">
          <p role="status">{FINISH_HOLD_TEXT}</p>
          <button className="button primary" type="button" onClick={onSaveNow}>
            Save now
          </button>
          <button className="button" type="button" onClick={onBackToEditing}>
            Keep training
          </button>
        </div>
      )}
      {!holding && finishStatus.kind === 'syncing' && (
        <div className="panel stack">
          <p role="status">{syncing.text}</p>
          {syncing.retry && (
            <button className="button" type="button" onClick={onRetryNow}>
              Retry now
            </button>
          )}
        </div>
      )}
      {finishStatus.kind === 'stalled' && (
        <div className="panel stack">
          <p className="problem" role="alert">
            {stalledSyncText(finishStatus.reason)}
          </p>
          <button className="button" type="button" onClick={onRetryNow}>
            Retry now
          </button>
          <button className="button" type="button" onClick={onBackToEditing}>
            Back to editing
          </button>
        </div>
      )}
      {finishStatus.kind === 'rejected' && finishStatus.reason === 'bodyweight_required' && (
        <BodyweightPrompt unit={unit} onSave={onSaveBodyweight} />
      )}
      {finishStatus.kind === 'rejected' && finishStatus.reason !== 'bodyweight_required' && (
        <div className="panel stack">
          <p className="problem" role="alert">
            {rejectionText(finishStatus.reason)}
          </p>
          <button className="button" type="button" onClick={onBackToEditing}>
            Back to editing
          </button>
          <button className="button danger" type="button" onClick={() => setConfirmingDiscard(true)}>
            Discard workout
          </button>
        </div>
      )}
      {confirmingDiscard && <DiscardWorkoutDialog onConfirm={onDiscard} onCancel={() => setConfirmingDiscard(false)} />}
    </main>
  );
}
