import { type FormEvent, useEffect, useState } from 'react';
import { LogoMark } from '../../components/PixelArt.tsx';
import { MINIMUM_PASSWORD_LENGTH } from '../../lib/account.ts';
import { authCallbackUrl, authErrorMessage, RESEND_COOLDOWN_SECONDS } from '../../lib/auth-links.ts';
import { supabase } from '../../lib/supabase.ts';
import { openDraftStoreAndReconcile } from '../../offline/draft-boot.ts';

type Mode = 'sign-in' | 'register' | 'check-email' | 'forgot' | 'reset-sent';

const USERNAME_PATTERN = '^[a-z0-9_]{3,20}$';
const SIGNUP_TRIGGER_FAILURE = 'Database error saving new user';
const RATE_LIMITED_STATUS = 429;
const MILLISECONDS_PER_SECOND = 1000;

const emailRedirectTo = () => authCallbackUrl(window.location.origin);

type RegisterOutcome = { problem: string } | { needsConfirmation: boolean };

async function register(username: string, email: string, password: string): Promise<RegisterOutcome> {
  const {
    data: available,
    error: availabilityError,
    status: availabilityStatus,
  } = await supabase.rpc('username_available', { candidate: username });
  const availabilityRateLimited = availabilityStatus === RATE_LIMITED_STATUS;
  if (availabilityError && !availabilityRateLimited) return { problem: availabilityError.message };
  if (!availabilityError && !available) return { problem: 'That username is taken.' };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: emailRedirectTo(),
      data: { username, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    },
  });
  if (error?.message.includes(SIGNUP_TRIGGER_FAILURE)) return { problem: 'That username is taken.' };
  if (error) return { problem: authErrorMessage(error) };
  return { needsConfirmation: data.session === null };
}

async function signIn(email: string, password: string): Promise<{ problem: string | null; unconfirmed: boolean }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return { problem: null, unconfirmed: false };
  return { problem: authErrorMessage(error), unconfirmed: error.code === 'email_not_confirmed' };
}

function useResend(email: string) {
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [resendProblem, setResendProblem] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const remaining =
    sentAt === null
      ? 0
      : Math.max(
          0,
          Math.ceil((sentAt + RESEND_COOLDOWN_SECONDS * MILLISECONDS_PER_SECOND - now) / MILLISECONDS_PER_SECOND),
        );

  useEffect(() => {
    if (remaining === 0) return;
    const timer = setInterval(() => setNow(Date.now()), MILLISECONDS_PER_SECOND);
    return () => clearInterval(timer);
  }, [remaining]);

  const markSent = () => {
    const at = Date.now();
    setSentAt(at);
    setNow(at);
  };

  async function resend() {
    setResendProblem(null);
    setResent(false);
    markSent();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: emailRedirectTo() },
    });
    if (error) setResendProblem(authErrorMessage(error));
    else setResent(true);
  }

  return { remaining, resend, markSent, resendProblem, resent };
}

function ResendButton({ resend }: { resend: ReturnType<typeof useResend> }) {
  return (
    <>
      <button className="button" type="button" disabled={resend.remaining > 0} onClick={() => void resend.resend()}>
        {resend.remaining > 0 ? `Resend email (${resend.remaining} s)` : 'Resend email'}
      </button>
      {resend.resent && (
        <p className="notice" role="status">
          We sent the link again.
        </p>
      )}
      {resend.resendProblem && (
        <p className="problem" role="alert">
          {resend.resendProblem}
        </p>
      )}
    </>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [keptWorkout, setKeptWorkout] = useState(false);
  const resend = useResend(email);

  useEffect(() => {
    let active = true;
    openDraftStoreAndReconcile()
      .then((store) => store.userIdsWithDrafts())
      .then((userIds) => active && setKeptWorkout(userIds.length > 0))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setUnconfirmed(false);
    if (mode === 'register') {
      const outcome = await register(username.toLowerCase(), email, password);
      if ('problem' in outcome) setProblem(outcome.problem);
      else if (outcome.needsConfirmation) {
        setProblem(null);
        resend.markSent();
        setMode('check-email');
      }
    } else if (mode === 'forgot') {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: emailRedirectTo() });
      setProblem(null);
      setMode('reset-sent');
    } else {
      const outcome = await signIn(email, password);
      setProblem(outcome.problem);
      setUnconfirmed(outcome.unconfirmed);
    }
    setBusy(false);
  }

  const switchTo = (next: Mode) => {
    setMode(next);
    setProblem(null);
    setUnconfirmed(false);
  };

  const backToSignIn = (
    <button className="button link" type="button" onClick={() => switchTo('sign-in')}>
      Back to sign in
    </button>
  );

  return (
    <main className="screen auth-screen">
      <div className="brand">
        <LogoMark size={48} />
        <h1>GAINSCAPE</h1>
        <p>A lifting log where every hard set earns XP.</p>
      </div>
      {keptWorkout && (
        <p className="notice" role="status">
          Your unsynced workout is saved on this device. Sign in to sync it.
        </p>
      )}
      {mode === 'check-email' && (
        <section className="panel stack">
          <h2 className="accent-text">Check your email</h2>
          <p>
            We sent a confirmation link to <b>{email}</b>.
          </p>
          <ResendButton resend={resend} />
          {backToSignIn}
        </section>
      )}
      {mode === 'reset-sent' && (
        <section className="panel stack">
          <h2 className="accent-text">Check your email</h2>
          <p role="status">If an account exists for {email}, we sent a reset link.</p>
          {backToSignIn}
        </section>
      )}
      {(mode === 'sign-in' || mode === 'register' || mode === 'forgot') && (
        <form className="panel stack" onSubmit={submit}>
          <h2 className="accent-text">
            {mode === 'sign-in' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Reset password'}
          </h2>
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
              <span className="hint">3–20 characters: a–z, 0–9 and _. Friends find you by it.</span>
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
          {mode !== 'forgot' && (
            <label className="field">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={MINIMUM_PASSWORD_LENGTH}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                required
              />
            </label>
          )}
          {problem && (
            <p className="problem" role="alert">
              {problem}
            </p>
          )}
          {unconfirmed && <ResendButton resend={resend} />}
          <button className="button primary big" type="submit" disabled={busy}>
            {mode === 'sign-in' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
          </button>
          {mode === 'sign-in' && (
            <>
              <button className="button link" type="button" onClick={() => switchTo('forgot')}>
                Forgot password?
              </button>
              <button className="button link" type="button" onClick={() => switchTo('register')}>
                New here? Create an account
              </button>
            </>
          )}
          {mode === 'register' && (
            <button className="button link" type="button" onClick={() => switchTo('sign-in')}>
              Already have an account? Sign in
            </button>
          )}
          {mode === 'forgot' && backToSignIn}
        </form>
      )}
    </main>
  );
}
