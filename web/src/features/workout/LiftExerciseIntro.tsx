import { lastTimeText } from '../../lib/history/last-session-rules.ts';
import { type LiftDraftExercise } from '../../offline/draft-format.ts';
import { canSwapExercise } from '../../offline/draft-edits.ts';
import { ExerciseProgressLink } from '../collection/ExerciseProgressLink.tsx';
import { isBarbellLift, liftAdvice, liftDetailsText } from './exercise-card-rules.ts';
import { ExerciseMenu } from './ExerciseMenu.tsx';
import { ExercisePicker } from './ExercisePicker.tsx';
import { type LiftCardContext } from './lift-card-context.ts';
import { swapSuggestions } from './workout-screen-rules.ts';

interface LiftExerciseIntroProps {
  exercise: LiftDraftExercise;
  exerciseIndex: number;
  lift: LiftCardContext;
}

export function LiftExerciseIntro({ exercise, exerciseIndex, lift }: LiftExerciseIntroProps) {
  const { draft, unit, equipment, swap } = lift;
  const restS = lift.rest.lengthFor(exercise.exerciseId, equipment.compoundIds.has(exercise.exerciseId));
  const details = liftDetailsText(exercise, lift.strength?.get(exercise.exerciseId), restS, unit);
  const recent = lift.recentSessions.get(exercise.exerciseId);
  const lastTime = lastTimeText(recent?.[0], exercise.loadType, unit);
  const barbell = isBarbellLift(exercise, equipment) ? lift.barbellSetup : null;
  const advice = liftAdvice(exercise, recent, unit, barbell);
  return (
    <>
      <header>
        <h2>{exercise.name}</h2>
        <span className="row">
          <ExerciseProgressLink exerciseId={exercise.exerciseId} exerciseName={exercise.name} />
          <ExerciseMenu exerciseName={exercise.name} actions={lift.menuActions(exerciseIndex)} />
        </span>
      </header>
      <p className="muted">{details}</p>
      {lastTime && <p className="muted tiny last-time">{lastTime}</p>}
      {advice && <p className="tiny progression-advice">{advice}</p>}
      {lift.note(exercise.exerciseId, exercise.name)}
      {swap.openKey === exercise.clientId && canSwapExercise(draft, exerciseIndex) && (
        <ExercisePicker
          exercises={swap.lifts}
          suggestions={swapSuggestions(exercise.exerciseId, swap.lifts)}
          placeholder="Swap for…"
          onPick={(replacement) => swap.swapTo(exerciseIndex, replacement)}
        />
      )}
    </>
  );
}
