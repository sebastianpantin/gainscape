import { MAX_LEVEL, xpForLevel } from '@domain/index.ts';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.tsx';
import { ScreenSkeleton } from '../../components/ScreenSkeleton.tsx';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { SkillIcon } from '../../components/PixelArt.tsx';
import { exercisesTrainingSkill } from '../../lib/progress/skill-map-rules.ts';
import { useActiveExercises } from '../../lib/progress/skill-map.ts';
import { useStanding } from '../../lib/progress/standing.ts';
import { formatXp } from '../../lib/format.ts';
import { type Exercise } from '../../lib/exercises/catalog-rules.ts';
import { type LoadedState } from '../../lib/query/query-state-rules.ts';
import { RecoveryPanel } from './RecoveryPanel.tsx';
import { WeeklyVolumePanel } from './WeeklyVolumePanel.tsx';

interface SkillsScreenProps {
  userId: string;
}

function combatCopy(combatWeight: number): string {
  if (combatWeight === 0) return 'does not count toward combat';
  return combatWeight > 1 ? 'counts double toward combat' : 'counts once toward combat';
}

interface SkillExercisesProps {
  skillKey: string;
  skillName: string;
  exercises: LoadedState<Exercise[]>;
}

function SkillExercises({ skillKey, skillName, exercises }: SkillExercisesProps) {
  if (exercises.status === 'loading') return <p role="status">Loading…</p>;
  if (exercises.status === 'failed')
    return (
      <p className="problem" role="alert">
        {exercises.problem}
      </p>
    );
  const entries = exercisesTrainingSkill(exercises.data, skillKey);
  if (entries.length === 0) return <p className="muted">No exercises train {skillName} yet.</p>;
  return (
    <ul aria-label={`Exercises that train ${skillName}`}>
      {entries.map((entry) => (
        <li key={entry.id}>
          {entry.name} {entry.percent}
        </li>
      ))}
    </ul>
  );
}

export function SkillsScreen({ userId }: SkillsScreenProps) {
  const state = useStanding(userId);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const exercises = useActiveExercises(userId, pickedKey !== null);

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
  const picked = standing.skills.find(({ skill }) => skill.key === pickedKey) ?? null;
  const skillName = (key: string) => standing.skills.find(({ skill }) => skill.key === key)?.skill.name ?? key;

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
      </ul>
      <RecoveryPanel userId={userId} nameOf={skillName} />
      <WeeklyVolumePanel userId={userId} nameOf={skillName} />
      <ul className="skill-grid" aria-label="Skill levels">
        {standing.skills.map(({ skill, progress }) => (
          <li key={skill.id}>
            <button
              type="button"
              className="skill-card"
              aria-pressed={pickedKey === skill.key}
              onClick={() => setPickedKey(pickedKey === skill.key ? null : skill.key)}
            >
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
            </button>
          </li>
        ))}
      </ul>
      {picked && (
        <section className="panel stack">
          <div className="stack" aria-live="polite">
            <div className="row spread">
              <h2>{picked.skill.name}</h2>
              <span className="muted">{combatCopy(picked.skill.combatWeight)}</span>
            </div>
            <span>
              {formatXp(picked.progress.xp)} XP
              {picked.progress.nextLevelXp !== null && ` / ${formatXp(picked.progress.nextLevelXp)}`}
            </span>
            <span className="muted">
              Level {MAX_LEVEL} at {formatXp(xpForLevel(MAX_LEVEL))} XP
            </span>
          </div>
          <SkillExercises skillKey={picked.skill.key} skillName={picked.skill.name} exercises={exercises} />
        </section>
      )}
    </main>
  );
}
