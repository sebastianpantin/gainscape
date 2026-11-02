import { type DraftUpdate } from '../../offline/draft-session.ts';
import { type ShownSetDrop } from './set-feedback-rules.ts';
import { type PendingFocus } from './use-focus-after-removal.ts';

export interface SetPlace {
  exerciseIndex: number;
  setIndex: number;
  label: string;
}

export interface ExerciseCardActions {
  edit: (update: DraftUpdate) => unknown;
  editSet: (setId: string, place: SetPlace, update: DraftUpdate) => void;
  removeExerciseAt: (exerciseIndex: number) => void;
  removeSetAt: (exerciseIndex: number, setId: string) => void;
  focusTarget: (key: string) => (button: HTMLButtonElement | null) => void;
  focusAfterNextChange: (pending: PendingFocus) => void;
  dropOn: (setId: string) => ShownSetDrop | null;
}
