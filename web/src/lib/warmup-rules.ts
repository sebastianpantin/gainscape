import { type BarbellSetup, nearestLoadable } from './plate-rules.ts';

export interface WarmupSet {
  weight: number;
  reps: number;
}

const BAR_WARMUP_REPS = 10;

const WARMUP_RAMP: readonly { fraction: number; reps: number }[] = [
  { fraction: 0.4, reps: 5 },
  { fraction: 0.6, reps: 3 },
  { fraction: 0.8, reps: 2 },
];

export function warmupSets(workingWeight: number, setup: BarbellSetup): WarmupSet[] {
  if (workingWeight <= setup.barWeight) return [];
  const sets: WarmupSet[] = [{ weight: setup.barWeight, reps: BAR_WARMUP_REPS }];
  for (const { fraction, reps } of WARMUP_RAMP) {
    const weight = nearestLoadable(workingWeight * fraction, setup.barWeight, setup.plates);
    const previous = sets[sets.length - 1].weight;
    if (weight > previous && weight < workingWeight) sets.push({ weight, reps });
  }
  return sets;
}

export function warmupPlan(workingSet: WarmupSet, barbell: BarbellSetup | null): WarmupSet[] {
  const ramp = barbell === null ? [] : warmupSets(workingSet.weight, barbell);
  return ramp.length > 0 ? ramp : [workingSet];
}
