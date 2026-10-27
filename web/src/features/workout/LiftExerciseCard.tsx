import { useState } from 'react';
import { roomForSets } from '../../lib/workout/exercise-edit-rules.ts';
import { type LiftDraftExercise } from '../../offline/draft-format.ts';
import {
  addSet,
  canQuickFill,
  fillWorkingSets,
  firstWorkingSet,
  mostQuickFillSets,
} from '../../offline/draft-edits.ts';
import { AddSetButton } from './AddSetButton.tsx';
import {
  isBarbellLift,
  routineToOffer,
  warmupButtonKey,
  warmupButtonLabel,
  type WarmupChoice,
  warmupChoices,
  warmupFocusAfter,
  warmupsToOffer,
  withChosenWarmup,
} from './exercise-card-rules.ts';
import { type LiftCardContext } from './lift-card-context.ts';
import { LiftExerciseIntro } from './LiftExerciseIntro.tsx';
import { backoffSuggestion } from '../../lib/workout/backoff-rules.ts';
import { LiftSetRow } from './LiftSetRow.tsx';
import { QuickFill } from './QuickFill.tsx';
import { WarmupChoiceDialog } from './WarmupChoiceDialog.tsx';

const DEFAULT_QUICK_FILL_SETS = 3;
const DEFAULT_QUICK_FILL_REPS = 8;

interface LiftExerciseCardProps {
  exercise: LiftDraftExercise;
  exerciseIndex: number;
  lift: LiftCardContext;
}

export function LiftExerciseCard({ exercise, exerciseIndex, lift }: LiftExerciseCardProps) {
  const { draft, actions } = lift;
  const backoff = backoffSuggestion(exercise, lift.unit);
  const workingSet = firstWorkingSet(exercise);
  const barbell = isBarbellLift(exercise, lift.equipment) ? lift.barbellSetup : null;
  const warmups = warmupsToOffer(exercise, lift.unit, barbell, roomForSets(draft));
  const routine = routineToOffer(draft, exerciseIndex, lift.catalog);
  const choices = warmupChoices(warmups.length, routine, roomForSets(draft));
  const [choosingWarmup, setChoosingWarmup] = useState(false);
  const quickFillSets = mostQuickFillSets(draft, exerciseIndex);
  const defaultSets = exercise.target?.sets ?? DEFAULT_QUICK_FILL_SETS;
  const defaultReps = workingSet?.reps ?? DEFAULT_QUICK_FILL_REPS;
  const addWarmup = (choice: WarmupChoice) => {
    const next = withChosenWarmup(draft, exerciseIndex, choice, warmups, routine);
    actions.focusAfterNextChange(warmupFocusAfter(draft, next, exerciseIndex));
    actions.changeDraft(next);
  };
  return (
    <section className="panel stack exercise-card">
      <LiftExerciseIntro exercise={exercise} exerciseIndex={exerciseIndex} lift={lift} />
      {choices.length > 0 && (
        <button
          ref={actions.focusTarget(warmupButtonKey(exercise.clientId))}
          className="button dashed"
          type="button"
          onClick={() => (choices.length === 1 ? addWarmup(choices[0]) : setChoosingWarmup(true))}
        >
          {warmupButtonLabel(choices, routine)}
        </button>
      )}
      {choosingWarmup && routine && (
        <WarmupChoiceDialog
          liftName={exercise.name}
          choices={choices}
          rampSetCount={warmups.length}
          routine={routine}
          onChoose={(choice) => {
            setChoosingWarmup(false);
            addWarmup(choice);
          }}
          onCancel={() => setChoosingWarmup(false)}
        />
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
            backoff={backoff}
          />
        ))}
      </ol>
      <AddSetButton
        buttonRef={actions.focusTarget(exercise.clientId)}
        roomForSet={lift.roomForSet}
        onAdd={() => actions.changeDraft(addSet(draft, exerciseIndex))}
      />
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
