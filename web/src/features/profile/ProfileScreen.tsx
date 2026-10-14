import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.tsx';
import { ScreenSkeleton } from '../../components/ScreenSkeleton.tsx';
import { announceDataChange } from '../../lib/query/data-changes.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { ageFrom, BODYWEIGHT_NUDGE_STEP, nudgedBodyweightKg, updatePrivateProfile } from '../../lib/profile/profile.ts';
import { collectionPercentQuery, questPointsQuery } from '../../lib/query/queries.ts';
import { useStanding } from '../../lib/progress/standing.ts';
import { useIsOffline } from '../../lib/platform/use-online.ts';
import { formatHeight, formatWeight } from '../../lib/units.ts';
import { BodyweightTrend } from './BodyweightTrend.tsx';
import { LoadoutPanel } from './LoadoutPanel.tsx';
import { PrivateTag } from './PrivateTag.tsx';
import { ProfileCard } from './ProfileCard.tsx';
import { useProfile } from './use-profile.ts';
import { messageOf } from '../../lib/error-text.ts';

interface ProfileScreenProps {
  userId: string;
}

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
  const standing = useStanding(userId);
  const collection = useQuery(collectionPercentQuery(userId));
  const questPoints = useQuery(questPointsQuery(userId));
  const { unitPref } = usePreferences();
  const queryClient = useQueryClient();
  const [draftKg, setDraftKg] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const offline = useIsOffline();

  if (state.status === 'failed')
    return (
      <main className="screen">
        <p className="problem" role="alert">
          {state.problem}
        </p>
      </main>
    );
  if (state.status === 'loading') return <ScreenSkeleton title="Profile" />;

  const { profile } = state;
  const levels = standing.status === 'ready' ? standing.standing : null;
  const shownKg = draftKg ?? profile.bodyweightKg;
  const age = ageFrom(profile.birthYear);

  const nudge = (direction: 1 | -1) => {
    if (shownKg === null) return;
    setDraftKg(nudgedBodyweightKg(shownKg, direction, unitPref));
  };

  const saveNudged = async () => {
    if (draftKg === null) return;
    setSaving(true);
    setProblem(null);
    try {
      await updatePrivateProfile(userId, { bodyweightKg: draftKg });
      replace((current) => ({ ...current, bodyweightKg: draftKg }));
      setDraftKg(null);
      void announceDataChange(queryClient, 'profile-saved');
    } catch (error) {
      setProblem(messageOf(error, 'Could not save your bodyweight.'));
    }
    setSaving(false);
  };

  const step = `${BODYWEIGHT_NUDGE_STEP[unitPref]} ${unitPref}`;

  return (
    <main className="screen stack">
      <h1 className="title">Profile</h1>
      {state.notice && (
        <p className="notice" role="status">
          {state.notice}
        </p>
      )}
      <ProfileCard
        profile={profile}
        totalLevel={levels?.totalLevel ?? null}
        combatLevel={levels?.combatLevel ?? null}
        collectionPercent={collection.data ?? null}
        questPoints={questPoints.data ?? null}
      />
      <LoadoutPanel userId={userId} />
      <section className="panel stack" aria-labelledby="body-heading">
        <div className="row spread">
          <h2 id="body-heading">Body</h2>
          <PrivateTag />
        </div>
        <div className="well row">
          <dl className="stack" style={{ gap: 2, flexGrow: 1 }}>
            <dt className="muted tiny">Bodyweight</dt>
            <dd className="pixel" style={{ fontSize: '1.6rem', fontWeight: 500 }}>
              {shownKg === null ? 'Not set' : formatWeight(shownKg, unitPref)}
            </dd>
          </dl>
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
            <button className="button primary" type="button" disabled={saving || offline} onClick={saveNudged}>
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
        <dl className="body-stats">
          <div className="body-stat">
            <dt className="muted tiny">Height</dt>
            <dd>{profile.heightCm === null ? '—' : formatHeight(profile.heightCm, unitPref)}</dd>
          </div>
          <div className="body-stat">
            <dt className="muted tiny">Age</dt>
            <dd>{age === null ? '—' : `about ${age}`}</dd>
          </div>
        </dl>
        <span className="hint">
          Bodyweight is the load for pull-ups, dips and push-ups. Height and age never change your XP.
        </span>
      </section>
      <section className="panel stack" aria-labelledby="trend-heading">
        <div className="row spread">
          <h2 id="trend-heading">Bodyweight trend</h2>
          <PrivateTag />
        </div>
        <BodyweightTrend userId={userId} unit={unitPref} />
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
