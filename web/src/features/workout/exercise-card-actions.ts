import { type WorkoutDraft } from '../../offline/draft-format.ts';
import { type ShownSetDrop } from './set-feedback-rules.ts';

export interface SetPlace {
  exerciseIndex: number;
  setIndex: number;
  label: string;
}

export interface ExerciseCardActions {
  changeDraft: (next: WorkoutDraft) => void;
  changeSet: (next: WorkoutDraft, setId: string, place: SetPlace) => void;
  removeExerciseAt: (exerciseIndex: number) => void;
  removeSetAt: (exerciseIndex: number, setId: string) => void;
  focusTarget: (key: string) => (button: HTMLButtonElement | null) => void;
  dropOn: (setId: string) => ShownSetDrop | null;
}
