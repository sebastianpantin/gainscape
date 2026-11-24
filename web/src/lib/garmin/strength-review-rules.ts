import {
  type GarminGroupDecision,
  type GarminGroupNeed,
  type GarminSetGroup,
  garminSetWeight,
  type GarminStrengthDecision,
  garminUsableSetCount,
  type LoadType,
} from '@domain/index.ts';
import { activeExercises, type Exercise, isPlannableExercise, type LiftExercise } from '../exercises/catalog-rules.ts';
import { formatCount } from '../format.ts';
import { capitalized } from '../names.ts';
import type { UnitPref } from '../profile/profile-rules.ts';
import { formatWeight, parsedDecimal, unitToKg } from '../units.ts';

const UNKNOWN_CATEGORY_LABEL = 'Unknown exercise';

export interface ReviewLift {
  id: string;
  name: string;
  loadType: LoadType;
}

export const UNDECIDED_GROUP: GarminGroupDecision = Object.freeze({ skipped: false, exercise: null, filledKg: [] });

export function pickableLifts(exercises: readonly Exercise[]): LiftExercise[] {
  return activeExercises(exercises).filter(isPlannableExercise);
}

export function reviewLifts(exercises: readonly Exercise[]): Map<string, ReviewLift> {
  return new Map(pickableLifts(exercises).map(({ id, name, loadType }) => [id, { id, name, loadType }]));
}

export function categoryLabel(category: string | null): string {
  return category === null ? UNKNOWN_CATEGORY_LABEL : capitalized(category.replaceAll('_', ' '));
}

export function groupName(groups: readonly GarminSetGroup[], index: number): string {
  return `group ${index + 1}, ${categoryLabel(groups[index].category)}`;
}

export function prefilledDecisions(
  groups: readonly GarminSetGroup[],
  exerciseIdByCategory: ReadonlyMap<string, string>,
  lifts: ReadonlyMap<string, ReviewLift>,
): GarminGroupDecision[] {
  return groups.map((group) => {
    const remembered = group.category === null ? undefined : lifts.get(exerciseIdByCategory.get(group.category) ?? '');
    return remembered === undefined ? UNDECIDED_GROUP : decisionFor(remembered);
  });
}

export function withGroupDecision(
  decisions: readonly GarminGroupDecision[],
  index: number,
  change: (decision: GarminGroupDecision) => GarminGroupDecision,
): GarminGroupDecision[] {
  const changed = [...decisions];
  changed[index] = change(decisions[index] ?? UNDECIDED_GROUP);
  return changed;
}

export function decisionFor(lift: ReviewLift): GarminGroupDecision {
  return { ...UNDECIDED_GROUP, exercise: { id: lift.id, loadType: lift.loadType } };
}

export function withSkip(decision: GarminGroupDecision, skipped: boolean): GarminGroupDecision {
  return { ...decision, skipped };
}

export function withFilledWeight(
  decision: GarminGroupDecision,
  setIndex: number,
  typed: string,
  unit: UnitPref,
): GarminGroupDecision {
  const shown = parsedDecimal(typed);
  const filledKg = Array.from(
    { length: Math.max(decision.filledKg.length, setIndex + 1) },
    (_unused, index) => decision.filledKg[index] ?? null,
  );
  filledKg[setIndex] = shown === null ? null : unitToKg(shown, unit);
  return { ...decision, filledKg };
}

export interface GroupSetView {
  text: string;
  asksWeight: boolean;
}

export function groupSetViews(
  group: GarminSetGroup,
  decision: GarminGroupDecision | undefined,
  unit: UnitPref,
): GroupSetView[] {
  const loadType = decision?.skipped === true ? undefined : decision?.exercise?.loadType;
  return group.sets.map((set, index) => {
    const asksWeight =
      loadType !== undefined && garminSetWeight(set, loadType, decision?.filledKg[index] ?? null).source === 'asked';
    const reps = formatCount(set.reps, 'rep');
    return { text: set.weightKg > 0 ? `${set.reps} × ${formatWeight(set.weightKg, unit)}` : reps, asksWeight };
  });
}

export function groupNotes(
  group: GarminSetGroup,
  decision: GarminGroupDecision | undefined,
  exerciseName: string | undefined,
  unit: UnitPref,
): string[] {
  const loadType = decision?.skipped === true ? undefined : decision?.exercise?.loadType;
  const leftOutWeights =
    loadType === undefined
      ? []
      : group.sets.flatMap((set) => {
          const weight = garminSetWeight(set, loadType, null);
          return weight.source === 'left_out' ? [formatWeight(weight.recordedKg, unit)] : [];
        });
  return [
    group.leftOut > 0 ? `${formatCount(group.leftOut, 'set')} without reps left out.` : null,
    leftOutWeights.length > 0
      ? `${exerciseName ?? 'This exercise'} takes no added weight: ${[...new Set(leftOutWeights)].join(', ')} left out.`
      : null,
  ].filter((note) => note !== null);
}

const UNDECIDED_BADGE_TEXT: Record<GarminGroupNeed, string> = { exercise: 'Needs exercises', weight: 'Needs a weight' };

export function strengthBadgeText(decision: GarminStrengthDecision): string | null {
  if (decision.status === 'ready') return null;
  if (decision.status === 'undecided') return UNDECIDED_BADGE_TEXT[decision.needs];
  return decision.status === 'needs_bodyweight' ? 'Needs your bodyweight' : 'Every group skipped';
}

export function strengthFacts(groups: readonly GarminSetGroup[]): string {
  return `${formatCount(garminUsableSetCount(groups), 'set')} in ${formatCount(groups.length, 'group')}`;
}
