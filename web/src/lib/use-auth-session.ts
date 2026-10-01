import { useEffect, useState } from 'react';
import { type AuthState, bootAuth, onForcedSignOut, storedSessionFrom } from './auth-restore.ts';
import { AUTH_STORAGE_KEY, supabase } from './supabase.ts';

export type { AuthState } from './auth-restore.ts';

function readStoredSession() {
  try {
    return storedSessionFrom(localStorage.getItem(AUTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function useAuthSession(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    const boot = bootAuth({
      getSession: () => supabase.auth.getSession(),
      storedSession: readStoredSession,
      isOnline: () => navigator.onLine !== false,
      setState,
    });
    const { data: subscription } = supabase.auth.onAuthStateChange(boot.onAuthEvent);
    const stopForcedSignOut = onForcedSignOut(() => boot.onAuthEvent('SIGNED_OUT', null));
    return () => {
      boot.stop();
      stopForcedSignOut();
      subscription.subscription.unsubscribe();
    };
  }, []);

  return state;
}
