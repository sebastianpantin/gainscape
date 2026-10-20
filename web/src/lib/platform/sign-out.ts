import { isDeviceOffline } from '../../offline/cache-first.ts';
import { forceSignedOut, signOutOnThisDevice } from './auth-restore.ts';
import { AUTH_STORAGE_KEY, readStoredSession, supabase } from './supabase.ts';

function forgetStoredSession(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    return;
  } finally {
    forceSignedOut();
  }
}

export async function signOutKeepingDrafts(): Promise<void> {
  await signOutOnThisDevice({
    signOut: () => supabase.auth.signOut({ scope: 'local' }),
    storedSession: readStoredSession,
    isOnline: () => !isDeviceOffline(),
    forget: forgetStoredSession,
  });
}
