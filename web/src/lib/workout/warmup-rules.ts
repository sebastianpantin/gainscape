import { roundLoad } from '@domain/index.ts';
import { type BarbellSetup, nearestLoadable } from './plate-rules.ts';

export interface WarmupSet {
  weight: number;
  reps: number;
}

export type WarmupRamp =
  { kind: 'barbell'; setup: BarbellSetup } | { kind: 'increment'; step: number } | { kind: 'single' };

const BAR_WARMUP_REPS = 10;

const WARMUP_RAMP: readonly { fraction: number; reps: number }[] = [
  { fraction: 0.4, reps: 5 },
  { fraction: 0.6, reps: 3 },
  { fraction: 0.8, reps: 2 },
];

function rampFrom(start: WarmupSet[], workingWeight: number, loadable: (weight: number) => number): WarmupSet[] {
  const sets = [...start];
  for (const { fraction, reps } of WARMUP_RAMP) {
    const weight = loadable(workingWeight * fraction);
    const previous = sets.length > 0 ? sets[sets.length - 1].weight : 0;
    if (weight > previous && weight < workingWeight) sets.push({ weight, reps });
  }
  return sets;
}

export function warmupSets(workingWeight: number, setup: BarbellSetup): WarmupSet[] {
  if (workingWeight <= setup.barWeight) return [];
  return rampFrom([{ weight: setup.barWeight, reps: BAR_WARMUP_REPS }], workingWeight, (weight) =>
    nearestLoadable(weight, setup.barWeight, setup.plates),
  );
}

export function incrementWarmupSets(workingWeight: number, step: number): WarmupSet[] {
  return rampFrom([], workingWeight, (weight) => roundLoad(weight, step, 'nearest'));
}

function rampFor(workingWeight: number, ramp: WarmupRamp): WarmupSet[] {
  if (ramp.kind === 'barbell') return warmupSets(workingWeight, ramp.setup);
  if (ramp.kind === 'increment') return incrementWarmupSets(workingWeight, ramp.step);
  return [];
}

export function warmupPlan(workingSet: WarmupSet, ramp: WarmupRamp): WarmupSet[] {
  const sets = rampFor(workingSet.weight, ramp);
  return sets.length > 0 ? sets : [workingSet];
}
