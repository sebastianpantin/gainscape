import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Switch } from '../../components/Switch.tsx';
import { fetchSkills, type Skill } from '../../lib/catalog.ts';
import { formatLoad } from '../../lib/format.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { updatePublicProfile } from '../../lib/profile.ts';
import { formatWeight } from '../../lib/units.ts';
import { cardProfileOf, standingOfView } from '../../lib/profile-view.ts';
import { fetchProfileView, type ProfileView } from '../../lib/social.ts';
import { collectionPercent } from '../../lib/social-rules.ts';
import { monogramFor } from '../../lib/standing.ts';
import { ProfileCard } from './ProfileCard.tsx';
import { useProfile } from './use-profile.ts';

interface FriendPreviewScreenProps {
  userId: string;
}

const TOP_SKILL_COUNT = 3;

export function FriendPreviewScreen({ userId }: FriendPreviewScreenProps) {
  const { state, replace } = useProfile(userId);
  const { unitPref } = usePreferences();
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [view, setView] = useState<{ skills: Skill[]; profile: ProfileView } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([fetchSkills(), fetchProfileView(userId)]).then(
      ([skills, profile]) => active && profile && setView({ skills, profile }),
      (error: Error) => active && setProblem(error.message),
    );
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <main className="screen stack">
      <div className="stack" style={{ gap: 4 }}>
        <Link className="back-link" to="/profile">
          ‹ Profile
        </Link>
        <h1 className="title">What friends see</h1>
      </div>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'failed' && (
        <p className="problem" role="alert">
          {state.problem}
        </p>
      )}
      {state.status === 'ready' &&
        view &&
        (() => {
          const { profile } = state.bundle;
          const standing = standingOfView(view.skills, view.profile);
          const topSkills = [...standing.skills]
            .sort((a, b) => b.progress.xp - a.progress.xp)
            .slice(0, TOP_SKILL_COUNT);
          const toggleWeights = async (showWeights: boolean) => {
            setProblem(null);
            setPending(true);
            replace((current) => ({ ...current, showWeights }));
            try {
              await updatePublicProfile(userId, { showWeights });
            } catch (error) {
              replace((current) => ({ ...current, showWeights: !showWeights }));
              setProblem(error instanceof Error ? error.message : 'Could not save that setting.');
            }
            setPending(false);
          };
          return (
            <>
              <div className="sample-note">
                <Switch
                  label="Show my weights"
                  checked={profile.showWeights}
                  disabled={pending}
                  onChange={toggleWeights}
                />
              </div>
              {problem && (
                <p className="problem" role="alert">
                  {problem}
                </p>
              )}
              <ProfileCard
                profile={cardProfileOf(view.profile)}
                totalLevel={standing.totalLevel}
                combatLevel={standing.combatLevel}
                collectionPercent={collectionPercent(
                  view.profile.collection.filledSlots,
                  view.profile.collection.totalSlots,
                )}
              />
              <section className="panel stack" aria-labelledby="top-skills-heading">
                <h2 id="top-skills-heading">Top skills</h2>
                <ul className="menu-list" style={{ gap: 8 }}>
                  {topSkills.map(({ skill, progress }) => (
                    <li className="row" key={skill.id}>
                      <span className="monogram" aria-hidden="true">
                        {monogramFor(skill.key)}
                      </span>
                      <span style={{ flexGrow: 1 }}>{skill.name}</span>
                      <span className="skill-level">{progress.level}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="panel stack" aria-labelledby="record-heading">
                <h2 id="record-heading">How your records appear</h2>
                <span className="pixel" data-testid="preview-record">
                  {profile.showWeights ? `New 8RM Back Squat: ${formatWeight(110, unitPref)}` : 'New 8RM Back Squat'}
                </span>
                <span className="pixel" data-testid="preview-bodyweight-record">
                  {!profile.showWeights
                    ? 'New 5RM Weighted Dip'
                    : profile.showBodyweight
                      ? `New 5RM Weighted Dip: ${formatLoad(20, 'bodyweight_plus', unitPref)} (${formatWeight(100, unitPref)} total)`
                      : `New 5RM Weighted Dip: ${formatLoad(20, 'bodyweight_plus', unitPref)}`}
                </span>
                <span className="hint">
                  An example. Your height, age and bodyweight entries are never shown to friends.
                </span>
              </section>
            </>
          );
        })()}
    </main>
  );
}
