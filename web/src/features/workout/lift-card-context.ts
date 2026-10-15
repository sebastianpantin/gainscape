import { type ReactNode } from 'react';
import { type ExerciseStrengthView } from '../../lib/collection/collection-data.ts';
import { type Exercise, type LiftExercise } from '../../lib/exercises/catalog-rules.ts';
import { type RecentSessions } from '../../lib/history/last-session-rules.ts';
import { type EffortInputMode, type UnitPref } from '../../lib/profile/profile.ts';
import { type DraftBarbellSetup } from '../../lib/programs/program-set-rules.ts';
import { type WorkoutDraft } from '../../offline/draft-format.ts';
import { type ExerciseCardActions } from './exercise-card-actions.ts';
import { type LiftEquipment } from './exercise-card-rules.ts';
import { type ExerciseMenuAction } from './ExerciseMenu.tsx';
import { type PreviewRecord } from './record-preview.ts';
import { type RestTimerControls } from './use-rest-timer.ts';
import { type SetPreview } from './xp-preview.ts';

export interface LiftSwap {
  openKey: string | null;
  lifts: LiftExercise[];
  swapTo: (exerciseIndex: number, replacement: Exercise) => void;
}

export interface LiftCardContext {
  draft: WorkoutDraft;
  previews: SetPreview[][];
  records: (PreviewRecord | null)[][];
  unit: UnitPref;
  effortMode: EffortInputMode;
  equipment: LiftEquipment;
  barbellSetup: DraftBarbellSetup;
  strength: ReadonlyMap<string, ExerciseStrengthView> | null;
  recentSessions: ReadonlyMap<string, RecentSessions>;
  rest: RestTimerControls;
  roomForSet: boolean;
  actions: ExerciseCardActions;
  menuActions: (exerciseIndex: number) => ExerciseMenuAction[];
  swap: LiftSwap;
  focusSetId: string | null;
  onFocusSet: (setId: string | null) => void;
  note: (exerciseId: string, exerciseName: string) => ReactNode;
}
