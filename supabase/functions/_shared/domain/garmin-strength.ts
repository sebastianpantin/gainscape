import { isWholeNumberBetween } from './math.ts';
import { storedWeightKg } from './set-codec.ts';
import { countsBodyweight, type LoadType, MAX_SET_LOAD_KG, MAX_SET_REPS, measuresRepsCapacity } from './types.ts';

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
  | { source: 'left_out'; weightKg: 0 };

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

export type GarminGroupNeed = 'needs_exercise' | 'needs_weight';

export type GarminUndecidedStatus = GarminGroupNeed | 'nothing_chosen' | 'needs_bodyweight';

export type GarminStrengthDecision =
  { status: GarminUndecidedStatus } | { status: 'ready'; sets: GarminLiftSet[]; picks: GarminExercisePick[] };

const UNKNOWN_CATEGORY = 'unknown';

export const GARMIN_KEY_PATTERN = /^[a-z0-9_]{1,60}$/;

export function garminCategoryKey(name: string | null): string | null {
  return name !== null && name !== UNKNOWN_CATEGORY && GARMIN_KEY_PATTERN.test(name) ? name : null;
}

function storableWeight(weightKg: number): number | null {
  return weightKg >= 0 && weightKg <= MAX_SET_LOAD_KG ? storedWeightKg(weightKg) : null;
}

function usableSet(set: GarminSet): GarminGroupSet | null {
  const weightKg = storableWeight(set.weightKg ?? 0);
  if (!isWholeNumberBetween(set.reps, 1, MAX_SET_REPS) || weightKg === null) return null;
  return { reps: set.reps, weightKg };
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
    return set.weightKg > 0 ? { source: 'left_out', weightKg: 0 } : { source: 'recorded', weightKg: 0 };
  }
  if (loadType !== 'external' || set.weightKg > 0) return { source: 'recorded', weightKg: set.weightKg };
  const filled = filledKg === null ? null : storableWeight(filledKg);
  return { source: 'asked', weightKg: filled !== null && filled > 0 ? filled : null };
}

function liftSetsOfGroup(
  group: GarminSetGroup,
  decision: GarminGroupDecision | undefined,
): GarminLiftSet[] | GarminGroupNeed {
  if (group.sets.length === 0 || decision?.skipped === true) return [];
  const exercise = decision?.exercise ?? null;
  if (decision === undefined || exercise === null) return 'needs_exercise';
  const sets: GarminLiftSet[] = [];
  for (const [index, set] of group.sets.entries()) {
    const { weightKg } = garminSetWeight(set, exercise.loadType, decision.filledKg[index] ?? null);
    if (weightKg === null) return 'needs_weight';
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
    if (group.category !== null && first !== undefined) exerciseByCategory.set(group.category, first.exerciseId);
  });
  return Array.from(exerciseByCategory, ([category, exerciseId]) => ({ category, exerciseId }));
}

export function garminStrengthDecision(
  groups: readonly GarminSetGroup[],
  decisions: readonly (GarminGroupDecision | undefined)[],
  bodyweightKnown: boolean,
): GarminStrengthDecision {
  const outcomes = groups.map((group, index) => liftSetsOfGroup(group, decisions[index]));
  const setsByGroup = outcomes.filter((outcome) => typeof outcome !== 'string');
  if (setsByGroup.length < outcomes.length) {
    return { status: outcomes.includes('needs_exercise') ? 'needs_exercise' : 'needs_weight' };
  }
  const sets = setsByGroup.flat();
  if (sets.length === 0) return { status: 'nothing_chosen' };
  const needsBodyweight = setsByGroup.some((groupSets, index) => {
    const loadType = decisions[index]?.exercise?.loadType;
    return groupSets.length > 0 && loadType !== undefined && countsBodyweight(loadType);
  });
  if (needsBodyweight && !bodyweightKnown) return { status: 'needs_bodyweight' };
  return { status: 'ready', sets, picks: picksToRemember(groups, setsByGroup) };
}
