import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { supabase } from './supabase.ts';

export type AuthState = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; session: Session };

export function useAuthSession(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    const toState = (session: Session | null): AuthState =>
      session ? { status: 'signed-in', session } : { status: 'signed-out' };
    supabase.auth.getSession().then(({ data }) => setState(toState(data.session)));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => setState(toState(session)));
    return () => subscription.subscription.unsubscribe();
  }, []);

  return state;
}
