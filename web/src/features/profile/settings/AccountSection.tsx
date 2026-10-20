import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { exportFileName, exportMyData, saveBlob } from '../../../lib/profile/account.ts';
import { messageOf } from '../../../lib/error-text.ts';
import { useToast } from '../../../lib/ui/toast.ts';
import { ConfirmDialog } from '../../../components/ConfirmDialog.tsx';
import { DeleteAccountForm } from './DeleteAccountForm.tsx';
import { signOut, useDraftLossGuard } from './device-data.ts';
import { EmailForm } from './EmailForm.tsx';
import { PasswordForm } from './PasswordForm.tsx';
import { ResetDataForm } from './ResetDataForm.tsx';

type AccountPanel = 'email' | 'password' | 'reset' | 'delete' | null;

export function AccountSection({
  userId,
  email,
  username,
}: {
  userId: string;
  email: string | null;
  username: string | null;
}) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState<AccountPanel>(null);
  const { showToast, dismissToast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const signOutGuard = useDraftLossGuard(userId, {
    failureText: 'Could not sign out.',
    perform: () => signOut(navigate),
  });

  const toggle = (next: AccountPanel) => {
    dismissToast();
    setPanel(panel === next ? null : next);
  };

  const done = (text: string) => {
    setPanel(null);
    showToast(text);
  };

  const exportData = async () => {
    setExporting(true);
    setProblem(null);
    dismissToast();
    try {
      saveBlob(await exportMyData(), exportFileName());
      showToast('Your data was downloaded.');
    } catch (error) {
      setProblem(messageOf(error, 'Could not export your data.'));
    }
    setExporting(false);
  };

  return (
    <section className="panel stack" aria-labelledby="account-heading">
      <h2 id="account-heading">Account</h2>
      <dl className="well stack" style={{ gap: 2 }}>
        <dt className="muted tiny">Email</dt>
        <dd>{email ?? '—'}</dd>
      </dl>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      {email && (
        <>
          <button className="button" type="button" aria-expanded={panel === 'email'} onClick={() => toggle('email')}>
            Change email
          </button>
          {panel === 'email' && <EmailForm email={email} onDone={done} />}
          <button
            className="button"
            type="button"
            aria-expanded={panel === 'password'}
            onClick={() => toggle('password')}
          >
            Change password
          </button>
          {panel === 'password' && <PasswordForm onDone={done} />}
        </>
      )}
      <button className="button" type="button" disabled={exporting} onClick={exportData}>
        Export my data
      </button>
      <button className="button" type="button" disabled={signOutGuard.busy} onClick={() => void signOutGuard.ask()}>
        Sign out
      </button>
      {signOutGuard.confirmingDraftLoss && (
        <ConfirmDialog
          title="Sign out?"
          confirmLabel="Sign out"
          onConfirm={() => void signOutGuard.run()}
          onCancel={signOutGuard.cancel}
        >
          <p>Your workout stays on this device.</p>
        </ConfirmDialog>
      )}
      <button
        className="button danger-outline"
        type="button"
        aria-expanded={panel === 'reset'}
        onClick={() => toggle('reset')}
      >
        Reset all data
      </button>
      {panel === 'reset' && <ResetDataForm userId={userId} onDone={done} />}
      {username && (
        <>
          <button
            className="button danger-outline"
            type="button"
            aria-expanded={panel === 'delete'}
            onClick={() => toggle('delete')}
          >
            Delete account
          </button>
          {panel === 'delete' && <DeleteAccountForm userId={userId} username={username} />}
        </>
      )}
    </section>
  );
}
