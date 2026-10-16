import { MAX_LEVEL, xpForLevel } from '@domain/index.ts';
import { useId } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { SkillIcon } from '../../components/PixelArt.tsx';
import { ScreenProblem } from '../../components/ScreenProblem.tsx';
import { ScreenSkeleton } from '../../components/ScreenSkeleton.tsx';
import { type Exercise } from '../../lib/exercises/catalog-rules.ts';
import { formatXp } from '../../lib/format.ts';
import { type LoadedState } from '../../lib/query/query-state-rules.ts';
import { isBodySkill } from '../../lib/progress/recovery-rules.ts';
import { exercisesTrainingSkill } from '../../lib/progress/skill-map-rules.ts';
import { useSkillMapExercises } from '../../lib/progress/skill-map.ts';
import { useStanding } from '../../lib/progress/standing.ts';
import { BackToSkills } from './BackToSkills.tsx';
import { MuscleStatus } from './MuscleStatus.tsx';

interface SkillScreenProps {
  userId: string;
}

function combatCopy(combatWeight: number): string {
  if (combatWeight === 0) return 'Does not count toward combat';
  return combatWeight > 1 ? 'Counts double toward combat' : 'Counts once toward combat';
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

export function SkillScreen({ userId }: SkillScreenProps) {
  const { skillKey = '' } = useParams();
  const state = useStanding(userId);
  const exercises = useSkillMapExercises(userId);
  const exercisesHeadingId = useId();

  if (state.status === 'failed')
    return (
      <ScreenProblem
        heading={
          <div className="stack" style={{ gap: 4 }}>
            <BackToSkills />
            <h1 className="title">Skill</h1>
          </div>
        }
        problem={state.problem}
        onRetry={state.retry}
      />
    );
  if (state.status === 'loading') return <ScreenSkeleton panels={2} />;

  const picked = state.standing.skills.find(({ skill }) => skill.key === skillKey);
  if (!picked)
    return (
      <main className="screen stack">
        <section className="panel stack">
          <h1 className="title">Skill not found</h1>
          <p className="muted">There is no skill at this address.</p>
          <Link className="button" to="/skills">
            Back to skills
          </Link>
        </section>
      </main>
    );

  const { skill, progress } = picked;
  return (
    <main className="screen stack">
      <div className="stack" style={{ gap: 4 }}>
        <BackToSkills />
        <h1 className="title">{skill.name}</h1>
      </div>
      {state.notice && (
        <p className="notice" role="status">
          {state.notice}
        </p>
      )}
      <section className="panel stack" aria-label={`${skill.name} level`}>
        <div className="row spread">
          <span className="row">
            <SkillIcon skillKey={skill.key} />
            <span className="muted">Level</span>
          </span>
          <span className="skill-level">{progress.level}</span>
        </div>
        <ProgressBar fraction={progress.fractionToNextLevel} label={`${skill.name} progress to next level`} />
        <span>
          {formatXp(progress.xp)} XP
          {progress.nextLevelXp !== null && ` / ${formatXp(progress.nextLevelXp)}`}
        </span>
        <span className="muted">{combatCopy(skill.combatWeight)}</span>
        <span className="muted">
          Level {MAX_LEVEL} at {formatXp(xpForLevel(MAX_LEVEL))} XP
        </span>
      </section>
      {isBodySkill(skill.key) && <MuscleStatus userId={userId} skill={skill.key} name={skill.name} />}
      <section className="panel stack" aria-labelledby={exercisesHeadingId}>
        <h2 id={exercisesHeadingId}>Exercises</h2>
        <SkillExercises skillKey={skill.key} skillName={skill.name} exercises={exercises} />
      </section>
    </main>
  );
}
