import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.tsx';
import { ScreenSkeleton } from '../../components/ScreenSkeleton.tsx';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { SkillIcon } from '../../components/PixelArt.tsx';
import { bodySummaryText } from '../../lib/progress/body-summary-rules.ts';
import { useStanding } from '../../lib/progress/standing.ts';
import { readyData } from '../../lib/query/query-state-rules.ts';
import { formatXp } from '../../lib/format.ts';
import { useBodyStatus } from './body-status.ts';

interface SkillsScreenProps {
  userId: string;
}

export function SkillsScreen({ userId }: SkillsScreenProps) {
  const state = useStanding(userId);
  const body = useBodyStatus(userId);

  if (state.status === 'failed')
    return (
      <main className="screen">
        <p className="problem" role="alert">
          {state.problem}
        </p>
      </main>
    );
  if (state.status === 'loading') return <ScreenSkeleton title="Skills" panels={0} tiles={6} />;

  const { standing } = state;
  const bodySummary = bodySummaryText(readyData(body.recovery), readyData(body.volume));

  return (
    <main className="screen stack">
      <h1 className="title">Skills</h1>
      {state.notice && (
        <p className="notice" role="status">
          {state.notice}
        </p>
      )}
      <div className="standing totals">
        <div className="panel">
          <span className="muted">Total level</span>
          <strong>{standing.totalLevel}</strong>
        </div>
        <div className="panel">
          <span className="muted">Combat level</span>
          <strong>{standing.combatLevel}</strong>
        </div>
      </div>
      <ul className="menu-list">
        <li>
          <Link className="button" to="/skills/quests">
            Quests
            <Icon name="chevron" size={18} />
          </Link>
        </li>
        <li>
          <Link className="button" to="/skills/body">
            <span className="menu-label">
              Body
              {bodySummary && <span className="muted tiny">{bodySummary}</span>}
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        </li>
      </ul>
      <ul className="skill-grid" aria-label="Skill levels">
        {standing.skills.map(({ skill, progress }) => (
          <li key={skill.id}>
            <Link className="skill-card" to={`/skills/${skill.key}`}>
              <span className="skill-card-top">
                <span className="row">
                  <SkillIcon skillKey={skill.key} />
                  <span className="skill-name">{skill.name}</span>
                </span>
                <span className="skill-level">{progress.level}</span>
              </span>
              <ProgressBar fraction={progress.fractionToNextLevel} label={`${skill.name} progress to next level`} />
              <span className="muted tiny">
                {progress.nextLevelXp === null
                  ? `${formatXp(progress.xp)} XP`
                  : `${formatXp(progress.nextLevelXp - progress.xp)} XP to ${progress.level + 1}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
