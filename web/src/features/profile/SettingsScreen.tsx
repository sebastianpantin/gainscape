import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { type FormEvent, Fragment, useId, useState } from 'react';
import { Link, type NavigateFunction, useNavigate } from 'react-router-dom';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { Switch } from '../../components/Switch.tsx';
import {
  changePassword,
  deleteMyAccount,
  exportFileName,
  exportMyData,
  requestEmailChange,
  RESET_CONFIRMATION,
  resetMyData,
  saveBlob,
} from '../../lib/account.ts';
import { MINIMUM_PASSWORD_LENGTH, passwordProblem } from '../../lib/auth-links.ts';
import { announceDataChange } from '../../lib/data-changes.ts';
import { GLOSSARY } from '../../lib/glossary.ts';
import { type BarbellSetup, HEAVIEST_BAR_OR_PLATE, isUsableBarOrPlate, PLATE_CHOICES } from '../../lib/plate-rules.ts';
import { readPlateSettings, savePlateSettings } from '../../lib/plate-settings-store.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { REST_CHOICES_S, REST_OFF, restClock, withChosenRest } from '../../lib/rest-timer-rules.ts';
import { deviceStorage, readRestState, saveRestState } from '../../lib/rest-timer-store.ts';
import type { TrainingDeviceSettings } from '../../lib/training-device-rules.ts';
import { readTrainingDeviceSettings, saveTrainingDeviceSettings } from '../../lib/training-device-store.ts';
import { APP_VERSION } from '../whats-new/changelog-data.ts';
import { askToNotify } from '../workout/rest-alert-effects.ts';
import {
  changeTimezone,
  cooldownStartFor,
  type EffortInputMode,
  formatDay,
  nextTimezoneChangeAt,
  type Profile,
  TIMEZONE_CHANGE_COOLDOWN_DAYS,
  type UnitPref,
  updatePrivateProfile,
  updatePublicProfile,
} from '../../lib/profile.ts';
import { openChannel } from '../../lib/channel.ts';
import { openDraftStoreOrFallback } from '../../offline/draft-boot.ts';
import { DRAFT_CHANNEL_NAME } from '../../offline/draft-session.ts';
import { hasDraftOnDevice } from '../../offline/local-drafts.ts';
import { forgetUserDeviceData, forgetUserProgressData } from '../../offline/user-device-data.ts';
import { signOutKeepingDrafts } from '../../offline/sync-workout.ts';
import { promptInstall, useInstallState } from '../../pwa/install.ts';
import { useUpdateFlow } from '../../pwa/register-service-worker.ts';
import type { UpdateCheck } from '../../pwa/update-flow.ts';
import { useOptimisticProfileSave } from './use-optimistic-profile-save.ts';
import { type ProfileUpdate, useProfile } from './use-profile.ts';
import { messageOf } from '../../lib/error-text.ts';
import { weeklyGoalQuery } from '../../lib/queries.ts';
import { fetchWeeklyGoalStatus, setWeeklyGoal } from '../../lib/weekly-goal.ts';
import {
  goalFromChoice,
  goalSettingHint,
  goalToChoice,
  WEEKLY_GOAL_CHOICES,
  type WeeklyGoalStatus,
} from '../../lib/weekly-goal-rules.ts';

interface SettingsScreenProps {
  userId: string;
  email: string | null;
}

async function forgetOnThisDevice(forget: typeof forgetUserDeviceData, userId: string): Promise<void> {
  const draftChannel = openChannel(DRAFT_CHANNEL_NAME);
  try {
    await forget({ localStorage, sessionStorage, draftStore: await openDraftStoreOrFallback(), draftChannel }, userId);
  } finally {
    draftChannel?.close();
  }
}

async function hasUnsyncedDraftHere(userId: string): Promise<boolean> {
  return hasDraftOnDevice(await openDraftStoreOrFallback(), deviceStorage(), userId);
}

async function signOut(userId: string, navigate: NavigateFunction): Promise<void> {
  if ((await hasUnsyncedDraftHere(userId)) && !window.confirm('Sign out? Your workout stays on this device.')) return;
  navigate('/', { replace: true });
  await signOutKeepingDrafts();
}

const UNIT_OPTIONS: { value: UnitPref; label: string }[] = [
  { value: 'kg', label: 'Kilograms' },
  { value: 'lb', label: 'Pounds' },
];

const EFFORT_OPTIONS: { value: EffortInputMode; label: string; hint: string }[] = [
  { value: 'level', label: 'Simple', hint: 'Four taps: easy, hard, near failure, failure.' },
  { value: 'rir', label: 'RIR', hint: GLOSSARY.rir.definition },
  { value: 'rpe', label: 'RPE', hint: GLOSSARY.rpe.definition },
];

const MOST_SEGMENTS_IN_ONE_ROW = 6;

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
      <div
        className={options.length > MOST_SEGMENTS_IN_ONE_ROW ? 'segmented wrapped' : 'segmented'}
        role="radiogroup"
        aria-label={label}
      >
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

const REST_OPTIONS = REST_CHOICES_S.map((restS) => ({
  value: String(restS),
  label: restS === REST_OFF ? 'Off' : restClock(restS),
}));

function RestChoice({ userId }: { userId: string }) {
  const [restS, setRestS] = useState(() => readRestState(deviceStorage(), userId).restS);
  const pick = (value: string) => {
    const picked = Number(value);
    setRestS(picked);
    saveRestState(deviceStorage(), userId, withChosenRest(readRestState(deviceStorage(), userId), picked));
  };
  return (
    <>
      <Choice label="Rest timer" options={REST_OPTIONS} current={String(restS)} disabled={false} onPick={pick} />
      <span className="hint">
        Starts when you finish a set. Compound lifts rest at least 3:00. Adjusting a rest keeps it for that exercise
        until you choose here again. Saved on this device only.
      </span>
    </>
  );
}

const ON_OFF_OPTIONS: { value: 'on' | 'off'; label: string }[] = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

const DEVICE_CHOICES: { name: keyof TrainingDeviceSettings; label: string; hint?: string }[] = [
  { name: 'vibrate', label: 'Vibration', hint: 'Buzz when a set is logged, a record falls and rest ends.' },
  { name: 'sound', label: 'Sound when rest ends' },
  { name: 'notify', label: 'Notify when rest ends in the background' },
  { name: 'keepAwake', label: 'Keep screen on during workouts' },
];

function TrainingDeviceChoices({ userId }: { userId: string }) {
  const [settings, setSettings] = useState(() => readTrainingDeviceSettings(deviceStorage(), userId));
  const [notifyBlocked, setNotifyBlocked] = useState(false);
  const [askingToNotify, setAskingToNotify] = useState(false);
  const change = (changes: Partial<TrainingDeviceSettings>) => {
    const next = { ...readTrainingDeviceSettings(deviceStorage(), userId), ...changes };
    setSettings(next);
    saveTrainingDeviceSettings(deviceStorage(), userId, next);
  };
  const pick = async (name: keyof TrainingDeviceSettings, value: 'on' | 'off') => {
    const on = value === 'on';
    if (name === 'notify') setNotifyBlocked(false);
    if (name === 'notify' && on) {
      setAskingToNotify(true);
      const allowed = await askToNotify();
      setAskingToNotify(false);
      setNotifyBlocked(!allowed);
      if (!allowed) return;
    }
    change({ [name]: on });
  };
  return (
    <>
      {DEVICE_CHOICES.map(({ name, label, hint }) => (
        <Fragment key={name}>
          <Choice
            label={label}
            options={ON_OFF_OPTIONS}
            current={settings[name] ? 'on' : 'off'}
            disabled={name === 'notify' && askingToNotify}
            onPick={(value) => void pick(name, value)}
          />
          {hint && <span className="hint">{hint}</span>}
        </Fragment>
      ))}
      {notifyBlocked && (
        <p className="problem" role="alert">
          This browser blocks notifications from Gainscape. Allow them in the browser's site settings.
        </p>
      )}
      <span className="hint">
        Saved on this device only. Phones can pause the app while the screen is off, so keep the screen on for alerts
        you can count on.
      </span>
    </>
  );
}

function PlateChoices({ userId, unit }: { userId: string; unit: UnitPref }) {
  const [setup, setSetup] = useState(() => readPlateSettings(deviceStorage(), userId)[unit]);
  const [barText, setBarText] = useState(() => String(setup.barWeight));
  const platesLabelId = useId();
  const barHintId = useId();
  const barNumber = Number(barText);
  const barValid = barText.trim() !== '' && isUsableBarOrPlate(barNumber);
  const change = (changes: Partial<BarbellSetup>) => {
    const latest = readPlateSettings(deviceStorage(), userId);
    const next = { ...latest[unit], ...changes };
    setSetup(next);
    savePlateSettings(deviceStorage(), userId, { ...latest, [unit]: next });
  };
  const changeBar = (text: string) => {
    setBarText(text);
    const barWeight = Number(text);
    if (text.trim() !== '' && isUsableBarOrPlate(barWeight)) change({ barWeight });
  };
  const togglePlate = (plate: number) => {
    const plates = setup.plates.includes(plate)
      ? setup.plates.filter((owned) => owned !== plate)
      : [...setup.plates, plate].sort((a, b) => b - a);
    change({ plates });
  };
  return (
    <>
      <label className="field">
        {`Bar weight (${unit})`}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={HEAVIEST_BAR_OR_PLATE}
          step={0.5}
          value={barText}
          aria-invalid={!barValid}
          aria-describedby={barValid ? undefined : barHintId}
          onChange={(event) => changeBar(event.target.value)}
        />
      </label>
      {!barValid && (
        <span className="problem tiny" id={barHintId}>
          {`Enter a bar weight above 0 and up to ${HEAVIEST_BAR_OR_PLATE} ${unit}. Using ${setup.barWeight} ${unit}.`}
        </span>
      )}
      <div className="stack" style={{ gap: 6 }}>
        <span className="field" id={platesLabelId}>{`Plates you have (${unit})`}</span>
        <div className="segmented plate-choices" role="group" aria-labelledby={platesLabelId}>
          {PLATE_CHOICES[unit].map((plate) => {
            const owned = setup.plates.includes(plate);
            return (
              <button
                key={plate}
                type="button"
                className={owned ? 'segment active' : 'segment'}
                aria-pressed={owned}
                onClick={() => togglePlate(plate)}
              >
                {plate}
              </button>
            );
          })}
        </div>
      </div>
      <span className="hint">
        Barbell sets show plates per side and warm-ups with this bar and these plates. A followed program's workouts use
        the program's bar. Saved on this device only.
      </span>
    </>
  );
}

function TrainingSection({ userId, profile, onSaved }: SectionProps) {
  const { applyPreferences } = usePreferences();
  const { save, pending, problem } = useOptimisticProfileSave<'unitPref' | 'effortInputMode'>(
    profile,
    onSaved,
    (changes) => updatePrivateProfile(userId, changes),
    applyPreferences,
  );

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
      <RestChoice userId={userId} />
      <TrainingDeviceChoices userId={userId} />
      <PlateChoices key={profile.unitPref} userId={userId} unit={profile.unitPref} />
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}

const WEEKLY_GOAL_OPTIONS = WEEKLY_GOAL_CHOICES.map((value) => ({ value, label: value === 'off' ? 'Off' : value }));

type LoadedGoal =
  { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'ready'; status: WeeklyGoalStatus | null };

function loadedGoalOf(goal: UseQueryResult<WeeklyGoalStatus | null>): LoadedGoal {
  if (goal.data !== undefined) return { kind: 'ready', status: goal.data };
  if (goal.error && !goal.isFetching)
    return { kind: 'failed', message: messageOf(goal.error, 'Could not load your weekly goal.') };
  return { kind: 'loading' };
}

function WeeklyGoalSection() {
  const queryClient = useQueryClient();
  const goalQuery = useQuery(weeklyGoalQuery);
  const loaded = loadedGoalOf(goalQuery);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const status = loaded.kind === 'ready' ? loaded.status : null;
  const chosen = status?.nextGoal ? status.nextGoal.goal : (status?.goal ?? null);

  const pick = async (goal: number | null) => {
    if (goal === chosen) return;
    setPending(true);
    setProblem(null);
    try {
      await setWeeklyGoal(goal);
      const saved = await fetchWeeklyGoalStatus(new AbortController().signal);
      await queryClient.cancelQueries({ queryKey: weeklyGoalQuery.queryKey });
      queryClient.setQueryData(weeklyGoalQuery.queryKey, saved);
      void announceDataChange(queryClient, 'weekly-goal-saved');
    } catch (error) {
      setProblem(messageOf(error, 'Could not save your weekly goal.'));
    } finally {
      setPending(false);
    }
  };

  if (loaded.kind === 'failed')
    return (
      <section className="panel stack" aria-labelledby="weekly-goal-heading">
        <h2 id="weekly-goal-heading">Weekly goal</h2>
        <p className="problem" role="alert">
          {loaded.message}
        </p>
        <button className="button outline" type="button" onClick={() => void goalQuery.refetch()}>
          Try again
        </button>
      </section>
    );

  return (
    <section className="panel stack" aria-labelledby="weekly-goal-heading">
      <h2 id="weekly-goal-heading">Weekly goal</h2>
      <Choice
        label="Workouts per week"
        options={WEEKLY_GOAL_OPTIONS}
        current={goalToChoice(chosen)}
        disabled={pending || loaded.kind === 'loading'}
        onPick={(choice) => void pick(goalFromChoice(choice))}
      />
      <span className="hint" aria-live="polite">
        {loaded.kind === 'ready' ? goalSettingHint(status) : ''}
      </span>
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

function TimezoneSection({ profile, onSaved }: Omit<SectionProps, 'userId'>) {
  const queryClient = useQueryClient();
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
      void announceDataChange(queryClient, 'timezone-changed');
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
      <dl className="stack" style={{ gap: 2 }}>
        <dt className="muted tiny">Current</dt>
        <dd>{profile.timezone}</dd>
      </dl>
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
          : `Decides which day a workout counts for. You can change it once every ${TIMEZONE_CHANGE_COOLDOWN_DAYS} days.`}
      </span>
    </section>
  );
}

function PrivacySection({ userId, profile, onSaved }: SectionProps) {
  const { save, pending, problem } = useOptimisticProfileSave<'showWeights' | 'showBodyweight'>(
    profile,
    onSaved,
    (changes) => updatePublicProfile(userId, changes),
  );

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

const LICENSES_PAGE = '/licenses/index.html';

const UPDATE_CHECK_TEXT: Record<Exclude<UpdateCheck, 'ready'>, string> = {
  up_to_date: "You're up to date.",
  download_failed: "Couldn't download the update. Try again later.",
};

function AppSection() {
  const install = useInstallState();
  const flow = useUpdateFlow();
  const [checking, setChecking] = useState(false);
  const [checkText, setCheckText] = useState<string | null>(null);

  const checkForUpdates = async () => {
    if (!flow) return;
    setChecking(true);
    setCheckText('Checking for updates…');
    try {
      const result = await flow.checkForUpdates();
      setCheckText(result === 'ready' ? null : UPDATE_CHECK_TEXT[result]);
    } catch {
      setCheckText("Couldn't check for updates.");
    }
    setChecking(false);
  };

  return (
    <section className="panel stack" aria-labelledby="app-heading">
      <h2 id="app-heading">App</h2>
      {install === 'promptable' && (
        <button className="button primary" type="button" onClick={() => void promptInstall()}>
          Install Gainscape
        </button>
      )}
      {install === 'ios_manual' && <p className="hint">In Safari, tap Share, then Add to Home Screen.</p>}
      {install === 'installed' && <p className="hint">Installed on this device.</p>}
      <span>Version {APP_VERSION}</span>
      <span className="muted tiny">Build {__APP_BUILD__}</span>
      <Link className="button link" to="/profile/settings/whats-new">
        What's new
      </Link>
      <button className="button" type="button" disabled={!flow || checking} onClick={checkForUpdates}>
        Check for updates
      </button>
      {checkText && (
        <p className="muted" role="status">
          {checkText}
        </p>
      )}
      <a className="button link" href={LICENSES_PAGE}>
        Licenses
      </a>
    </section>
  );
}

type AccountPanel = 'email' | 'password' | 'reset' | 'delete' | null;

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

function PasswordForm({ onDone }: { onDone: (text: string) => void }) {
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

function ResetDataForm({ userId, onDone }: { userId: string; onDone: (text: string) => void }) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    if (
      (await hasUnsyncedDraftHere(userId)) &&
      !window.confirm('You have a workout that has not synced yet. It will be lost. Reset anyway?')
    ) {
      setBusy(false);
      return;
    }
    try {
      await resetMyData();
    } catch (error) {
      setProblem(messageOf(error, 'Could not reset your data.'));
      setBusy(false);
      return;
    }
    await forgetOnThisDevice(forgetUserProgressData, userId).catch(() => undefined);
    await announceDataChange(queryClient, 'account-reset');
    onDone('Your data was reset. You start again from level 1.');
  };

  return (
    <form className="danger-zone" onSubmit={submit}>
      <p>
        This wipes your workouts, XP, records, loot, gear, bodyweight log, notes and goals for good. Your account,
        profile, friends, settings, custom exercises and programs stay. Export first if you want a copy.
      </p>
      <label className="field">
        Type {RESET_CONFIRMATION} to confirm
        <input autoCapitalize="characters" value={typed} onChange={(event) => setTyped(event.target.value)} />
      </label>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <button className="button danger" type="submit" disabled={busy || typed.trim() !== RESET_CONFIRMATION}>
        Reset everything
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
      (await hasUnsyncedDraftHere(userId)) &&
      !window.confirm('You have a workout that has not synced yet. It will be lost. Delete anyway?')
    )
      return;
    setBusy(true);
    setProblem(null);
    try {
      await deleteMyAccount(typed, accountPassword);
      navigate('/', { replace: true });
      try {
        await signOutKeepingDrafts();
      } finally {
        await forgetOnThisDevice(forgetUserDeviceData, userId).catch(() => undefined);
      }
    } catch (error) {
      setProblem(messageOf(error, 'Could not delete your account.'));
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
          {panel === 'password' && <PasswordForm onDone={done} />}
        </>
      )}
      <button className="button" type="button" disabled={exporting} onClick={exportData}>
        Export my data
      </button>
      <button className="button" type="button" onClick={() => signOut(userId, navigate)}>
        Sign out
      </button>
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
      {state.status === 'loading' && <ListSkeleton />}
      {state.status === 'failed' && (
        <p className="problem" role="alert">
          {state.problem}
        </p>
      )}
      {state.status === 'ready' && (
        <>
          <TrainingSection userId={userId} profile={state.profile} onSaved={replace} />
          <WeeklyGoalSection />
          <TimezoneSection profile={state.profile} onSaved={replace} />
          <PrivacySection userId={userId} profile={state.profile} onSaved={replace} />
        </>
      )}
      <AppSection />
      <AccountSection
        userId={userId}
        email={email}
        username={state.status === 'ready' ? state.profile.username : null}
      />
    </main>
  );
}
