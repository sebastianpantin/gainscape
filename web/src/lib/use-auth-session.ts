import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabase } from './supabase.ts';

export type AuthState =
  { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; session: Session; offline: boolean };

export function useAuthSession(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let lastSession: Session | null = null;
    supabase.auth.getSession().then(({ data, error }) => {
      const session = data.session ?? lastSession;
      if (data.session) setState({ status: 'signed-in', session: data.session, offline: false });
      else if (isAuthRetryableFetchError(error) && session) setState({ status: 'signed-in', session, offline: true });
      else setState({ status: 'signed-out' });
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        lastSession = session;
        setState({ status: 'signed-in', session, offline: false });
      } else if (event === 'SIGNED_OUT') {
        lastSession = null;
        setState({ status: 'signed-out' });
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  return state;
}
