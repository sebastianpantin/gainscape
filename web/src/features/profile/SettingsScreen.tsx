import { type FormEvent, useState } from 'react';
import { Link, type NavigateFunction, useNavigate } from 'react-router-dom';
import { Switch } from '../../components/Switch.tsx';
import {
  changePassword,
  deleteMyAccount,
  exportFileName,
  exportMyData,
  MINIMUM_PASSWORD_LENGTH,
  requestEmailChange,
  saveBlob,
} from '../../lib/account.ts';
import { usePreferences } from '../../lib/preferences.ts';
import {
  changeTimezone,
  type EffortInputMode,
  nextTimezoneChangeAt,
  type Profile,
  TIMEZONE_CHANGE_COOLDOWN_DAYS,
  type UnitPref,
  updatePrivateProfile,
  updatePublicProfile,
} from '../../lib/profile.ts';
import { openDraftStoreAndReconcile } from '../../offline/draft-boot.ts';
import { storedSessionId } from '../../offline/draft-format.ts';
import { signOutKeepingDrafts } from '../../offline/sync-workout.ts';
import { type ProfileUpdate, useProfile } from './use-profile.ts';

interface SettingsScreenProps {
  userId: string;
  email: string | null;
}

async function discardLocalDraft(userId: string): Promise<void> {
  const store = await openDraftStoreAndReconcile();
  const record = await store.get(userId);
  if (record) await store.discard(userId, storedSessionId(record));
}

async function hasUnsyncedDraft(userId: string): Promise<boolean> {
  const store = await openDraftStoreAndReconcile();
  return (await store.userIdsWithDrafts()).includes(userId);
}

async function signOut(userId: string, navigate: NavigateFunction): Promise<void> {
  if ((await hasUnsyncedDraft(userId)) && !window.confirm('Sign out? Your workout stays on this device.')) return;
  navigate('/', { replace: true });
  await signOutKeepingDrafts();
}

const UNIT_OPTIONS: { value: UnitPref; label: string }[] = [
  { value: 'kg', label: 'Kilograms' },
  { value: 'lb', label: 'Pounds' },
];

const EFFORT_OPTIONS: { value: EffortInputMode; label: string; hint: string }[] = [
  { value: 'level', label: 'Simple', hint: 'Four taps: easy, hard, near failure, failure.' },
  { value: 'rir', label: 'RIR', hint: 'Reps in reserve: how many more you could have done, 0 to 6+.' },
  { value: 'rpe', label: 'RPE', hint: 'Rate of perceived exertion, 6 to 10. RPE 8 means 2 reps in reserve.' },
];

function Choice<T extends string>({
  label,
  options,
  current,
  disabled,
  onPick,
}: {
  label: string;
  options: { value: T; label: string }[];
  current: T;
  disabled: boolean;
  onPick: (value: T) => void;
}) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="field">{label}</span>
      <div className={options.length === 3 ? 'segmented three' : 'segmented'} role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={current === option.value}
            className={current === option.value ? 'segment active' : 'segment'}
            disabled={disabled}
            onClick={() => onPick(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SectionProps {
  userId: string;
  profile: Profile;
  onSaved: (update: ProfileUpdate) => void;
}

function previousValues<K extends keyof Profile>(
  profile: Profile,
  changes: Partial<Pick<Profile, K>>,
): Pick<Profile, K> {
  return Object.fromEntries(Object.keys(changes).map((key) => [key, profile[key as K]])) as Pick<Profile, K>;
}

function TrainingSection({ userId, profile, onSaved }: SectionProps) {
  const { applyPreferences } = usePreferences();
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const save = async (changes: Partial<Pick<Profile, 'unitPref' | 'effortInputMode'>>) => {
    const previous = previousValues(profile, changes);
    setProblem(null);
    setPending(true);
    onSaved((current) => ({ ...current, ...changes }));
    applyPreferences(changes);
    try {
      await updatePrivateProfile(userId, changes);
    } catch (error) {
      onSaved((current) => ({ ...current, ...previous }));
      applyPreferences(previous);
      setProblem(error instanceof Error ? error.message : 'Could not save that setting.');
    }
    setPending(false);
  };

  return (
    <section className="panel stack" aria-labelledby="training-heading">
      <h2 id="training-heading">Training</h2>
      <Choice
        label="Weight units"
        options={UNIT_OPTIONS}
        current={profile.unitPref}
        disabled={pending}
        onPick={(unitPref) => save({ unitPref })}
      />
      <span className="hint">Everything is stored in kilograms, so switching never creates false records.</span>
      <Choice
        label="How you rate effort"
        options={EFFORT_OPTIONS}
        current={profile.effortInputMode}
        disabled={pending}
        onPick={(effortInputMode) => save({ effortInputMode })}
      />
      <span className="hint">{EFFORT_OPTIONS.find((option) => option.value === profile.effortInputMode)?.hint}</span>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}

function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function allTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return [deviceTimezone()];
  }
}

const DAY_MS = 86_400_000;

function cooldownStartFor(nextAllowedAt: string): string {
  return new Date(new Date(nextAllowedAt).getTime() - TIMEZONE_CHANGE_COOLDOWN_DAYS * DAY_MS).toISOString();
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function TimezoneSection({ profile, onSaved }: SectionProps) {
  const [candidate, setCandidate] = useState(profile.timezone);
  const [message, setMessage] = useState<{ kind: 'problem' | 'status'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const nextAllowed = nextTimezoneChangeAt(profile);
  const zones = allTimezones();
  const device = deviceTimezone();

  const change = async (event: FormEvent) => {
    event.preventDefault();
    if (candidate === profile.timezone) return;
    setBusy(true);
    setMessage(null);
    const result = await changeTimezone(candidate);
    setBusy(false);
    if (result.ok) {
      onSaved((current) => ({ ...current, timezone: candidate, timezoneChangedAt: new Date().toISOString() }));
      setMessage({ kind: 'status', text: `Time zone changed to ${candidate}.` });
    } else if (result.reason === 'too_soon') {
      onSaved((current) => ({ ...current, timezoneChangedAt: cooldownStartFor(result.nextAllowedAt) }));
      setMessage({ kind: 'problem', text: `You can change it again on ${formatDay(new Date(result.nextAllowedAt))}.` });
    } else {
      setMessage({ kind: 'problem', text: result.message });
    }
  };

  return (
    <section className="panel stack" aria-labelledby="time-heading">
      <h2 id="time-heading">Time zone</h2>
      <span data-testid="settings-timezone">{profile.timezone}</span>
      <form className="timezone-row" onSubmit={change}>
        <label className="field">
          Change to
          <select
            value={candidate}
            disabled={nextAllowed !== null}
            onChange={(event) => setCandidate(event.target.value)}
          >
            {!zones.includes(profile.timezone) && <option value={profile.timezone}>{profile.timezone}</option>}
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button outline"
          type="submit"
          disabled={busy || nextAllowed !== null || candidate === profile.timezone}
        >
          Change
        </button>
      </form>
      {device !== profile.timezone && nextAllowed === null && (
        <button className="button link" type="button" onClick={() => setCandidate(device)}>
          Use this device's time zone ({device})
        </button>
      )}
      {message && (
        <p
          className={message.kind === 'problem' ? 'problem' : 'muted'}
          role={message.kind === 'problem' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
      <span className="hint">
        {nextAllowed
          ? `Decides which day a workout counts for. Your next change is possible on ${formatDay(nextAllowed)}.`
          : 'Decides which day a workout counts for. You can change it once every 7 days.'}
      </span>
    </section>
  );
}

function PrivacySection({ userId, profile, onSaved }: SectionProps) {
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const save = async (changes: Partial<Pick<Profile, 'showWeights' | 'showBodyweight'>>) => {
    const previous = previousValues(profile, changes);
    setProblem(null);
    setPending(true);
    onSaved((current) => ({ ...current, ...changes }));
    try {
      await updatePublicProfile(userId, changes);
    } catch (error) {
      onSaved((current) => ({ ...current, ...previous }));
      setProblem(error instanceof Error ? error.message : 'Could not save that setting.');
    }
    setPending(false);
  };

  return (
    <section className="panel stack" aria-labelledby="privacy-heading">
      <h2 id="privacy-heading">Privacy</h2>
      <Switch
        label="Show my weights to friends"
        hint='Off: friends see "New 8RM Leg Press" without the load.'
        checked={profile.showWeights}
        disabled={pending}
        onChange={(showWeights) => save({ showWeights })}
      />
      <Switch
        label="Show my bodyweight to friends"
        hint="Off: weighted pull-ups and dips show only the added weight."
        checked={profile.showBodyweight}
        disabled={pending}
        onChange={(showBodyweight) => save({ showBodyweight })}
      />
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <span className="hint">Your height, age and bodyweight entries are never shown to anyone.</span>
    </section>
  );
}

type AccountPanel = 'email' | 'password' | 'delete' | null;

function EmailForm({ email, onDone }: { email: string; onDone: (text: string) => void }) {
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
      setProblem(error instanceof Error ? error.message : 'Could not change your email.');
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

function PasswordForm({ email, onDone }: { email: string; onDone: (text: string) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tooShort = next.length > 0 && next.length < MINIMUM_PASSWORD_LENGTH;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await changePassword(email, current, next);
      onDone('Password changed.');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not change your password.');
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
      {tooShort && <p className="problem">Use at least {MINIMUM_PASSWORD_LENGTH} characters.</p>}
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

function DeleteAccountForm({ userId, username }: { userId: string; username: string }) {
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      (await hasUnsyncedDraft(userId)) &&
      !window.confirm('You have a workout that has not synced yet. It will be lost. Delete anyway?')
    )
      return;
    setBusy(true);
    setProblem(null);
    try {
      await deleteMyAccount(typed, accountPassword);
      await discardLocalDraft(userId).catch(() => undefined);
      navigate('/', { replace: true });
      await signOutKeepingDrafts();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not delete your account.');
      setBusy(false);
    }
  };

  return (
    <form className="danger-zone" onSubmit={submit}>
      <p>
        This deletes your workouts, records, programs and custom exercises for good. Export first if you want a copy.
      </p>
      <label className="field">
        Type your username ({username}) to confirm
        <input autoCapitalize="none" value={typed} onChange={(event) => setTyped(event.target.value)} />
      </label>
      <label className="field">
        Your password
        <input
          type="password"
          autoComplete="current-password"
          value={accountPassword}
          onChange={(event) => setAccountPassword(event.target.value)}
        />
      </label>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <button
        className="button danger"
        type="submit"
        disabled={busy || typed.trim().toLowerCase() !== username || accountPassword === ''}
      >
        Delete forever
      </button>
    </form>
  );
}

function AccountSection({
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
  const [status, setStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const toggle = (next: AccountPanel) => {
    setStatus(null);
    setPanel(panel === next ? null : next);
  };

  const done = (text: string) => {
    setPanel(null);
    setStatus(text);
  };

  const exportData = async () => {
    setExporting(true);
    setProblem(null);
    try {
      saveBlob(await exportMyData(), exportFileName());
      setStatus('Your data was downloaded.');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not export your data.');
    }
    setExporting(false);
  };

  return (
    <section className="panel stack" aria-labelledby="account-heading">
      <h2 id="account-heading">Account</h2>
      <div className="well stack" style={{ gap: 2 }}>
        <span className="muted tiny">Email</span>
        <span data-testid="settings-email">{email ?? '—'}</span>
      </div>
      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}
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
          {panel === 'password' && <PasswordForm email={email} onDone={done} />}
        </>
      )}
      <button className="button" type="button" disabled={exporting} onClick={exportData}>
        Export my data
      </button>
      <button className="button" type="button" onClick={() => signOut(userId, navigate)}>
        Sign out
      </button>
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

export function SettingsScreen({ userId, email }: SettingsScreenProps) {
  const { state, replace } = useProfile(userId);

  return (
    <main className="screen stack">
      <div className="stack" style={{ gap: 4 }}>
        <Link className="back-link" to="/profile">
          ‹ Profile
        </Link>
        <h1 className="title">Settings</h1>
      </div>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'failed' && (
        <p className="problem" role="alert">
          {state.problem}
        </p>
      )}
      {state.status === 'ready' && (
        <>
          <TrainingSection userId={userId} profile={state.bundle.profile} onSaved={replace} />
          <TimezoneSection userId={userId} profile={state.bundle.profile} onSaved={replace} />
          <PrivacySection userId={userId} profile={state.bundle.profile} onSaved={replace} />
        </>
      )}
      <AccountSection
        userId={userId}
        email={email}
        username={state.status === 'ready' ? state.bundle.profile.username : null}
      />
    </main>
  );
}
