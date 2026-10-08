import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Switch } from '../../components/Switch.tsx';
import { fetchSkills } from '../../lib/catalog.ts';
import type { Skill } from '../../lib/catalog-rules.ts';
import { formatLoad } from '../../lib/format.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { type Profile, updatePublicProfile } from '../../lib/profile.ts';
import { formatWeight } from '../../lib/units.ts';
import { fetchProfileView, type ProfileView } from '../../lib/social.ts';
import { LoadoutPanel } from './LoadoutPanel.tsx';
import { ProfileWithTopSkills } from './ProfileWithTopSkills.tsx';
import { useOptimisticProfileSave } from './use-optimistic-profile-save.ts';
import { type ProfileUpdate, useProfile } from './use-profile.ts';

interface FriendPreviewScreenProps {
  userId: string;
}

type ViewState =
  | { status: 'loading' }
  | { status: 'failed'; problem: string }
  | { status: 'ready'; skills: Skill[]; profile: ProfileView };

interface PreviewOfProfileProps {
  userId: string;
  profile: Profile;
  replace: (update: ProfileUpdate) => void;
  view: { skills: Skill[]; profile: ProfileView };
}

function PreviewOfProfile({ userId, profile, replace, view }: PreviewOfProfileProps) {
  const { unitPref } = usePreferences();
  const { save, pending, problem } = useOptimisticProfileSave<'showWeights'>(profile, replace, (changes) =>
    updatePublicProfile(userId, changes),
  );
  return (
    <>
      <div className="sample-note">
        <Switch
          label="Show my weights"
          checked={profile.showWeights}
          disabled={pending}
          onChange={(showWeights) => save({ showWeights })}
        />
      </div>
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <ProfileWithTopSkills skills={view.skills} profile={view.profile} headingId="top-skills-heading" />
      <LoadoutPanel userId={userId} />
      <section className="panel stack" aria-labelledby="record-heading">
        <h2 id="record-heading">How your records appear</h2>
        <span className="pixel">
          {profile.showWeights ? `New 8RM Back Squat: ${formatWeight(110, unitPref)}` : 'New 8RM Back Squat'}
        </span>
        {!profile.showWeights && <span className="muted tiny">Weights hidden by {profile.username}</span>}
        <span className="pixel">
          {!profile.showWeights
            ? 'New 5RM Weighted Dip'
            : profile.showBodyweight
              ? `New 5RM Weighted Dip: ${formatLoad(20, 'bodyweight_plus', unitPref)} (${formatWeight(100, unitPref)} total)`
              : `New 5RM Weighted Dip: ${formatLoad(20, 'bodyweight_plus', unitPref)}`}
        </span>
        <span className="hint">An example. Your height, age and bodyweight entries are never shown to friends.</span>
      </section>
    </>
  );
}

export function FriendPreviewScreen({ userId }: FriendPreviewScreenProps) {
  const { state, replace } = useProfile(userId);
  const [view, setView] = useState<ViewState>({ status: 'loading' });
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([fetchSkills(), fetchProfileView(userId)]).then(
      ([skills, profile]) =>
        active &&
        setView(
          profile
            ? { status: 'ready', skills, profile }
            : { status: 'failed', problem: 'Your profile could not be loaded.' },
        ),
      (error: Error) => active && setView({ status: 'failed', problem: error.message }),
    );
    return () => {
      active = false;
    };
  }, [userId, reloadNonce]);

  const retryView = () => {
    setView({ status: 'loading' });
    setReloadNonce((nonce) => nonce + 1);
  };

  return (
    <main className="screen stack">
      <div className="stack" style={{ gap: 4 }}>
        <Link className="back-link" to="/profile">
          ‹ Profile
        </Link>
        <h1 className="title">What friends see</h1>
      </div>
      {(state.status === 'loading' || (state.status === 'ready' && view.status === 'loading')) && <p>Loading…</p>}
      {state.status === 'failed' && (
        <p className="problem" role="alert">
          {state.problem}
        </p>
      )}
      {view.status === 'failed' && (
        <section className="panel stack">
          <p className="problem" role="alert">
            {view.problem}
          </p>
          <button className="button" type="button" onClick={retryView}>
            Retry
          </button>
        </section>
      )}
      {state.status === 'ready' && view.status === 'ready' && (
        <PreviewOfProfile userId={userId} profile={state.profile} replace={replace} view={view} />
      )}
    </main>
  );
}
