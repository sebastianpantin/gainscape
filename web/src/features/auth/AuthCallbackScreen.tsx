import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { LogoMark } from '../../components/PixelArt.tsx';
import {
  type AuthCallback,
  authErrorMessage,
  confirmedRecently,
  MINIMUM_PASSWORD_LENGTH,
  passwordProblem,
  USERNAME_HINT,
  USERNAME_PATTERN,
} from '../../lib/auth-links.ts';
import { announceDataChange } from '../../lib/data-changes.ts';
import { RATE_LIMITED_CODE, retryAfterSeconds, tryAgainIn } from '../../lib/rate-limit.ts';
import { signOutSettled } from '../../lib/auth-restore.ts';
import { supabase } from '../../lib/supabase.ts';

type Step =
  | { kind: 'verifying' }
  | { kind: 'choose-password'; username: string }
  | { kind: 'new-password' }
  | { kind: 'password-changed' }
  | { kind: 'email-changed' }
  | { kind: 'failed'; problem: string };

const USERNAME_PROBLEMS: Record<string, string> = {
  taken: 'That username is taken.',
  invalid: 'Use 3–20 characters: a–z, 0–9 and _.',
  closed: 'Your username can no longer be changed.',
};

async function renameTo(candidate: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('change_username', { candidate });
  if (error) return error.message === RATE_LIMITED_CODE ? tryAgainIn(retryAfterSeconds(error.details)) : error.message;
  const status = (data as { status: string }).status;
  return status === 'ok' ? null : (USERNAME_PROBLEMS[status] ?? status);
}

async function usernameOf(userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('username').eq('id', userId).maybeSingle();
  return data?.username ?? '';
}

async function passwordStep(callback: AuthCallback, userId: string): Promise<Step> {
  if (callback.type === 'recovery') return { kind: 'new-password' };
  return { kind: 'choose-password', username: await usernameOf(userId) };
}

async function verify(callback: AuthCallback): Promise<Step> {
  await signOutSettled();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: callback.tokenHash, type: callback.type });
  if (error) {
    const { data: current } = await supabase.auth.getUser();
    if (callback.type !== 'email_change' && current.user && confirmedRecently(current.user.email_confirmed_at)) {
      return passwordStep(callback, current.user.id);
    }
    return { kind: 'failed', problem: authErrorMessage(error) };
  }
  if (callback.type === 'email_change') return { kind: 'email-changed' };
  return passwordStep(callback, data.user?.id ?? '');
}

function PasswordFields({
  password,
  repeat,
  onPassword,
  onRepeat,
}: {
  password: string;
  repeat: string;
  onPassword: (value: string) => void;
  onRepeat: (value: string) => void;
}) {
  const problem = passwordProblem(password);
  return (
    <>
      <label className="field">
        New password
        <input
          type="password"
          autoComplete="new-password"
          minLength={MINIMUM_PASSWORD_LENGTH}
          value={password}
          onChange={(event) => onPassword(event.target.value)}
          required
        />
      </label>
      <label className="field">
        Repeat new password
        <input
          type="password"
          autoComplete="new-password"
          minLength={MINIMUM_PASSWORD_LENGTH}
          value={repeat}
          onChange={(event) => onRepeat(event.target.value)}
          required
        />
      </label>
      {password.length > 0 && problem && <p className="problem">{problem}</p>}
      {repeat.length > 0 && repeat !== password && <p className="problem">The passwords don't match.</p>}
    </>
  );
}

export function AuthCallbackScreen({ callback, onDone }: { callback: AuthCallback; onDone: () => void }) {
  const [step, setStep] = useState<Step>({ kind: 'verifying' });
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [username, setUsername] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    window.history.replaceState(null, '', '/');
    verify(callback).then((next) => {
      if (next.kind === 'choose-password') setUsername(next.username);
      setStep(next);
    });
  }, [callback]);

  const finish = () => {
    window.history.replaceState(null, '', '/');
    onDone();
  };

  const passwordReady = password.length >= MINIMUM_PASSWORD_LENGTH && repeat === password;

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const chosenUsername = username.trim().toLowerCase();
    if (step.kind === 'choose-password' && chosenUsername !== step.username) {
      const renameProblem = await renameTo(chosenUsername);
      if (renameProblem) {
        setProblem(renameProblem);
        setBusy(false);
        return;
      }
      void announceDataChange(queryClient, 'profile-saved');
    }
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setProblem(authErrorMessage(error));
      return;
    }
    if (step.kind === 'choose-password') finish();
    else setStep({ kind: 'password-changed' });
  }

  return (
    <main className="screen auth-screen">
      <div className="brand">
        <LogoMark />
        <h1>GAINSCAPE</h1>
      </div>
      {step.kind === 'verifying' && (
        <section className="panel stack">
          <p role="status">Checking your link…</p>
        </section>
      )}
      {step.kind === 'failed' && (
        <section className="panel stack">
          <p className="problem" role="alert">
            {step.problem}
          </p>
          <button className="button primary big" type="button" onClick={finish}>
            Back to sign in
          </button>
        </section>
      )}
      {step.kind === 'email-changed' && (
        <section className="panel stack">
          <h2 className="accent-text">Email change confirmed</h2>
          <p role="status">
            Email change confirmed. If you were asked to confirm on both addresses, open the other link too.
          </p>
          <button className="button primary big" type="button" onClick={finish}>
            Continue
          </button>
        </section>
      )}
      {step.kind === 'password-changed' && (
        <section className="panel stack">
          <h2 className="accent-text">Password changed</h2>
          <p role="status">Password changed. You're signed in.</p>
          <button className="button primary big" type="button" onClick={finish}>
            Continue
          </button>
        </section>
      )}
      {(step.kind === 'choose-password' || step.kind === 'new-password') && (
        <form className="panel stack" onSubmit={savePassword}>
          <h2 className="accent-text">
            {step.kind === 'choose-password' ? 'Account confirmed' : 'Set a new password'}
          </h2>
          {step.kind === 'choose-password' && (
            <>
              <p>
                Your username is <b>{step.username}</b>. Choose a password to finish.
              </p>
              <label className="field">
                Username
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  pattern={USERNAME_PATTERN}
                  title={USERNAME_HINT}
                  autoCapitalize="none"
                  autoComplete="username"
                  required
                />
                <span className="hint">
                  Not the name you picked? Change it now. Friends find you by it, and later it can't be changed.
                </span>
              </label>
            </>
          )}
          <PasswordFields password={password} repeat={repeat} onPassword={setPassword} onRepeat={setRepeat} />
          {problem && (
            <p className="problem" role="alert">
              {problem}
            </p>
          )}
          <button className="button primary big" type="submit" disabled={busy || !passwordReady}>
            {step.kind === 'choose-password' ? 'Save and continue' : 'Set new password'}
          </button>
          <button className="button link" type="button" onClick={finish}>
            Not now
          </button>
        </form>
      )}
    </main>
  );
}
