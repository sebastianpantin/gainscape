import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { useUnsavedChangesGuard } from '../../components/UnsavedChangesGuard.tsx';
import { announceDataChange } from '../../lib/query/data-changes.ts';
import { characterCount, nameProblem, trimmedName } from '../../lib/names.ts';
import {
  BADGE_COLORS,
  type BadgeColor,
  BIO_MAX_LENGTH,
  bioProblem,
  birthYearProblem,
  bodyweightInUnitProblem,
  bodyweightKgFromInput,
  DISPLAY_NAME_MAX_LENGTH,
  feetAndInchesProblem,
  heightInCm,
  type HeightInput,
  heightProblem,
  initialHeight,
  initialsFor,
  latestBirthYear,
  optionalNumber,
  type Profile,
  sameHeightInput,
  saveProblemText,
  TRAINING_FOCUS_LABELS,
  type TrainingFocus,
  trainingSinceProblem,
  updatePrivateProfile,
  updatePublicProfile,
} from '../../lib/profile/profile.ts';
import { shownWeight } from '../../lib/units.ts';
import { PrivateTag } from './PrivateTag.tsx';
import { ProfileBadge } from './ProfileCard.tsx';
import { useProfile } from './use-profile.ts';

interface EditProfileScreenProps {
  userId: string;
}

const BADGE_ORDER = Object.keys(BADGE_COLORS) as BadgeColor[];
const FOCUS_ORDER = Object.keys(TRAINING_FOCUS_LABELS) as TrainingFocus[];
const CHECKED_FIELDS = ['displayName', 'bio', 'trainingSince', 'bodyweight', 'height', 'birthYear'] as const;
type CheckedField = (typeof CHECKED_FIELDS)[number];

interface EditFormProps {
  userId: string;
  profile: Profile;
  onSaved: () => Promise<unknown>;
}

function EditForm({ userId, profile, onSaved }: EditFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const unitPref = profile.unitPref;
  const [initialHeightInput] = useState<HeightInput>(() => initialHeight(profile.heightCm));
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [trainingFocus, setTrainingFocus] = useState<TrainingFocus | ''>(profile.trainingFocus ?? '');
  const [trainingSince, setTrainingSince] = useState(profile.trainingSince?.toString() ?? '');
  const [badgeColor, setBadgeColor] = useState<BadgeColor>(profile.badgeColor);
  const [initialBodyweight] = useState(() =>
    profile.bodyweightKg === null ? '' : String(shownWeight(profile.bodyweightKg, unitPref)),
  );
  const [bodyweight, setBodyweight] = useState(initialBodyweight);
  const [height, setHeight] = useState<HeightInput>(initialHeightInput);
  const [birthYear, setBirthYear] = useState(profile.birthYear?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [touched, setTouched] = useState<ReadonlySet<CheckedField>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const problemIdPrefix = useId();

  const heightCm = sameHeightInput(height, initialHeightInput, unitPref)
    ? profile.heightCm
    : heightInCm(height, unitPref);
  const issues: Record<CheckedField, string | null> = {
    displayName: nameProblem(displayName, DISPLAY_NAME_MAX_LENGTH),
    bio: bioProblem(bio),
    trainingSince: trainingSinceProblem(trainingSince),
    bodyweight: bodyweightInUnitProblem(bodyweight, unitPref),
    height: feetAndInchesProblem(height, unitPref) ?? (heightCm === null ? null : heightProblem(String(heightCm))),
    birthYear: birthYearProblem(birthYear),
  };
  const shownIssue = (field: CheckedField) => (submitted || touched.has(field) ? issues[field] : null);
  const problemId = (field: CheckedField) => `${problemIdPrefix}-${field}`;
  const checkedInput = (field: CheckedField) => ({
    name: field,
    onBlur: () => setTouched((fields) => new Set(fields).add(field)),
    'aria-invalid': shownIssue(field) ? true : undefined,
    'aria-describedby': shownIssue(field) ? problemId(field) : undefined,
  });
  const fieldProblem = (field: CheckedField) => {
    const issue = shownIssue(field);
    return (
      issue && (
        <p className="problem" id={problemId(field)}>
          {issue}
        </p>
      )
    );
  };
  const unsaved = useUnsavedChangesGuard(
    displayName !== profile.displayName ||
      bio !== (profile.bio ?? '') ||
      trainingFocus !== (profile.trainingFocus ?? '') ||
      trainingSince !== (profile.trainingSince?.toString() ?? '') ||
      badgeColor !== profile.badgeColor ||
      bodyweight !== initialBodyweight ||
      !sameHeightInput(height, initialHeightInput, unitPref) ||
      birthYear !== (profile.birthYear?.toString() ?? ''),
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    const firstInvalid = CHECKED_FIELDS.find((field) => issues[field]);
    if (firstInvalid) {
      event.currentTarget.querySelector<HTMLInputElement>(`input[name="${firstInvalid}"]`)?.focus();
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const trimmedBio = bio.trim();
      await updatePublicProfile(userId, {
        displayName: trimmedName(displayName),
        bio: trimmedBio === '' ? null : trimmedBio,
        trainingFocus: trainingFocus === '' ? null : trainingFocus,
        trainingSince: optionalNumber(trainingSince),
        badgeColor,
      });
      await updatePrivateProfile(userId, { heightCm, birthYear: optionalNumber(birthYear) });
      const typedKg = bodyweightKgFromInput(bodyweight, unitPref);
      if (typedKg !== null) {
        const unchanged =
          profile.bodyweightKg !== null &&
          shownWeight(profile.bodyweightKg, unitPref) === shownWeight(typedKg, unitPref);
        if (!unchanged) await updatePrivateProfile(userId, { bodyweightKg: typedKg });
      }
      void announceDataChange(queryClient, 'profile-saved');
      await onSaved();
      unsaved.allowLeaving();
      void navigate('/profile');
    } catch (error) {
      setProblem(saveProblemText(error));
      setSaving(false);
    }
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <section className="panel stack" aria-labelledby="about-heading">
        <div className="row spread">
          <h2 id="about-heading">About you</h2>
          <span className="public-tag">Friends see this</span>
        </div>
        <div className="row" style={{ gap: 12 }}>
          <ProfileBadge
            color={badgeColor}
            initials={initialsFor(displayName || profile.displayName, profile.username)}
          />
          <div className="stack" style={{ gap: 6 }}>
            <span className="field">Badge color</span>
            <div className="row wrap" role="radiogroup" aria-label="Badge color" style={{ gap: 6 }}>
              {BADGE_ORDER.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={badgeColor === color}
                  aria-label={BADGE_COLORS[color].label}
                  className="swatch-button"
                  style={{ background: BADGE_COLORS[color].fill }}
                  onClick={() => setBadgeColor(color)}
                />
              ))}
            </div>
          </div>
        </div>
        <label className="field">
          Display name
          <input
            {...checkedInput('displayName')}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <span className="hint">Your username @{profile.username} stays the same.</span>
        </label>
        {fieldProblem('displayName')}
        <label className="field">
          <span className="row spread">
            Bio
            <span className="hint" aria-live="polite">
              {characterCount(bio)} / {BIO_MAX_LENGTH}
            </span>
          </span>
          <input {...checkedInput('bio')} value={bio} onChange={(event) => setBio(event.target.value)} />
        </label>
        {fieldProblem('bio')}
        <label className="field">
          Training focus
          <select
            value={trainingFocus}
            onChange={(event) => setTrainingFocus(event.target.value as TrainingFocus | '')}
          >
            <option value="">Not set</option>
            {FOCUS_ORDER.map((focus) => (
              <option key={focus} value={focus}>
                {TRAINING_FOCUS_LABELS[focus]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Training since
          <input
            {...checkedInput('trainingSince')}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Year"
            value={trainingSince}
            onChange={(event) => setTrainingSince(event.target.value)}
          />
        </label>
        {fieldProblem('trainingSince')}
      </section>

      <section className="panel stack" aria-labelledby="body-heading">
        <div className="row spread">
          <h2 id="body-heading">Body</h2>
          <PrivateTag />
        </div>
        <label className="field">
          Bodyweight ({unitPref})
          <input
            {...checkedInput('bodyweight')}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={bodyweight}
            onChange={(event) => setBodyweight(event.target.value)}
          />
          <span className="hint">Used as the load for bodyweight exercises.</span>
        </label>
        {fieldProblem('bodyweight')}
        {unitPref === 'kg' ? (
          <label className="field">
            Height (cm)
            <input
              {...checkedInput('height')}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={height.cm}
              onChange={(event) => setHeight({ ...height, cm: event.target.value })}
            />
          </label>
        ) : (
          <fieldset className="stack" style={{ border: 0, padding: 0, gap: 6 }}>
            <legend className="field" style={{ marginBottom: 6 }}>
              Height
            </legend>
            <div className="row">
              <label className="unit-input" style={{ flexGrow: 1 }}>
                <input
                  {...checkedInput('height')}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label="Height feet"
                  value={height.feet}
                  onChange={(event) => setHeight({ ...height, feet: event.target.value })}
                />
                <span>ft</span>
              </label>
              <label className="unit-input" style={{ flexGrow: 1 }}>
                <input
                  {...checkedInput('height')}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label="Height inches"
                  value={height.inches}
                  onChange={(event) => setHeight({ ...height, inches: event.target.value })}
                />
                <span>in</span>
              </label>
            </div>
          </fieldset>
        )}
        {fieldProblem('height')}
        <label className="field">
          Birth year (optional)
          <input
            {...checkedInput('birthYear')}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder={`1900–${latestBirthYear()}`}
            value={birthYear}
            onChange={(event) => setBirthYear(event.target.value)}
          />
        </label>
        {fieldProblem('birthYear')}
        <span className="hint">Height and age never change your XP. They are only shown to you.</span>
      </section>

      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <button
        className="button primary big"
        type="submit"
        disabled={saving}
        onMouseDown={(event) => event.preventDefault()}
      >
        Save
      </button>
      <Link className="button" to="/profile">
        Cancel
      </Link>
      {unsaved.prompt}
    </form>
  );
}

export function EditProfileScreen({ userId }: EditProfileScreenProps) {
  const { state, refresh } = useProfile(userId);
  return (
    <main className="screen stack">
      <div className="stack" style={{ gap: 4 }}>
        <Link className="back-link" to="/profile">
          ‹ Profile
        </Link>
        <h1 className="title">Edit profile</h1>
      </div>
      {state.status === 'loading' && <ListSkeleton panels={4} />}
      {state.status === 'failed' && <ProblemWithRetry problem={state.problem} onRetry={refresh} />}
      {state.status === 'ready' && <EditForm userId={userId} profile={state.profile} onSaved={refresh} />}
    </main>
  );
}
