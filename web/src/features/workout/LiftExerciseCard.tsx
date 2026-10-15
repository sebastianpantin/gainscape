import { roomForSets } from '../../lib/workout/exercise-edit-rules.ts';
import { type LiftDraftExercise } from '../../offline/draft-format.ts';
import {
  addSet,
  addWarmupSets,
  canQuickFill,
  fillWorkingSets,
  firstWorkingSet,
  mostQuickFillSets,
} from '../../offline/draft-edits.ts';
import { isBarbellLift, warmupsToOffer } from './exercise-card-rules.ts';
import { type LiftCardContext } from './lift-card-context.ts';
import { LiftExerciseIntro } from './LiftExerciseIntro.tsx';
import { LiftSetRow } from './LiftSetRow.tsx';
import { QuickFill } from './QuickFill.tsx';

const DEFAULT_QUICK_FILL_SETS = 3;
const DEFAULT_QUICK_FILL_REPS = 8;

interface LiftExerciseCardProps {
  exercise: LiftDraftExercise;
  exerciseIndex: number;
  lift: LiftCardContext;
}

export function LiftExerciseCard({ exercise, exerciseIndex, lift }: LiftExerciseCardProps) {
  const { draft, actions } = lift;
  const workingSet = firstWorkingSet(exercise);
  const barbell = isBarbellLift(exercise, lift.equipment) ? lift.barbellSetup : null;
  const warmups = warmupsToOffer(exercise, lift.unit, barbell, roomForSets(draft));
  const quickFillSets = mostQuickFillSets(draft, exerciseIndex);
  const defaultSets = exercise.target?.sets ?? DEFAULT_QUICK_FILL_SETS;
  const defaultReps = workingSet?.reps ?? DEFAULT_QUICK_FILL_REPS;
  return (
    <section className="panel stack exercise-card">
      <LiftExerciseIntro exercise={exercise} exerciseIndex={exerciseIndex} lift={lift} />
      {warmups.length > 0 && (
        <button
          className="button dashed"
          type="button"
          onClick={() => actions.changeDraft(addWarmupSets(draft, exerciseIndex, warmups))}
        >
          + Add warm-ups
        </button>
      )}
      <ol className="set-list">
        {exercise.sets.map((set, setIndex) => (
          <LiftSetRow
            key={set.id}
            exercise={exercise}
            exerciseIndex={exerciseIndex}
            set={set}
            setIndex={setIndex}
            lift={lift}
          />
        ))}
      </ol>
      <button
        ref={actions.focusTarget(exercise.clientId)}
        className="button dashed"
        type="button"
        disabled={!lift.roomForSet}
        onClick={() => actions.changeDraft(addSet(draft, exerciseIndex))}
      >
        + Add set
      </button>
      {canQuickFill(exercise) && quickFillSets > 0 && (
        <QuickFill
          key={`${defaultSets}x${defaultReps}`}
          defaultSets={defaultSets}
          mostSets={quickFillSets}
          defaultReps={defaultReps}
          onFill={(sets, reps) => actions.changeDraft(fillWorkingSets(draft, exerciseIndex, sets, reps))}
        />
      )}
    </section>
  );
}
