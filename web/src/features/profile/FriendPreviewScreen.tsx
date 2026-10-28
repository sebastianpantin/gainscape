import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ProblemWithRetry } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { Switch } from '../../components/Switch.tsx';
import type { Skill } from '../../lib/exercises/catalog-rules.ts';
import { formatLoad } from '../../lib/format.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { type Profile, updatePublicProfile } from '../../lib/profile/profile.ts';
import { formatWeight } from '../../lib/units.ts';
import { profilePreviewQuery } from '../../lib/query/queries.ts';
import { loadedState } from '../../lib/query/query-state-rules.ts';
import { type ProfileView } from '../../lib/social/social.ts';
import { LoadoutPanel } from './LoadoutPanel.tsx';
import { ProfileWithTopSkills } from './ProfileWithTopSkills.tsx';
import { useOptimisticProfileSave } from './use-optimistic-profile-save.ts';
import { type ProfileUpdate, useProfile } from './use-profile.ts';

interface FriendPreviewScreenProps {
  userId: string;
}

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
  const { state, replace, refresh } = useProfile(userId);
  const preview = useQuery(profilePreviewQuery(userId));
  const view = loadedState(preview.data, preview.isFetching ? null : preview.error);
  const problem = state.status === 'failed' ? state.problem : view.status === 'failed' ? view.problem : null;

  return (
    <main className="screen stack">
      <div className="stack" style={{ gap: 'var(--space-1)' }}>
        <Link className="back-link" to="/profile">
          ‹ Profile
        </Link>
        <h1 className="title">What friends see</h1>
      </div>
      {(state.status === 'loading' || (state.status === 'ready' && view.status === 'loading')) && <ListSkeleton />}
      {problem !== null && (
        <ProblemWithRetry
          problem={problem}
          onRetry={() =>
            Promise.all([state.status === 'failed' && refresh(), view.status === 'failed' && preview.refetch()])
          }
        />
      )}
      {state.status === 'ready' && view.status === 'ready' && (
        <PreviewOfProfile userId={userId} profile={state.profile} replace={replace} view={view.data} />
      )}
    </main>
  );
}
