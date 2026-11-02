import { type DraftUpdate } from '../../offline/draft-session.ts';
import { type WorkoutDraft } from '../../offline/draft-format.ts';
import { type ExerciseCardActions, type SetPlace } from './exercise-card-actions.ts';

export interface SetEditChange {
  previous: WorkoutDraft;
  next: WorkoutDraft;
  setId: string;
  place: SetPlace;
}

interface DraftEditCommandsOptions {
  updateDraft: (update: DraftUpdate) => WorkoutDraft | null;
  onSetEdited: (change: SetEditChange) => void;
}

export function draftEditCommands({
  updateDraft,
  onSetEdited,
}: DraftEditCommandsOptions): Pick<ExerciseCardActions, 'edit' | 'editSet'> {
  return {
    edit: updateDraft,
    editSet: (setId, place, update) => {
      let change: SetEditChange | undefined;
      updateDraft((previous) => {
        const next = update(previous);
        if (next !== null) change = { previous, next, setId, place };
        return next;
      });
      if (change) onSetEdited(change);
    },
  };
}
