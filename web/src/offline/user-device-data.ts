import { forgetLastSummaryOf } from './last-summary.ts';
import { forgetCachedExercises } from '../lib/exercises/catalog-cache.ts';
import { companionPetStore } from '../lib/collection/companion-pet-store.ts';
import { forgetCachedExerciseNotes } from '../lib/exercises/exercise-note-cache.ts';
import { forgetLastSeenRelease } from '../lib/platform/last-seen-release-store.ts';
import { forgetOnboarding } from '../lib/profile/onboarding-store.ts';
import { forgetPlateSettings } from '../lib/workout/plate-settings-store.ts';
import { preferencesCache } from '../lib/profile/preferences.ts';
import { forgetDismissedSummaries } from '../lib/programs/program-summary-store.ts';
import { forgetRestState } from '../lib/workout/rest-timer-store.ts';
import { forgetSessionBaseline } from '../lib/workout/session-baseline-store.ts';
import { forgetTrainingDevice } from '../lib/workout/training-device-store.ts';
import { forgetInstallCard } from '../pwa/install-state.ts';
import { collectionCache } from './collection-cache.ts';
import { type DraftChannel } from './draft-session.ts';
import { type DraftStore } from './draft-store.ts';
import { forgetItemsCache } from './items-cache.ts';
import { forgetDraftOnDevice } from './local-drafts.ts';
import { profileCache } from './profile-cache.ts';
import { forgetProgramCache } from './program-cache.ts';
import { programListCache } from './program-list-cache.ts';
import { questsCache } from './quests-cache.ts';
import { seenLevelsCache } from './seen-levels-cache.ts';
import { standingCache } from './standing-cache.ts';
import { statsCache } from './stats-cache.ts';

interface UserDevice {
  localStorage: Storage;
  sessionStorage: Storage | null;
  draftStore: DraftStore;
  draftChannel?: Pick<DraftChannel, 'postMessage'> | null;
}

export async function forgetUserProgressData(device: UserDevice, userId: string): Promise<void> {
  const storage = device.localStorage;
  forgetCachedExercises(storage, userId);
  forgetCachedExerciseNotes(storage, userId);
  forgetProgramCache(storage, userId);
  forgetItemsCache(storage, userId);
  programListCache.forget(storage, userId);
  standingCache.forget(storage, userId);
  seenLevelsCache.forget(storage, userId);
  profileCache.forget(storage, userId);
  collectionCache.forget(storage, userId);
  questsCache.forget(storage, userId);
  statsCache.forget(storage, userId);
  forgetSessionBaseline(storage, userId);
  forgetDismissedSummaries(storage, userId);
  forgetLastSummaryOf(device.sessionStorage, userId);
  await forgetDraftOnDevice(device.draftStore, storage, userId, device.draftChannel ?? null);
}

export async function forgetUserDeviceData(device: UserDevice, userId: string): Promise<void> {
  const storage = device.localStorage;
  preferencesCache.forget(storage, userId);
  forgetPlateSettings(storage, userId);
  forgetRestState(storage, userId);
  forgetTrainingDevice(storage, userId);
  forgetLastSeenRelease(storage, userId);
  forgetOnboarding(storage, userId);
  forgetInstallCard(storage, userId);
  companionPetStore.forget(storage, userId);
  await forgetUserProgressData(device, userId);
}
