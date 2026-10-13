import { type FormEvent, useState } from 'react';
import { requestEmailChange } from '../../../lib/profile/account.ts';
import { messageOf } from '../../../lib/error-text.ts';

export function EmailForm({ email, onDone }: { email: string; onDone: (text: string) => void }) {
  const [newEmail, setNewEmail] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await requestEmailChange(newEmail.trim());
      onDone(`We sent confirmation links to ${email} and ${newEmail.trim()}. Your email changes once you open both.`);
    } catch (error) {
      setProblem(messageOf(error, 'Could not change your email.'));
      setBusy(false);
    }
  };

  return (
    <form className="well stack" onSubmit={submit}>
      <label className="field">
        New email
        <input
          type="email"
          autoComplete="email"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          required
        />
      </label>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <button
        className="button primary"
        type="submit"
        disabled={busy || newEmail.trim() === '' || newEmail.trim() === email}
      >
        Send confirmation
      </button>
    </form>
  );
}
