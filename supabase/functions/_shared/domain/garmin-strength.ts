import { roundTo } from './math.ts';
import { type LoadType, MAX_SET_LOAD_KG, MAX_SET_REPS, measuresRepsCapacity } from './types.ts';

export interface GarminSet {
  category: string | null;
  reps: number | null;
  weightKg: number | null;
}

export interface GarminGroupSet {
  reps: number;
  weightKg: number;
}

export interface GarminSetGroup {
  category: string | null;
  sets: GarminGroupSet[];
  leftOut: number;
}

export type GarminSetWeight =
  | { source: 'recorded'; weightKg: number }
  | { source: 'asked'; weightKg: number | null }
  | { source: 'left_out'; weightKg: 0; recordedKg: number };

export interface GarminGroupDecision {
  skipped: boolean;
  exercise: { id: string; loadType: LoadType } | null;
  filledKg: readonly (number | null)[];
}

export interface GarminLiftSet {
  exerciseId: string;
  reps: number;
  weightKg: number;
}

export interface GarminExercisePick {
  category: string;
  exerciseId: string;
}

export type GarminStrengthDecision =
  | { status: 'undecided' }
  | { status: 'nothing_chosen' }
  | { status: 'ready'; sets: GarminLiftSet[]; picks: GarminExercisePick[] };

const WEIGHT_DECIMALS = 2;
const UNKNOWN_CATEGORY = 'unknown';
const CATEGORY_KEY = /^[a-z0-9_]{1,60}$/;

export function garminCategoryKey(name: string | null): string | null {
  return name !== null && name !== UNKNOWN_CATEGORY && CATEGORY_KEY.test(name) ? name : null;
}

function storableWeight(weightKg: number): number | null {
  return weightKg >= 0 && weightKg <= MAX_SET_LOAD_KG ? roundTo(WEIGHT_DECIMALS, weightKg) : null;
}

function usableSet(set: GarminSet): GarminGroupSet | null {
  const weightKg = storableWeight(set.weightKg ?? 0);
  const countsReps = set.reps !== null && Number.isInteger(set.reps) && set.reps >= 1 && set.reps <= MAX_SET_REPS;
  return countsReps && weightKg !== null ? { reps: set.reps!, weightKg } : null;
}

export function garminSetGroups(sets: readonly GarminSet[]): GarminSetGroup[] {
  const groups: GarminSetGroup[] = [];
  for (const set of sets) {
    const last = groups.at(-1);
    const group =
      last !== undefined && last.category === set.category ? last : { category: set.category, sets: [], leftOut: 0 };
    if (group !== last) groups.push(group);
    const usable = usableSet(set);
    if (usable === null) group.leftOut += 1;
    else group.sets.push(usable);
  }
  return groups;
}

export function garminUsableSetCount(groups: readonly GarminSetGroup[]): number {
  return groups.reduce((count, group) => count + group.sets.length, 0);
}

export function garminSetWeight(set: GarminGroupSet, loadType: LoadType, filledKg: number | null): GarminSetWeight {
  if (measuresRepsCapacity(loadType)) {
    return set.weightKg > 0
      ? { source: 'left_out', weightKg: 0, recordedKg: set.weightKg }
      : { source: 'recorded', weightKg: 0 };
  }
  if (loadType !== 'external' || set.weightKg > 0) return { source: 'recorded', weightKg: set.weightKg };
  const filled = filledKg !== null && filledKg > 0 ? storableWeight(filledKg) : null;
  return { source: 'asked', weightKg: filled };
}

function liftSetsOfGroup(group: GarminSetGroup, decision: GarminGroupDecision | undefined): GarminLiftSet[] | null {
  if (group.sets.length === 0 || decision?.skipped === true) return [];
  const exercise = decision?.exercise ?? null;
  if (decision === undefined || exercise === null) return null;
  const sets: GarminLiftSet[] = [];
  for (const [index, set] of group.sets.entries()) {
    const { weightKg } = garminSetWeight(set, exercise.loadType, decision.filledKg[index] ?? null);
    if (weightKg === null) return null;
    sets.push({ exerciseId: exercise.id, reps: set.reps, weightKg });
  }
  return sets;
}

function picksToRemember(
  groups: readonly GarminSetGroup[],
  setsByGroup: readonly GarminLiftSet[][],
): GarminExercisePick[] {
  const exerciseByCategory = new Map<string, string>();
  groups.forEach((group, index) => {
    const [first] = setsByGroup[index];
    if (group.category === null || first === undefined) return;
    exerciseByCategory.delete(group.category);
    exerciseByCategory.set(group.category, first.exerciseId);
  });
  return Array.from(exerciseByCategory, ([category, exerciseId]) => ({ category, exerciseId }));
}

export function garminStrengthDecision(
  groups: readonly GarminSetGroup[],
  decisions: readonly (GarminGroupDecision | undefined)[],
): GarminStrengthDecision {
  const setsByGroup: GarminLiftSet[][] = [];
  for (const [index, group] of groups.entries()) {
    const sets = liftSetsOfGroup(group, decisions[index]);
    if (sets === null) return { status: 'undecided' };
    setsByGroup.push(sets);
  }
  const sets = setsByGroup.flat();
  if (sets.length === 0) return { status: 'nothing_chosen' };
  return { status: 'ready', sets, picks: picksToRemember(groups, setsByGroup) };
}
