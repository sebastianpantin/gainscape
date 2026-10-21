import { SECONDS_PER_MINUTE } from '@domain/cardio.ts';
import type { CardioExercise, Exercise } from '../exercises/catalog-rules.ts';

export interface WarmupRoutine {
  liftKey: string;
  name: string;
  drillKeys: readonly string[];
}

export const ROUTINE_DRILL_DURATION_S = 60;

export const WARMUP_ROUTINES: readonly WarmupRoutine[] = [
  {
    liftKey: 'back_squat',
    name: 'Squat routine',
    drillKeys: ['leg_swings', 'hip_circles', 'cossack_squat', 'squat_to_stand'],
  },
  {
    liftKey: 'deadlift',
    name: 'Deadlift routine',
    drillKeys: ['cat_cow', 'inchworm', 'worlds_greatest_stretch', 'leg_swings'],
  },
  {
    liftKey: 'barbell_bench_press',
    name: 'Bench routine',
    drillKeys: ['arm_circles', 'band_pull_apart', 'open_book_rotation', 'scapular_push_up'],
  },
  {
    liftKey: 'overhead_press',
    name: 'Press routine',
    drillKeys: ['arm_circles', 'band_pull_apart', 'open_book_rotation', 'wall_slide'],
  },
];

export function warmupRoutineFor(liftKey: string | null | undefined): WarmupRoutine | undefined {
  return WARMUP_ROUTINES.find((routine) => routine.liftKey === liftKey);
}

export function routineSummary(routine: WarmupRoutine): string {
  const minutes = (routine.drillKeys.length * ROUTINE_DRILL_DURATION_S) / SECONDS_PER_MINUTE;
  return `${routine.drillKeys.length} drills · ${minutes} min`;
}

export function routineDrills(routine: WarmupRoutine, catalog: readonly Exercise[]): CardioExercise[] | null {
  const drills = routine.drillKeys.map((key) =>
    catalog.find(
      (exercise): exercise is CardioExercise =>
        exercise.key === key && exercise.modality === 'cardio' && !exercise.archived,
    ),
  );
  return drills.every((drill): drill is CardioExercise => drill !== undefined) ? drills : null;
}
