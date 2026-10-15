import { programSetMarkers, programSetMarkerTexts } from '../../lib/programs/program-set-rules.ts';
import { updateSet } from '../../lib/workout/exercise-edit-rules.ts';
import { barbellPlates, barbellPlatesText } from '../../lib/workout/plate-rules.ts';
import { stopsRestForWarmup } from '../../lib/workout/rest-timer-rules.ts';
import { nextInRound } from '../../lib/workout/superset-rules.ts';
import { shownWeight } from '../../lib/units.ts';
import { type DraftSet, type LiftDraftExercise } from '../../offline/draft-format.ts';
import { toggleSetDone } from '../../offline/draft-edits.ts';
import { isBarbellLift, restStartsAfterChange } from './exercise-card-rules.ts';
import { lastSetForRow } from './last-set-rules.ts';
import { type LiftCardContext } from './lift-card-context.ts';
import { feedbackLabel } from './set-feedback-rules.ts';
import { SetRow } from './SetRow.tsx';

interface LiftSetRowProps {
  exercise: LiftDraftExercise;
  exerciseIndex: number;
  set: DraftSet;
  setIndex: number;
  lift: LiftCardContext;
  doneLabel?: string;
  rowLabel?: string;
}

export function LiftSetRow({ exercise, exerciseIndex, set, setIndex, lift, doneLabel, rowLabel }: LiftSetRowProps) {
  const { draft, rest, actions, unit, barbellSetup } = lift;
  const compound = lift.equipment.compoundIds.has(exercise.exerciseId);
  const place = { exerciseIndex, setIndex, label: feedbackLabel(exercise.name, 'set', setIndex + 1) };
  const startRestAfter = (changes: Partial<Omit<DraftSet, 'id'>>) => {
    if (restStartsAfterChange(draft, exerciseIndex, set, changes, rest.timer))
      rest.start(set.id, exercise.exerciseId, compound);
  };
  return (
    <SetRow
      setNumber={setIndex + 1}
      loadType={exercise.loadType}
      set={set}
      preview={lift.previews[exerciseIndex][setIndex]}
      record={lift.records[exerciseIndex][setIndex]}
      drop={actions.dropOn(set.id)}
      unit={unit}
      effortMode={lift.effortMode}
      markers={programSetMarkerTexts(programSetMarkers(set, unit))}
      barbell={
        isBarbellLift(exercise, lift.equipment)
          ? {
              plates: barbellPlates(shownWeight(set.weightKg, unit), barbellSetup, unit).plates,
              text: barbellPlatesText(shownWeight(set.weightKg, unit), barbellSetup, unit),
              setup: barbellSetup,
            }
          : null
      }
      last={lastSetForRow(exercise.sets, setIndex, lift.recentSessions.get(exercise.exerciseId)?.[0])}
      doneLabel={doneLabel}
      rowLabel={rowLabel}
      focusDone={lift.focusSetId === set.id}
      onDoneFocused={() => lift.onFocusSet(null)}
      onChange={(changes) => {
        startRestAfter(changes);
        if (stopsRestForWarmup(set, changes, rest.timer)) rest.stop();
        actions.changeSet(updateSet(draft, exerciseIndex, set.id, changes), set.id, place);
      }}
      menuRef={actions.focusTarget(set.id)}
      onRemove={() => actions.removeSetAt(exerciseIndex, set.id)}
      onToggleDone={() => {
        startRestAfter({ done: !set.done });
        lift.onFocusSet(set.done ? null : (nextInRound(draft, exerciseIndex, set.id)?.setId ?? null));
        actions.changeSet(toggleSetDone(draft, exerciseIndex, set.id), set.id, place);
      }}
    />
  );
}
