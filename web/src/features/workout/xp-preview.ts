import {
  type BalanceConfig,
  DEFAULT_BALANCE,
  effectiveReps,
  estimateRir,
  intensityBonus,
  resolveEffort,
  setXp,
} from '@domain/index.ts';
import type { LoadType } from '../../lib/catalog.ts';
import type { ExerciseStrengthView } from '../../lib/collection-data.ts';
import type { DraftSet } from '../../offline/draft-format.ts';

export type PreviewBasis = 'logged' | 'estimated' | 'cold_start' | 'unknown';

export interface SetPreview {
  xp: number;
  basis: PreviewBasis;
  rir: number | null;
}

export interface PreviewExercise {
  loadType: LoadType;
  builtIn: boolean;
  strength: ExerciseStrengthView | null | undefined;
}

function estimatedRir(set: DraftSet, exercise: PreviewExercise): number | null {
  const strength = exercise.strength;
  if (!strength) return null;
  if (exercise.loadType === 'bodyweight')
    return strength.repsCapacity === null ? null : Math.max(0, strength.repsCapacity - set.reps);
  if (exercise.loadType === 'external' && strength.e1rmKg !== null && set.weightKg > 0)
    return estimateRir(set.weightKg, set.reps, strength.e1rmKg);
  return null;
}

function xpAt(set: DraftSet, exercise: PreviewExercise, rir: number, cfg: BalanceConfig): number {
  const e1rmKg = exercise.loadType === 'external' ? (exercise.strength?.e1rmKg ?? null) : null;
  return setXp(effectiveReps(set.reps, rir, false, cfg), intensityBonus(set.weightKg, e1rmKg, cfg), cfg);
}

function loggedRir(set: DraftSet, cfg: BalanceConfig): number | null {
  try {
    return resolveEffort(set.effort, cfg).loggedRir;
  } catch {
    return null;
  }
}

export function previewSet(
  set: DraftSet,
  exercise: PreviewExercise,
  strengthKnown: boolean,
  cfg: BalanceConfig = DEFAULT_BALANCE,
): SetPreview {
  if (set.effort) {
    const rir = loggedRir(set, cfg);
    if (rir === null) return { xp: 0, basis: 'unknown', rir: null };
    return { xp: xpAt(set, exercise, rir, cfg), basis: 'logged', rir };
  }
  if (!strengthKnown) return { xp: 0, basis: 'unknown', rir: null };
  if (!exercise.strength) return { xp: exercise.builtIn ? cfg.coldStartXpPerSet : 0, basis: 'cold_start', rir: null };
  const rir = estimatedRir(set, exercise);
  if (rir === null) return { xp: 0, basis: 'unknown', rir: null };
  return { xp: xpAt(set, exercise, rir, cfg), basis: 'estimated', rir };
}

export function formatXp(xp: number): string {
  return xp.toLocaleString('en-US');
}
