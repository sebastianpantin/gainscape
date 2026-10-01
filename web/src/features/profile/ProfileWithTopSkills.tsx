import type { Skill } from '../../lib/catalog.ts';
import { cardProfileOf, standingOfView } from '../../lib/profile-view.ts';
import type { ProfileView } from '../../lib/social.ts';
import { collectionPercent } from '../../lib/social-rules.ts';
import { monogramFor } from '../../lib/standing.ts';
import { ProfileCard } from './ProfileCard.tsx';

const TOP_SKILL_COUNT = 3;

interface ProfileWithTopSkillsProps {
  skills: Skill[];
  profile: ProfileView;
  headingId: string;
}

export function ProfileWithTopSkills({ skills, profile, headingId }: ProfileWithTopSkillsProps) {
  const standing = standingOfView(skills, profile);
  const topSkills = [...standing.skills].sort((a, b) => b.progress.xp - a.progress.xp).slice(0, TOP_SKILL_COUNT);
  return (
    <>
      <ProfileCard
        profile={cardProfileOf(profile)}
        totalLevel={standing.totalLevel}
        combatLevel={standing.combatLevel}
        collectionPercent={collectionPercent(profile.collection.filledSlots, profile.collection.totalSlots)}
      />
      <section className="panel stack" aria-labelledby={headingId}>
        <h2 id={headingId}>Top skills</h2>
        <ul className="menu-list">
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
    </>
  );
}
