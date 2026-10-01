import { type AuthChangeEvent, isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { z } from 'zod';

export const AUTH_FALLBACK_MS = 3000;

export type AuthState =
  { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; session: Session; offline: boolean };

const storedSessionSchema = z.looseObject({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.number(),
  user: z.looseObject({ id: z.uuid(), email: z.string() }),
});

const AUTH_PATH = '/auth/v1/';
const TOKEN_PATH = '/auth/v1/token';
const REFRESH_GRANT = 'refresh_token';

export function authStorageKey(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

export function needsAuthTimeout(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!parsed.pathname.includes(AUTH_PATH)) return false;
  return !(parsed.pathname.endsWith(TOKEN_PATH) && parsed.searchParams.get('grant_type') === REFRESH_GRANT);
}

const forcedSignOutListeners = new Set<() => void>();

export function onForcedSignOut(listener: () => void): () => void {
  forcedSignOutListeners.add(listener);
  return () => forcedSignOutListeners.delete(listener);
}

export function forceSignedOut(): void {
  for (const listener of forcedSignOutListeners) listener();
}

export interface SignOutPorts {
  signOut: () => Promise<{ error: unknown }>;
  forget: () => void;
  fallbackMs?: number;
}

export async function signOutOnThisDevice({ signOut, forget, fallbackMs = AUTH_FALLBACK_MS }: SignOutPorts) {
  const signedOut = signOut()
    .catch((error: unknown) => ({ error }))
    .then(({ error }) => {
      if (error) forget();
      return error ? 'failed' : 'done';
    });
  const slow = new Promise<'slow'>((resolve) => setTimeout(() => resolve('slow'), fallbackMs));
  if ((await Promise.race([signedOut, slow])) === 'slow') forget();
}

export function storedSessionFrom(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const parsed = storedSessionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as unknown as Session) : null;
  } catch {
    return null;
  }
}

export interface GetSessionResult {
  data: { session: Session | null };
  error: unknown;
}

export interface AuthBootPorts {
  getSession: () => Promise<GetSessionResult>;
  storedSession: () => Session | null;
  isOnline: () => boolean;
  setState: (state: AuthState) => void;
}

export interface AuthBoot {
  onAuthEvent: (event: AuthChangeEvent, session: Session | null) => void;
  stop: () => void;
}

export function bootAuth({ getSession, storedSession, isOnline, setState }: AuthBootPorts): AuthBoot {
  let active = true;
  let resolved = false;
  let lastSession: Session | null = null;
  const set = (state: AuthState) => {
    if (active) setState(state);
  };
  const offlineSession = () => lastSession ?? storedSession();

  const fallback = setTimeout(() => {
    if (resolved) return;
    const session = offlineSession();
    if (session) set({ status: 'signed-in', session, offline: true });
  }, AUTH_FALLBACK_MS);

  getSession()
    .catch((error: unknown): GetSessionResult => ({ data: { session: null }, error }))
    .then(({ data, error }) => {
      clearTimeout(fallback);
      resolved = true;
      if (data.session) return set({ status: 'signed-in', session: data.session, offline: false });
      const session = isAuthRetryableFetchError(error) || !isOnline() ? offlineSession() : null;
      set(session ? { status: 'signed-in', session, offline: true } : { status: 'signed-out' });
    });

  return {
    onAuthEvent: (event, session) => {
      if (session) {
        lastSession = session;
        resolved = true;
        set({ status: 'signed-in', session, offline: false });
      } else if (event === 'SIGNED_OUT') {
        lastSession = null;
        resolved = true;
        set({ status: 'signed-out' });
      }
    },
    stop: () => {
      active = false;
      clearTimeout(fallback);
    },
  };
}
