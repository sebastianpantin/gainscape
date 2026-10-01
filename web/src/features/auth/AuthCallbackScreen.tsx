import { type FormEvent, useEffect, useRef, useState } from 'react';
import { LogoMark } from '../../components/PixelArt.tsx';
import { MINIMUM_PASSWORD_LENGTH } from '../../lib/account.ts';
import { type AuthCallback, authErrorMessage } from '../../lib/auth-links.ts';
import { supabase } from '../../lib/supabase.ts';

type Step =
  | { kind: 'verifying' }
  | { kind: 'choose-password'; username: string }
  | { kind: 'new-password' }
  | { kind: 'password-changed' }
  | { kind: 'email-changed' }
  | { kind: 'failed'; problem: string };

const USERNAME_PATTERN = '^[a-z0-9_]{3,20}$';

const USERNAME_PROBLEMS: Record<string, string> = {
  username_taken: 'That username is taken.',
  invalid_username: 'Use 3–20 characters: a–z, 0–9 and _.',
  username_change_closed: 'Your username can no longer be changed.',
};

async function usernameOf(userId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('username').eq('id', userId).maybeSingle();
  return data?.username ?? '';
}

async function verify(callback: AuthCallback): Promise<Step> {
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: callback.tokenHash, type: callback.type });
  if (error) return { kind: 'failed', problem: authErrorMessage(error) };
  if (callback.type === 'recovery') return { kind: 'new-password' };
  if (callback.type === 'email_change') return { kind: 'email-changed' };
  return { kind: 'choose-password', username: data.user ? await usernameOf(data.user.id) : '' };
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
      {password.length > 0 && password.length < MINIMUM_PASSWORD_LENGTH && (
        <p className="problem">Use at least {MINIMUM_PASSWORD_LENGTH} characters.</p>
      )}
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

  useEffect(() => {
    if (started.current) return;
    started.current = true;
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
    if (step.kind === 'choose-password' && username.trim().toLowerCase() !== step.username) {
      const renamed = await supabase.rpc('change_username', { candidate: username.trim().toLowerCase() });
      if (renamed.error) {
        setProblem(USERNAME_PROBLEMS[renamed.error.message] ?? renamed.error.message);
        setBusy(false);
        return;
      }
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setProblem(authErrorMessage(error));
      setBusy(false);
      return;
    }
    setBusy(false);
    if (step.kind === 'choose-password') finish();
    else setStep({ kind: 'password-changed' });
  }

  return (
    <main className="screen auth-screen">
      <div className="brand">
        <LogoMark size={48} />
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
                Your username is <b data-testid="confirmed-username">{step.username}</b>. Choose a password to finish.
              </p>
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
        </form>
      )}
    </main>
  );
}
