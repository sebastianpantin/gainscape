import {
  DEFAULT_BALANCE,
  DEFAULT_ROUNDING,
  type EffortInput,
  kgToUnit,
  MAX_RPE,
  resolveEffort,
  roundLoad,
  rpeChartPct,
  shownWeight,
  unitToKg,
  type WeightUnit,
} from '@domain/index.ts';
import { type LoadType } from '../exercises/catalog-rules.ts';
import { type DraftSet } from '../../offline/draft-format.ts';

interface BackoffExercise {
  loadType: LoadType;
  sets: readonly DraftSet[];
}

export interface BackoffSuggestion {
  setIndex: number;
  shown: number;
  weightKg: number;
  reps: number;
}

const BACKOFF_RPE_DROP = 1;

function effortAsRpe(effort: EffortInput): number | null {
  const { loggedRir } = resolveEffort(effort, DEFAULT_BALANCE, 'lift');
  return loggedRir === null ? null : MAX_RPE - loggedRir;
}

function isTopSetCandidate(set: DraftSet): boolean {
  return set.done && !set.isWarmup && set.weightKg > 0 && set.effort !== null;
}

function topSetIndex(sets: readonly DraftSet[]): number {
  return sets.reduce(
    (top, set, index) =>
      isTopSetCandidate(set) && (top < 0 || set.weightKg >= (sets[top]?.weightKg ?? 0)) ? index : top,
    -1,
  );
}

export function backoffSuggestion(exercise: BackoffExercise, unit: WeightUnit): BackoffSuggestion | null {
  const { sets } = exercise;
  if (exercise.loadType !== 'external' || sets.some((set) => set.prescription)) return null;
  const topIndex = topSetIndex(sets);
  const top = sets[topIndex];
  if (!top) return null;
  const setIndex = sets.findIndex((set, index) => index > topIndex && !set.done && !set.isWarmup);
  const rpe = effortAsRpe(top.effort);
  if (setIndex < 0 || rpe === null) return null;
  const topPct = rpeChartPct(top.reps, rpe);
  const backoffPct = rpeChartPct(top.reps, rpe - BACKOFF_RPE_DROP);
  if (topPct === null || backoffPct === null) return null;
  const backoffKg = (top.weightKg / topPct) * backoffPct;
  const shown = roundLoad(kgToUnit(backoffKg, unit), DEFAULT_ROUNDING[unit].increment, 'down');
  if (shown <= 0 || shown >= shownWeight(top.weightKg, unit)) return null;
  return { setIndex, shown, weightKg: unitToKg(shown, unit), reps: top.reps };
}
