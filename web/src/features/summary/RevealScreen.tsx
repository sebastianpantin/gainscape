import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { PersonalRecordSummary } from '@domain/types.ts';
import { type Exercise, fetchBuiltInExercises, fetchSkills, type Skill } from '../../lib/catalog.ts';
import { formatLoad } from '../../lib/format.ts';
import type { SessionSummary } from '@domain/types.ts';
import { recallLastSummary } from './last-summary.ts';

function describeRecord(record: PersonalRecordSummary, exercise: Exercise | undefined): string {
  const name = exercise?.name ?? 'Exercise';
  if (record.kind === 'bodyweight_reps') {
    const previous = record.previousReps === null ? 'first record' : `was ${record.previousReps}`;
    return `${name}: ${record.reps} reps (${previous})`;
  }
  const loadType = exercise?.loadType ?? 'external';
  const previous =
    record.previousLoadKg === null ? 'first record' : `was ${formatLoad(record.previousLoadKg, loadType)}`;
  return `${name}: ${record.reps}RM ${formatLoad(record.loadKg!, loadType)} (${previous})`;
}

export function RevealScreen() {
  const location = useLocation();
  const summary = (location.state as SessionSummary | null) ?? recallLastSummary();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);

  useEffect(() => {
    fetchSkills().then(setSkills, () => setSkills([]));
    fetchBuiltInExercises().then(setExercises, () => setExercises([]));
  }, []);

  if (!summary) {
    return (
      <main className="screen stack">
        <p className="panel">No finished workout to show yet.</p>
        <Link className="button" to="/">
          Back to workout
        </Link>
      </main>
    );
  }

  const nameOf = (skillKey: string) => skills.find((skill) => skill.key === skillKey)?.name ?? skillKey;
  const skillsWithXp = skills.filter((skill) => summary.xpBySkill[skill.key]);

  return (
    <main className="screen stack">
      <h1 className="title">Workout complete!</h1>
      <ul className="panel reveal-list" aria-label="XP gained">
        {skillsWithXp.map((skill) => (
          <li key={skill.key}>
            {skill.name}: <strong>+{summary.xpBySkill[skill.key]} XP</strong>
          </li>
        ))}
      </ul>
      {summary.levelUps.length > 0 && (
        <ul className="panel reveal-list level-ups" aria-label="Level ups">
          {summary.levelUps.map((levelUp) => (
            <li key={levelUp.skill}>
              {nameOf(levelUp.skill)}: {levelUp.from} → {levelUp.to}
            </li>
          ))}
        </ul>
      )}
      {summary.prs.length > 0 && (
        <ul className="panel reveal-list level-ups" aria-label="New records">
          {summary.prs.map((record) => (
            <li key={record.exerciseId}>
              {describeRecord(
                record,
                exercises.find((exercise) => exercise.id === record.exerciseId),
              )}
            </li>
          ))}
        </ul>
      )}
      <Link className="button primary" to="/skills">
        See skills
      </Link>
    </main>
  );
}
