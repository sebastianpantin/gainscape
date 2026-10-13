import { type NavigateFunction } from 'react-router-dom';
import { openChannel } from '../../../lib/channel.ts';
import { deviceStorage } from '../../../lib/rest-timer-store.ts';
import { openDraftStoreOrFallback } from '../../../offline/draft-boot.ts';
import { DRAFT_CHANNEL_NAME } from '../../../offline/draft-session.ts';
import { hasDraftOnDevice } from '../../../offline/local-drafts.ts';
import { type forgetUserDeviceData } from '../../../offline/user-device-data.ts';
import { signOutKeepingDrafts } from '../../../offline/sync-workout.ts';

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

export async function signOut(userId: string, navigate: NavigateFunction): Promise<void> {
  if ((await hasUnsyncedDraftHere(userId)) && !window.confirm('Sign out? Your workout stays on this device.')) return;
  navigate('/', { replace: true });
  await signOutKeepingDrafts();
}
