import { levelProgress } from '@domain/index.ts';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.tsx';
import { ScreenProblem } from '../../components/ScreenProblem.tsx';
import { ScreenSkeleton } from '../../components/ScreenSkeleton.tsx';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { ShownNumber } from '../../components/ShownNumber.tsx';
import { SkillIcon } from '../../components/PixelArt.tsx';
import { bodySummaryText } from '../../lib/progress/body-summary-rules.ts';
import { type SkillStanding } from '../../lib/progress/standing-rules.ts';
import { useStanding } from '../../lib/progress/standing.ts';
import { readyData } from '../../lib/query/query-state-rules.ts';
import { formatXp } from '../../lib/format.ts';
import { TermHelp } from '../../components/TermHelp.tsx';
import { skillXpMetric } from '../../lib/ui/last-seen-number-store.ts';
import { useCountUp } from '../../lib/ui/use-count-up.ts';
import { useBodyStatus } from './body-status.ts';

function SkillCard({ userId, skillStanding: { skill, progress } }: { userId: string; skillStanding: SkillStanding }) {
  const shown = levelProgress(useCountUp(userId, skillXpMetric(skill.key), progress.xp).shown);
  return (
    <li>
      <Link className="skill-card" to={`/skills/${skill.key}`}>
        <span className="skill-card-top">
          <span className="row">
            <SkillIcon skillKey={skill.key} />
            <span className="skill-name">{skill.name}</span>
          </span>
          <span className="skill-level">
            <ShownNumber shown={shown.level} value={progress.level} />
          </span>
        </span>
        <ProgressBar
          fraction={progress.fractionToNextLevel}
          shownFraction={shown.fractionToNextLevel}
          label={`${skill.name} progress to next level`}
        />
        <span className="muted tiny">
          {progress.nextLevelXp === null
            ? `${formatXp(progress.xp)} XP`
            : `${formatXp(progress.nextLevelXp - progress.xp)} XP to ${progress.level + 1}`}
        </span>
      </Link>
    </li>
  );
}

function LevelTotals({ userId, totalLevel, combatLevel }: { userId: string; totalLevel: number; combatLevel: number }) {
  const total = useCountUp(userId, 'total-level', totalLevel);
  const combat = useCountUp(userId, 'combat-level', combatLevel);
  return (
    <div className="standing totals">
      <div className="panel">
        <span className="muted row">
          Total level <TermHelp glossaryKey="totalLevel" />
        </span>
        <strong>
          <ShownNumber shown={total.shown} value={totalLevel} />
        </strong>
      </div>
      <div className="panel">
        <span className="muted row">
          Combat level <TermHelp glossaryKey="combatLevel" />
        </span>
        <strong>
          <ShownNumber shown={combat.shown} value={combatLevel} />
        </strong>
      </div>
    </div>
  );
}

interface SkillsScreenProps {
  userId: string;
}

export function SkillsScreen({ userId }: SkillsScreenProps) {
  const state = useStanding(userId);
  const body = useBodyStatus(userId);

  if (state.status === 'failed')
    return <ScreenProblem heading={<h1 className="title">Skills</h1>} problem={state.problem} onRetry={state.retry} />;
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
      <LevelTotals userId={userId} totalLevel={standing.totalLevel} combatLevel={standing.combatLevel} />
      <ul className="menu-list">
        <li>
          <Link className="button" to="/skills/quests">
            Quests
            <Icon name="chevron" size={18} />
          </Link>
        </li>
        <li>
          <Link className="button" to="/skills/body" aria-label={bodySummary ? `Body, ${bodySummary}` : undefined}>
            <span className="menu-label">
              Body
              {bodySummary && <span className="muted tiny">{bodySummary}</span>}
            </span>
            <Icon name="chevron" size={18} />
          </Link>
        </li>
      </ul>
      <ul className="skill-grid" aria-label="Skill levels">
        {standing.skills.map((skillStanding) => (
          <SkillCard key={skillStanding.skill.id} userId={userId} skillStanding={skillStanding} />
        ))}
      </ul>
    </main>
  );
}
