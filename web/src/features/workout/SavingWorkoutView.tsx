import { type ReactNode } from 'react';
import { type UnitPref } from '../../lib/profile/profile.ts';
import { RATE_LIMITED_CODE } from '../../lib/platform/rate-limit.ts';
import { type FinishStatus } from '../../offline/finish-retries.ts';
import { BodyweightPrompt } from './BodyweightPrompt.tsx';
import { rejectionText, stalledSyncText, syncProblemText } from './workout-rules.ts';

interface SavingWorkoutViewProps {
  deviceNotices: ReactNode;
  finishStatus: FinishStatus;
  unit: UnitPref;
  onRetryNow: () => void;
  onBackToEditing: () => void;
  onSaveBodyweight: (bodyweightKg: number) => Promise<void>;
  onDiscard: () => void;
}

export function SavingWorkoutView({
  deviceNotices,
  finishStatus,
  unit,
  onRetryNow,
  onBackToEditing,
  onSaveBodyweight,
  onDiscard,
}: SavingWorkoutViewProps) {
  return (
    <main className="screen stack">
      <h1 className="title">Saving workout…</h1>
      {deviceNotices}
      {finishStatus.kind === 'syncing' && (
        <div className="panel stack" role="status">
          <p>
            {finishStatus.lastProblem
              ? syncProblemText(finishStatus.lastProblem, finishStatus.waitMs)
              : 'Sending your workout…'}
          </p>
          {finishStatus.lastProblem && finishStatus.lastProblem !== RATE_LIMITED_CODE && (
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
          <button className="button danger" type="button" onClick={onDiscard}>
            Discard workout
          </button>
        </div>
      )}
    </main>
  );
}
