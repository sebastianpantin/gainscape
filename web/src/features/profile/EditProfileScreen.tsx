import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { nameProblem, trimmedName } from '../../lib/names.ts';
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
} from '../../lib/profile.ts';
import { shownWeight } from '../../lib/units.ts';
import { PrivateTag } from './PrivateTag.tsx';
import { ProfileBadge } from './ProfileCard.tsx';
import { useProfile } from './use-profile.ts';

interface EditProfileScreenProps {
  userId: string;
}

const BADGE_ORDER = Object.keys(BADGE_COLORS) as BadgeColor[];
const FOCUS_ORDER = Object.keys(TRAINING_FOCUS_LABELS) as TrainingFocus[];

interface EditFormProps {
  userId: string;
  profile: Profile;
  onSaved: () => Promise<unknown>;
}

function EditForm({ userId, profile, onSaved }: EditFormProps) {
  const navigate = useNavigate();
  const unitPref = profile.unitPref;
  const [initialHeightInput] = useState<HeightInput>(() => initialHeight(profile.heightCm));
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [trainingFocus, setTrainingFocus] = useState<TrainingFocus | ''>(profile.trainingFocus ?? '');
  const [trainingSince, setTrainingSince] = useState(profile.trainingSince?.toString() ?? '');
  const [badgeColor, setBadgeColor] = useState<BadgeColor>(profile.badgeColor);
  const [bodyweight, setBodyweight] = useState(
    profile.bodyweightKg === null ? '' : String(shownWeight(profile.bodyweightKg, unitPref)),
  );
  const [height, setHeight] = useState<HeightInput>(initialHeightInput);
  const [birthYear, setBirthYear] = useState(profile.birthYear?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const heightCm = sameHeightInput(height, initialHeightInput, unitPref)
    ? profile.heightCm
    : heightInCm(height, unitPref);
  const issues = {
    displayName: nameProblem(displayName, DISPLAY_NAME_MAX_LENGTH),
    bio: bioProblem(bio),
    trainingSince: trainingSinceProblem(trainingSince),
    bodyweight: bodyweightInUnitProblem(bodyweight, unitPref),
    height: feetAndInchesProblem(height, unitPref) ?? (heightCm === null ? null : heightProblem(String(heightCm))),
    birthYear: birthYearProblem(birthYear),
  };
  const invalid = Object.values(issues).some(Boolean);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (invalid) return;
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
      await onSaved();
      navigate('/profile');
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
            value={displayName}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <span className="hint">Your username @{profile.username} stays the same.</span>
        </label>
        {issues.displayName && <p className="problem">{issues.displayName}</p>}
        <label className="field">
          <span className="row spread">
            Bio
            <span className="hint" aria-live="polite">
              {bio.length} / {BIO_MAX_LENGTH}
            </span>
          </span>
          <input value={bio} maxLength={BIO_MAX_LENGTH} onChange={(event) => setBio(event.target.value)} />
        </label>
        {issues.bio && <p className="problem">{issues.bio}</p>}
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
            type="number"
            inputMode="numeric"
            placeholder="Year"
            value={trainingSince}
            onChange={(event) => setTrainingSince(event.target.value)}
          />
        </label>
        {issues.trainingSince && <p className="problem">{issues.trainingSince}</p>}
      </section>

      <section className="panel stack" aria-labelledby="body-heading">
        <div className="row spread">
          <h2 id="body-heading">Body</h2>
          <PrivateTag />
        </div>
        <label className="field">
          Bodyweight ({unitPref})
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={bodyweight}
            onChange={(event) => setBodyweight(event.target.value)}
          />
          <span className="hint">Used as the load for bodyweight exercises.</span>
        </label>
        {issues.bodyweight && <p className="problem">{issues.bodyweight}</p>}
        {unitPref === 'kg' ? (
          <label className="field">
            Height (cm)
            <input
              type="number"
              inputMode="decimal"
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
                  type="number"
                  inputMode="numeric"
                  aria-label="Height feet"
                  value={height.feet}
                  onChange={(event) => setHeight({ ...height, feet: event.target.value })}
                />
                <span>ft</span>
              </label>
              <label className="unit-input" style={{ flexGrow: 1 }}>
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label="Height inches"
                  value={height.inches}
                  onChange={(event) => setHeight({ ...height, inches: event.target.value })}
                />
                <span>in</span>
              </label>
            </div>
          </fieldset>
        )}
        {issues.height && <p className="problem">{issues.height}</p>}
        <label className="field">
          Birth year (optional)
          <input
            type="number"
            inputMode="numeric"
            placeholder={`1900–${latestBirthYear()}`}
            value={birthYear}
            onChange={(event) => setBirthYear(event.target.value)}
          />
        </label>
        {issues.birthYear && <p className="problem">{issues.birthYear}</p>}
        <span className="hint">Height and age never change your XP. They are only shown to you.</span>
      </section>

      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <button className="button primary big" type="submit" disabled={saving || invalid}>
        Save
      </button>
      <Link className="button" to="/profile">
        Cancel
      </Link>
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
      {state.status === 'failed' && (
        <p className="problem" role="alert">
          {state.problem}
        </p>
      )}
      {state.status === 'ready' && <EditForm userId={userId} profile={state.profile} onSaved={refresh} />}
    </main>
  );
}
