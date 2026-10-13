import { describeBout } from '../../lib/workout/cardio-rules.ts';
import { effortLabel } from '../../lib/workout/effort-labels.ts';
import { exerciseKeys } from '../../lib/exercises/exercise-key-rules.ts';
import { formatLoad, formatXp } from '../../lib/format.ts';
import { type UnitPref } from '../../lib/profile/profile.ts';
import { distanceUnitFor } from '../../lib/units.ts';
import { ExerciseProgressLink } from '../collection/ExerciseProgressLink.tsx';
import { describeHold, type SessionEdit } from './session-edit.ts';

interface StoredExerciseListProps {
  exercises: SessionEdit['exercises'];
  storedXp: ReadonlyMap<string, number>;
  unit: UnitPref;
}

export function StoredExerciseList({ exercises, storedXp, unit }: StoredExerciseListProps) {
  const storedKeys = exerciseKeys(exercises);
  return exercises.map((exercise, exerciseIndex) => (
    <section className="panel stack exercise-card" key={storedKeys[exerciseIndex]}>
      <header>
        <h2>{exercise.name}</h2>
        {exercise.modality === 'lift' && (
          <ExerciseProgressLink exerciseId={exercise.exerciseId} exerciseName={exercise.name} />
        )}
      </header>
      <ol className="stored-set-list">
        {exercise.modality === 'cardio'
          ? exercise.sets.map((bout, boutIndex) => (
              <li className="row spread" key={bout.id}>
                <span>
                  {boutIndex + 1}. {describeBout(bout, distanceUnitFor(unit, exercise.paceUnit))}
                  {effortLabel(bout.effort) && ` · ${effortLabel(bout.effort)}`}
                </span>
                <span className="xp-text">{formatXp(storedXp.get(bout.id) ?? 0)} XP</span>
              </li>
            ))
          : exercise.modality === 'hold'
            ? exercise.sets.map((set, setIndex) => (
                <li className="row spread" key={set.id}>
                  <span>
                    {setIndex + 1}. {describeHold(set, exercise.loadType, unit)}
                    {effortLabel(set.effort) && ` · ${effortLabel(set.effort)}`}
                  </span>
                  <span className="xp-text">{formatXp(storedXp.get(set.id) ?? 0)} XP</span>
                </li>
              ))
            : exercise.sets.map((set, setIndex) => (
                <li className="row spread" key={set.id}>
                  <span>
                    {setIndex + 1}.{' '}
                    {exercise.loadType === 'bodyweight'
                      ? 'bodyweight'
                      : formatLoad(set.weightKg, exercise.loadType, unit)}{' '}
                    × {set.reps}
                    {set.isWarmup && ' · warm-up'}
                    {effortLabel(set.effort) && ` · ${effortLabel(set.effort)}`}
                  </span>
                  <span className="xp-text">{formatXp(storedXp.get(set.id) ?? 0)} XP</span>
                </li>
              ))}
      </ol>
    </section>
  ));
}
