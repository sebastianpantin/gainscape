import { type ReactNode } from 'react';
import { updateHoldSet } from '../../lib/workout/exercise-edit-rules.ts';
import { type UnitPref } from '../../lib/profile/profile.ts';
import { type HoldDraftExercise, type WorkoutDraft } from '../../offline/draft-format.ts';
import { addSet, toggleSetDone } from '../../offline/draft-edits.ts';
import { AddSetButton } from './AddSetButton.tsx';
import { type ExerciseCardActions } from './exercise-card-actions.ts';
import { HoldSetRow } from './HoldSetRow.tsx';
import { type PreviewRecord } from './record-preview.ts';
import { feedbackLabel } from './set-feedback-rules.ts';
import { type SetPreview } from './xp-preview.ts';

interface HoldExerciseCardProps {
  draft: WorkoutDraft;
  exercise: HoldDraftExercise;
  exerciseIndex: number;
  previews: SetPreview[];
  records: (PreviewRecord | null)[];
  unit: UnitPref;
  note: ReactNode;
  roomForSet: boolean;
  currentSetId: string | null;
  actions: ExerciseCardActions;
}

export function HoldExerciseCard({
  draft,
  exercise,
  exerciseIndex,
  previews,
  records,
  unit,
  note,
  roomForSet,
  currentSetId,
  actions,
}: HoldExerciseCardProps) {
  const doneHere = exercise.sets.filter((set) => set.done).length;
  return (
    <section className="panel stack exercise-card">
      <header>
        <h2 tabIndex={-1}>{exercise.name}</h2>
        <span className="row">
          <button className="button link" type="button" onClick={() => actions.removeExerciseAt(exerciseIndex)}>
            Remove
          </button>
        </span>
      </header>
      <p className="muted">{`${doneHere}/${exercise.sets.length} sets`}</p>
      {note}
      <ol className="set-list">
        {exercise.sets.map((set, setIndex) => {
          const place = { exerciseIndex, setIndex, label: feedbackLabel(exercise.name, 'set', setIndex + 1) };
          return (
            <HoldSetRow
              key={set.id}
              setNumber={setIndex + 1}
              set={set}
              current={currentSetId === set.id}
              measure={exercise.measure}
              loadType={exercise.loadType}
              preview={previews[setIndex]}
              record={records[setIndex]}
              drop={actions.dropOn(set.id)}
              unit={unit}
              onChange={(changes) =>
                actions.changeSet(updateHoldSet(draft, exerciseIndex, set.id, changes), set.id, place)
              }
              menuRef={actions.focusTarget(set.id)}
              onRemove={() => actions.removeSetAt(exerciseIndex, set.id)}
              onToggleDone={() => actions.changeSet(toggleSetDone(draft, exerciseIndex, set.id), set.id, place)}
            />
          );
        })}
      </ol>
      <AddSetButton
        buttonRef={actions.focusTarget(exercise.clientId)}
        roomForSet={roomForSet}
        onAdd={() => actions.changeDraft(addSet(draft, exerciseIndex))}
      />
    </section>
  );
}
