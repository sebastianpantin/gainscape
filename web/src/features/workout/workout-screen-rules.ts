import { type Exercise, isLiftExercise, type LiftExercise } from '../../lib/exercises/catalog-rules.ts';
import { similarExercises } from '../../lib/exercises/substitute-rules.ts';
import { type SupersetGroup, supersetGroups } from '../../lib/workout/superset-rules.ts';
import { type DraftExercise, type LiftDraftExercise, type WorkoutDraft } from '../../offline/draft-format.ts';
import { canAddSetTo } from '../../lib/workout/exercise-edit-rules.ts';
import {
  addCardioExercise,
  addExercise,
  addHoldExercise,
  addSet,
  type LastLoggedSet,
} from '../../offline/draft-edits.ts';

const MAX_SWAP_SUGGESTIONS = 6;

interface SupersetMember {
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

export interface RemovedSet {
  clientId: string;
  index: number;
  set: DraftExercise['sets'][number];
}

export function removedSetAt(draft: WorkoutDraft, exerciseIndex: number, setId: string): RemovedSet | null {
  const exercise = draft.exercises[exerciseIndex];
  const index = exercise?.sets.findIndex((candidate) => candidate.id === setId) ?? -1;
  if (exercise === undefined || index === -1) return null;
  return { clientId: exercise.clientId, index, set: exercise.sets[index] };
}

export function restoreRemovedSet(draft: WorkoutDraft, removed: RemovedSet): WorkoutDraft {
  const exerciseIndex = draft.exercises.findIndex((exercise) => exercise.clientId === removed.clientId);
  const exercise = draft.exercises[exerciseIndex];
  if (draft.finishedAt !== null || exercise === undefined || !canAddSetTo(draft, exercise.modality)) return draft;
  if (exercise.sets.some((existing) => existing.id === removed.set.id)) return draft;
  const at = Math.min(removed.index, exercise.sets.length);
  const sets = [...exercise.sets.slice(0, at), removed.set, ...exercise.sets.slice(at)];
  const restored = { ...exercise, sets } as DraftExercise;
  return {
    ...draft,
    exercises: draft.exercises.map((current, index) => (index === exerciseIndex ? restored : current)),
  };
}

export function removedSetText(exercise: DraftExercise, index: number): string {
  return `Removed ${exercise.modality === 'cardio' ? 'bout' : 'set'} ${index + 1} of ${exercise.name}.`;
}
