import { useEffect, useState } from 'react';
import { type AuthState, authStorageKey, bootAuth, storedSessionFrom } from './auth-restore.ts';
import { supabase, supabaseUrl } from './supabase.ts';

export type { AuthState } from './auth-restore.ts';

function readStoredSession() {
  try {
    return storedSessionFrom(localStorage.getItem(authStorageKey(supabaseUrl)));
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
    return () => {
      boot.stop();
      subscription.subscription.unsubscribe();
    };
  }, []);

  return state;
}
