import { type FormEvent, useState } from 'react';
import { supabase } from '../../lib/supabase.ts';

type Mode = 'sign-in' | 'register';

const USERNAME_PATTERN = '^[a-z0-9_]{3,20}$';
const SIGNUP_TRIGGER_FAILURE = 'Database error saving new user';

async function register(username: string, email: string, password: string): Promise<string | null> {
  const { data: available, error: availabilityError } = await supabase.rpc('username_available', {
    candidate: username,
  });
  if (availabilityError) return availabilityError.message;
  if (!available) return 'That username is taken.';

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } },
  });
  if (error?.message.includes(SIGNUP_TRIGGER_FAILURE)) return 'That username is taken.';
  return error?.message ?? null;
}

async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error?.message ?? null;
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(
      mode === 'register' ? await register(username.toLowerCase(), email, password) : await signIn(email, password),
    );
    setBusy(false);
  }

  const switchTo = (next: Mode) => {
    setMode(next);
    setProblem(null);
  };

  return (
    <main className="screen auth-screen">
      <h1 className="title">Gainscape</h1>
      <form className="panel stack" onSubmit={submit}>
        <h2>{mode === 'sign-in' ? 'Sign in' : 'Create account'}</h2>
        {mode === 'register' && (
          <label className="field">
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              pattern={USERNAME_PATTERN}
              title="3–20 characters: lowercase letters, digits, underscore"
              autoCapitalize="none"
              autoComplete="username"
              required
            />
          </label>
        )}
        <label className="field">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
          />
        </label>
        {problem && (
          <p className="problem" role="alert">
            {problem}
          </p>
        )}
        <button className="button primary" type="submit" disabled={busy}>
          {mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>
        {mode === 'sign-in' ? (
          <button className="button link" type="button" onClick={() => switchTo('register')}>
            New here? Create an account
          </button>
        ) : (
          <button className="button link" type="button" onClick={() => switchTo('sign-in')}>
            Already have an account? Sign in
          </button>
        )}
      </form>
    </main>
  );
}
