import { type NavigateFunction } from 'react-router-dom';
import { openChannel } from '../../../lib/platform/channel.ts';
import { deviceStorage } from '../../../lib/platform/keyed-store.ts';
import { openDraftStoreOrFallback } from '../../../offline/draft-boot.ts';
import { DRAFT_CHANNEL_NAME } from '../../../offline/draft-session.ts';
import { hasDraftOnDevice } from '../../../offline/local-drafts.ts';
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

export async function hasUnsyncedDraftHere(userId: string): Promise<boolean> {
  return hasDraftOnDevice(await openDraftStoreOrFallback(), deviceStorage(), userId);
}

export async function signOut(navigate: NavigateFunction): Promise<void> {
  navigate('/', { replace: true });
  await signOutKeepingDrafts();
}
