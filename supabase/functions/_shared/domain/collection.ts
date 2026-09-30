import type { LoadType } from './types.ts';
import { REP_MAX_SLOT_COUNT } from './types.ts';

export interface CollectionExercise {
  loadType: LoadType;
  exactRepMaxSlotsFilled: number;
  hasBodyweightRecord: boolean;
}

export interface CollectionCompletion {
  filledSlots: number;
  totalSlots: number;
  fraction: number;
}

function slotsFor(exercise: CollectionExercise): { filled: number; total: number } {
  if (exercise.loadType === 'bodyweight') return { filled: exercise.hasBodyweightRecord ? 1 : 0, total: 1 };
  return { filled: Math.min(exercise.exactRepMaxSlotsFilled, REP_MAX_SLOT_COUNT), total: REP_MAX_SLOT_COUNT };
}

export function collectionCompletion(exercisesDoneOrPinned: readonly CollectionExercise[]): CollectionCompletion {
  const counted = exercisesDoneOrPinned.map(slotsFor);
  const filledSlots = counted.reduce((sum, slots) => sum + slots.filled, 0);
  const totalSlots = counted.reduce((sum, slots) => sum + slots.total, 0);
  return { filledSlots, totalSlots, fraction: totalSlots === 0 ? 0 : filledSlots / totalSlots };
}
