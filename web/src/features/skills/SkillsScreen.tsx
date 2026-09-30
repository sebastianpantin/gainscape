import { combatLevel, levelProgress, totalLevel } from '@domain/index.ts';
import { useEffect, useState } from 'react';
import { ProgressBar } from '../../components/ProgressBar.tsx';
import { fetchSkills, fetchSkillXp, type Skill } from '../../lib/catalog.ts';

interface SkillsScreenProps {
  userId: string;
}

interface SkillStanding {
  skill: Skill;
  progress: ReturnType<typeof levelProgress>;
}

export function SkillsScreen({ userId }: SkillsScreenProps) {
  const [standings, setStandings] = useState<SkillStanding[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchSkills(), fetchSkillXp(userId)]).then(
      ([skills, xpBySkillId]) =>
        setStandings(skills.map((skill) => ({ skill, progress: levelProgress(xpBySkillId.get(skill.id) ?? 0) }))),
      (error: Error) => setProblem(error.message),
    );
  }, [userId]);

  if (problem)
    return (
      <main className="screen">
        <p className="problem" role="alert">
          {problem}
        </p>
      </main>
    );
  if (!standings)
    return (
      <main className="screen">
        <p>Loading…</p>
      </main>
    );

  const levels = standings.map((standing) => standing.progress.level);
  const combat = combatLevel(
    standings.map((standing) => ({ level: standing.progress.level, weight: standing.skill.combatWeight })),
  );

  return (
    <main className="screen stack">
      <h1 className="title">Skills</h1>
      <div className="panel row spread totals">
        <span>
          Total level <strong data-testid="total-level">{totalLevel(levels)}</strong>
        </span>
        <span>
          Combat <strong data-testid="combat-level">{combat}</strong>
        </span>
      </div>
      <ul className="skill-grid">
        {standings.map(({ skill, progress }) => (
          <li className="panel skill-card" key={skill.id} data-testid={`skill-${skill.key}`}>
            <div className="row spread">
              <span className="skill-name">{skill.name}</span>
              <span className="skill-level">{progress.level}</span>
            </div>
            <ProgressBar fraction={progress.fractionToNextLevel} label={`${skill.name} progress to next level`} />
            <span className="muted">
              {progress.xp.toLocaleString()} XP
              {progress.nextLevelXp !== null && ` / ${progress.nextLevelXp.toLocaleString()}`}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
