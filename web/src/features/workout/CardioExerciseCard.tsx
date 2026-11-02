import { type ReactNode } from 'react';
import { BOUTS_FULL_TEXT } from '../../lib/workout/cardio-rules.ts';
import { updateBout } from '../../lib/workout/exercise-edit-rules.ts';
import { type UnitPref } from '../../lib/profile/profile.ts';
import { type CardioDraftExercise } from '../../offline/draft-format.ts';
import { addSet, toggleSetDone } from '../../offline/draft-edits.ts';
import { CardioSetRow } from './CardioSetRow.tsx';
import { type ExerciseCardActions } from './exercise-card-actions.ts';
import { feedbackLabel } from './set-feedback-rules.ts';
import { type PreviewRecord } from './record-preview.ts';
import { type SetPreview } from './xp-preview.ts';

interface CardioExerciseCardProps {
  exercise: CardioDraftExercise;
  exerciseIndex: number;
  previews: SetPreview[];
  records: (PreviewRecord | null)[];
  unit: UnitPref;
  note: ReactNode;
  roomForBout: boolean;
  roomForSet: boolean;
  currentSetId: string | null;
  actions: ExerciseCardActions;
}

export function CardioExerciseCard({
  exercise,
  exerciseIndex,
  previews,
  records,
  unit,
  note,
  roomForBout,
  roomForSet,
  currentSetId,
  actions,
}: CardioExerciseCardProps) {
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
      <p className="muted">{`${doneHere}/${exercise.sets.length} bouts`}</p>
      {note}
      <ol className="set-list">
        {exercise.sets.map((bout, boutIndex) => {
          const place = {
            exerciseIndex,
            setIndex: boutIndex,
            label: feedbackLabel(exercise.name, 'bout', boutIndex + 1),
          };
          return (
            <CardioSetRow
              key={bout.id}
              boutNumber={boutIndex + 1}
              bout={bout}
              current={currentSetId === bout.id}
              paceUnit={exercise.activity.paceUnit}
              tracksDistance={exercise.activity.tracksDistance}
              preview={previews[boutIndex]}
              record={records[boutIndex]}
              drop={actions.dropOn(bout.id)}
              unit={unit}
              onChange={(changes) =>
                actions.editSet(bout.id, place, (latest) => updateBout(latest, exerciseIndex, bout.id, changes))
              }
              menuRef={actions.focusTarget(bout.id)}
              onRemove={() => actions.removeSetAt(exerciseIndex, bout.id)}
              onToggleDone={() =>
                actions.editSet(bout.id, place, (latest) => toggleSetDone(latest, exerciseIndex, bout.id))
              }
            />
          );
        })}
      </ol>
      <button
        ref={actions.focusTarget(exercise.clientId)}
        className="button dashed"
        type="button"
        disabled={!roomForBout}
        onClick={() => actions.edit((latest) => addSet(latest, exerciseIndex))}
      >
        + Add bout
      </button>
      {roomForSet && !roomForBout && <p className="hint">{BOUTS_FULL_TEXT}</p>}
    </section>
  );
}
