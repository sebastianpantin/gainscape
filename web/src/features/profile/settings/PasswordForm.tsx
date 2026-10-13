import { type FormEvent, useState } from 'react';
import { changePassword } from '../../../lib/profile/account.ts';
import { MINIMUM_PASSWORD_LENGTH, passwordProblem } from '../../../lib/platform/auth-links.ts';
import { messageOf } from '../../../lib/error-text.ts';

export function PasswordForm({ onDone }: { onDone: (text: string) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lengthProblem = next.length > 0 ? passwordProblem(next) : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await changePassword(current, next);
      onDone('Password changed.');
    } catch (error) {
      setProblem(messageOf(error, 'Could not change your password.'));
      setBusy(false);
    }
  };

  return (
    <form className="well stack" onSubmit={submit}>
      <label className="field">
        Current password
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          required
        />
      </label>
      <label className="field">
        New password
        <input
          type="password"
          autoComplete="new-password"
          minLength={MINIMUM_PASSWORD_LENGTH}
          value={next}
          onChange={(event) => setNext(event.target.value)}
          required
        />
      </label>
      {lengthProblem && <p className="problem">{lengthProblem}</p>}
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <button
        className="button primary"
        type="submit"
        disabled={busy || current === '' || next.length < MINIMUM_PASSWORD_LENGTH}
      >
        Change password
      </button>
    </form>
  );
}
