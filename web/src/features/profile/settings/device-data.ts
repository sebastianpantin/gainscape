import { useState } from 'react';
import { type NavigateFunction } from 'react-router-dom';
import { messageOf } from '../../../lib/error-text.ts';
import { openChannel } from '../../../lib/platform/channel.ts';
import { hasUnsyncedDraftHere, openDraftStoreOrFallback } from '../../../offline/draft-boot.ts';
import { DRAFT_CHANNEL_NAME } from '../../../offline/draft-session.ts';
import { type forgetUserDeviceData } from '../../../offline/user-device-data.ts';
import { signOutKeepingDrafts } from '../../../offline/sync-workout.ts';

export const UNSYNCED_DRAFT_LOSS_TEXT = 'You have a workout that has not synced yet. It will be lost.';

export async function forgetOnThisDevice(forget: typeof forgetUserDeviceData, userId: string): Promise<void> {
  const draftChannel = openChannel(DRAFT_CHANNEL_NAME);
  try {
    await forget({ localStorage, sessionStorage, draftStore: await openDraftStoreOrFallback(), draftChannel }, userId);
  } finally {
    draftChannel?.close();
  }
}

export async function signOut(navigate: NavigateFunction): Promise<void> {
  navigate('/', { replace: true });
  await signOutKeepingDrafts();
}

interface DraftLossGuardSteps {
  failureText: string;
  perform: () => Promise<void>;
  afterPerform?: () => Promise<void>;
}

export function useDraftLossGuard(userId: string, { failureText, perform, afterPerform }: DraftLossGuardSteps) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingDraftLoss, setConfirmingDraftLoss] = useState(false);

  const run = async () => {
    setConfirmingDraftLoss(false);
    setBusy(true);
    setProblem(null);
    try {
      await perform();
    } catch (error) {
      setProblem(messageOf(error, failureText));
      setBusy(false);
      return;
    }
    await afterPerform?.();
  };

  const ask = async () => {
    if (busy) return;
    setBusy(true);
    if (!(await hasUnsyncedDraftHere(userId))) return run();
    setBusy(false);
    setConfirmingDraftLoss(true);
  };

  return { busy, problem, confirmingDraftLoss, ask, run, cancel: () => setConfirmingDraftLoss(false) };
}
