import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.tsx';
import { saveBodyweight } from '../../lib/catalog.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { ageFrom, HIGHEST_BODYWEIGHT_KG, LOWEST_BODYWEIGHT_KG } from '../../lib/profile.ts';
import { formatHeight, formatWeight, kgToUnit, unitToKg } from '../../lib/units.ts';
import { PrivateTag } from './PrivateTag.tsx';
import { ProfileCard } from './ProfileCard.tsx';
import { useProfile } from './use-profile.ts';

interface ProfileScreenProps {
  userId: string;
}

const NUDGE_STEP = { kg: 0.1, lb: 0.2 } as const;

function MenuLink({ to, children }: { to: string; children: string }) {
  return (
    <li>
      <Link className="button" to={to}>
        {children}
        <Icon name="chevron" size={18} />
      </Link>
    </li>
  );
}

export function ProfileScreen({ userId }: ProfileScreenProps) {
  const { state, replace } = useProfile(userId);
  const { unitPref } = usePreferences();
  const [draftKg, setDraftKg] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (state.status === 'failed')
    return (
      <main className="screen">
        <p className="problem" role="alert">
          {state.problem}
        </p>
      </main>
    );
  if (state.status === 'loading')
    return (
      <main className="screen">
        <p>Loading…</p>
      </main>
    );

  const { profile, standing, collectionPercent } = state.bundle;
  const shownKg = draftKg ?? profile.bodyweightKg;
  const age = ageFrom(profile.birthYear);

  const nudge = (direction: 1 | -1) => {
    if (shownKg === null) return;
    const inUnit = kgToUnit(shownKg, unitPref) + direction * NUDGE_STEP[unitPref];
    const nextKg = unitToKg(Math.round(inUnit * 10) / 10, unitPref);
    setDraftKg(Math.min(HIGHEST_BODYWEIGHT_KG, Math.max(LOWEST_BODYWEIGHT_KG, nextKg)));
  };

  const saveNudged = async () => {
    if (draftKg === null) return;
    setSaving(true);
    setProblem(null);
    try {
      await saveBodyweight(userId, draftKg);
      replace({ ...profile, bodyweightKg: draftKg });
      setDraftKg(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not save your bodyweight.');
    }
    setSaving(false);
  };

  const step = `${NUDGE_STEP[unitPref]} ${unitPref}`;

  return (
    <main className="screen stack">
      <h1 className="title">Profile</h1>
      <ProfileCard
        profile={profile}
        totalLevel={standing?.totalLevel ?? null}
        combatLevel={standing?.combatLevel ?? null}
        collectionPercent={collectionPercent}
      />
      <section className="panel stack" aria-labelledby="body-heading">
        <div className="row spread">
          <h2 id="body-heading">Body</h2>
          <PrivateTag />
        </div>
        <div className="well row">
          <div className="stack" style={{ gap: 2, flexGrow: 1 }}>
            <span className="muted tiny">Bodyweight</span>
            <strong className="pixel" style={{ fontSize: '1.6rem', fontWeight: 500 }} data-testid="profile-bodyweight">
              {shownKg === null ? 'Not set' : formatWeight(shownKg, unitPref)}
            </strong>
          </div>
          {shownKg === null ? (
            <Link className="button" to="/profile/edit">
              Set bodyweight
            </Link>
          ) : (
            <>
              <button
                className="button icon"
                type="button"
                aria-label={`Decrease bodyweight by ${step}`}
                onClick={() => nudge(-1)}
              >
                −
              </button>
              <button
                className="button icon"
                type="button"
                aria-label={`Increase bodyweight by ${step}`}
                onClick={() => nudge(1)}
              >
                +
              </button>
            </>
          )}
        </div>
        {draftKg !== null && (
          <div className="row">
            <button className="button primary" type="button" disabled={saving} onClick={saveNudged}>
              Save {formatWeight(draftKg, unitPref)}
            </button>
            <button className="button" type="button" onClick={() => setDraftKg(null)}>
              Cancel
            </button>
          </div>
        )}
        {problem && (
          <p className="problem" role="alert">
            {problem}
          </p>
        )}
        <div className="body-stats">
          <div className="body-stat">
            <span className="muted tiny">Height</span>
            <strong data-testid="profile-height">
              {profile.heightCm === null ? '—' : formatHeight(profile.heightCm, unitPref)}
            </strong>
          </div>
          <div className="body-stat">
            <span className="muted tiny">Age</span>
            <strong data-testid="profile-age">{age === null ? '—' : `about ${age}`}</strong>
          </div>
        </div>
        <span className="hint">
          Bodyweight is the load for pull-ups, dips and push-ups. Height and age never change your XP.
        </span>
      </section>
      <ul className="menu-list">
        <MenuLink to="/profile/edit">Edit profile &amp; body</MenuLink>
        <MenuLink to="/profile/settings">Settings</MenuLink>
        <MenuLink to="/profile/preview">Preview what friends see</MenuLink>
        <MenuLink to="/programs">Programs</MenuLink>
        <MenuLink to="/exercises">Exercises</MenuLink>
      </ul>
    </main>
  );
}
