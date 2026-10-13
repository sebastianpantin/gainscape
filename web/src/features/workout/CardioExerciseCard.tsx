import { type ReactNode } from 'react';
import { BOUTS_FULL_TEXT } from '../../lib/cardio-rules.ts';
import { updateBout } from '../../lib/exercise-edit-rules.ts';
import { type UnitPref } from '../../lib/profile.ts';
import { addSet, type CardioDraftExercise, toggleSetDone, type WorkoutDraft } from '../../offline/draft-format.ts';
import { CardioSetRow } from './CardioSetRow.tsx';
import { type ExerciseCardActions } from './exercise-card-actions.ts';
import { feedbackLabel } from './set-feedback-rules.ts';
import { type SetPreview } from './xp-preview.ts';

interface CardioExerciseCardProps {
  draft: WorkoutDraft;
  exercise: CardioDraftExercise;
  exerciseIndex: number;
  cardKey: string;
  previews: SetPreview[];
  unit: UnitPref;
  note: ReactNode;
  roomForBout: boolean;
  roomForSet: boolean;
  actions: ExerciseCardActions;
}

export function CardioExerciseCard({
  draft,
  exercise,
  exerciseIndex,
  cardKey,
  previews,
  unit,
  note,
  roomForBout,
  roomForSet,
  actions,
}: CardioExerciseCardProps) {
  const doneHere = exercise.sets.filter((set) => set.done).length;
  return (
    <section className="panel stack exercise-card">
      <header>
        <h2>{exercise.name}</h2>
        <span className="row">
          <button className="button link" type="button" onClick={() => actions.removeExerciseAt(exerciseIndex)}>
            Remove
          </button>
        </span>
      </header>
      <p className="muted">{`${doneHere}/${exercise.sets.length} bouts`}</p>
      {note}
      <ol className="set-list">
        {exercise.sets.map((bout, boutIndex) => (
          <CardioSetRow
            key={bout.id}
            boutNumber={boutIndex + 1}
            bout={bout}
            paceUnit={exercise.activity.paceUnit}
            tracksDistance={exercise.activity.tracksDistance}
            preview={previews[boutIndex]}
            drop={actions.dropOn(bout.id)}
            unit={unit}
            onChange={(changes) =>
              actions.changeSet(updateBout(draft, exerciseIndex, bout.id, changes), bout.id, {
                exerciseIndex,
                setIndex: boutIndex,
                label: feedbackLabel(exercise.name, 'bout', boutIndex + 1),
              })
            }
            menuRef={actions.focusTarget(bout.id)}
            onRemove={() => actions.removeSetAt(exerciseIndex, bout.id)}
            onToggleDone={() =>
              actions.changeSet(toggleSetDone(draft, exerciseIndex, bout.id), bout.id, {
                exerciseIndex,
                setIndex: boutIndex,
                label: feedbackLabel(exercise.name, 'bout', boutIndex + 1),
              })
            }
          />
        ))}
      </ol>
      <button
        ref={actions.focusTarget(cardKey)}
        className="button dashed"
        type="button"
        disabled={!roomForBout}
        onClick={() => actions.changeDraft(addSet(draft, exerciseIndex))}
      >
        + Add bout
      </button>
      {roomForSet && !roomForBout && <p className="hint">{BOUTS_FULL_TEXT}</p>}
    </section>
  );
}
