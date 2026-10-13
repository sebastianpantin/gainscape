import { type ReactNode } from 'react';
import { updateHoldSet } from '../../lib/workout/exercise-edit-rules.ts';
import { type UnitPref } from '../../lib/profile/profile.ts';
import { addSet, type HoldDraftExercise, toggleSetDone, type WorkoutDraft } from '../../offline/draft-format.ts';
import { type ExerciseCardActions } from './exercise-card-actions.ts';
import { HoldSetRow } from './HoldSetRow.tsx';
import { type PreviewRecord } from './record-preview.ts';
import { feedbackLabel } from './set-feedback-rules.ts';
import { type SetPreview } from './xp-preview.ts';

interface HoldExerciseCardProps {
  draft: WorkoutDraft;
  exercise: HoldDraftExercise;
  exerciseIndex: number;
  cardKey: string;
  previews: SetPreview[];
  records: (PreviewRecord | null)[];
  unit: UnitPref;
  note: ReactNode;
  roomForSet: boolean;
  actions: ExerciseCardActions;
}

export function HoldExerciseCard({
  draft,
  exercise,
  exerciseIndex,
  cardKey,
  previews,
  records,
  unit,
  note,
  roomForSet,
  actions,
}: HoldExerciseCardProps) {
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
      <p className="muted">{`${doneHere}/${exercise.sets.length} sets`}</p>
      {note}
      <ol className="set-list">
        {exercise.sets.map((set, setIndex) => (
          <HoldSetRow
            key={set.id}
            setNumber={setIndex + 1}
            set={set}
            measure={exercise.measure}
            loadType={exercise.loadType}
            preview={previews[setIndex]}
            record={records[setIndex]}
            drop={actions.dropOn(set.id)}
            unit={unit}
            onChange={(changes) =>
              actions.changeSet(updateHoldSet(draft, exerciseIndex, set.id, changes), set.id, {
                exerciseIndex,
                setIndex,
                label: feedbackLabel(exercise.name, 'set', setIndex + 1),
              })
            }
            menuRef={actions.focusTarget(set.id)}
            onRemove={() => actions.removeSetAt(exerciseIndex, set.id)}
            onToggleDone={() =>
              actions.changeSet(toggleSetDone(draft, exerciseIndex, set.id), set.id, {
                exerciseIndex,
                setIndex,
                label: feedbackLabel(exercise.name, 'set', setIndex + 1),
              })
            }
          />
        ))}
      </ol>
      <button
        ref={actions.focusTarget(cardKey)}
        className="button dashed"
        type="button"
        disabled={!roomForSet}
        onClick={() => actions.changeDraft(addSet(draft, exerciseIndex))}
      >
        + Add set
      </button>
    </section>
  );
}
