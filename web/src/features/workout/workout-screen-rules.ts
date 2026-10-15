import { type Exercise, isLiftExercise, type LiftExercise } from '../../lib/exercises/catalog-rules.ts';
import { similarExercises } from '../../lib/exercises/substitute-rules.ts';
import { type SupersetGroup, supersetGroups } from '../../lib/workout/superset-rules.ts';
import { type LiftDraftExercise, type WorkoutDraft } from '../../offline/draft-format.ts';
import {
  addCardioExercise,
  addExercise,
  addHoldExercise,
  addSet,
  type LastLoggedSet,
} from '../../offline/draft-edits.ts';

const MAX_SWAP_SUGGESTIONS = 6;

export interface SupersetMember {
  index: number;
  exercise: LiftDraftExercise;
}

export function liftIdsToRecall(draft: WorkoutDraft | null): string[] {
  if (draft === null || draft.finishedAt) return [];
  return draft.exercises.flatMap((exercise) => (exercise.modality === 'lift' ? [exercise.exerciseId] : []));
}

export function swappableLifts(exercises: readonly Exercise[]): LiftExercise[] {
  return exercises.filter(isLiftExercise).filter((exercise) => exercise.measure === undefined);
}

export function swapSuggestions(exerciseId: string, lifts: readonly LiftExercise[]): LiftExercise[] {
  const original = lifts.find((candidate) => candidate.id === exerciseId);
  return original ? similarExercises(original, lifts, MAX_SWAP_SUGGESTIONS) : [];
}

export function withPickedExercise(
  draft: WorkoutDraft,
  exercise: Exercise,
  firstSet: LastLoggedSet | undefined,
): WorkoutDraft {
  const exerciseIndex = draft.exercises.length;
  if (exercise.modality === 'cardio')
    return addSet(addCardioExercise(draft, exercise.id, exercise.name, exercise.activity), exerciseIndex);
  if (exercise.measure !== undefined)
    return addSet(
      addHoldExercise(draft, exercise.id, exercise.name, exercise.loadType, exercise.measure),
      exerciseIndex,
    );
  return addSet(addExercise(draft, exercise.id, exercise.name, exercise.loadType), exerciseIndex, firstSet);
}

export function addButtonKey(draft: WorkoutDraft, exerciseIndex: number): string {
  const group = supersetGroups(draft).find((candidate) => candidate.exerciseIndexes.includes(exerciseIndex));
  return group === undefined ? draft.exercises[exerciseIndex].clientId : `superset-${group.id}`;
}

export function supersetMembers(draft: WorkoutDraft, group: SupersetGroup): SupersetMember[] {
  return group.exerciseIndexes.flatMap((index) => {
    const member = draft.exercises[index];
    return member?.modality === 'lift' ? [{ index, exercise: member }] : [];
  });
}
