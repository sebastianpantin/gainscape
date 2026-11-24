import {
  type GarminGroupDecision,
  type GarminSetGroup,
  garminSetWeight,
  type GarminStrengthDecision,
  type GarminUndecidedStatus,
  garminUsableSetCount,
} from '@domain/index.ts';
import { activeExercises, type Exercise, isPlannableExercise, type LiftExercise } from '../exercises/catalog-rules.ts';
import { formatCount } from '../format.ts';
import { labelOfKey } from '../names.ts';
import type { UnitPref } from '../profile/profile-rules.ts';
import { formatWeight, parsedDecimal, unitToKg } from '../units.ts';

const UNKNOWN_CATEGORY_LABEL = 'Unknown exercise';

export type ReviewLift = Pick<LiftExercise, 'id' | 'name' | 'loadType'>;

export interface GroupChoice extends GarminGroupDecision {
  typedWeights: readonly string[];
}

export const UNDECIDED_GROUP: GroupChoice = Object.freeze({
  skipped: false,
  exercise: null,
  filledKg: [],
  typedWeights: [],
});

export function pickableLifts(exercises: readonly Exercise[]): LiftExercise[] {
  return activeExercises(exercises).filter(isPlannableExercise);
}

export function reviewLifts(lifts: readonly LiftExercise[]): Map<string, ReviewLift> {
  return new Map(lifts.map(({ id, name, loadType }) => [id, { id, name, loadType }]));
}

export function categoryLabel(category: string | null): string {
  return category === null ? UNKNOWN_CATEGORY_LABEL : labelOfKey(category);
}

export function groupName(group: GarminSetGroup, index: number): string {
  return `group ${index + 1}, ${categoryLabel(group.category)}`;
}

export function decisionFor(lift: ReviewLift): GroupChoice {
  return { ...UNDECIDED_GROUP, exercise: { id: lift.id, loadType: lift.loadType } };
}

export function prefilledDecisions(
  groups: readonly GarminSetGroup[],
  exerciseIdByCategory: ReadonlyMap<string, string>,
  lifts: ReadonlyMap<string, ReviewLift>,
): GroupChoice[] {
  return groups.map((group) => {
    const remembered = group.category === null ? undefined : lifts.get(exerciseIdByCategory.get(group.category) ?? '');
    return remembered === undefined ? UNDECIDED_GROUP : decisionFor(remembered);
  });
}

export function withGroupDecision(
  decisions: readonly GroupChoice[],
  index: number,
  change: (decision: GroupChoice) => GroupChoice,
): GroupChoice[] {
  const changed = [...decisions];
  changed[index] = change(decisions[index] ?? UNDECIDED_GROUP);
  return changed;
}

export function withSkip(decision: GroupChoice, skipped: boolean): GroupChoice {
  return { ...decision, skipped };
}

function withValueAt<Value>(values: readonly Value[], index: number, value: Value, empty: Value): Value[] {
  const changed = Array.from({ length: Math.max(values.length, index + 1) }, (_unused, at) => values[at] ?? empty);
  changed[index] = value;
  return changed;
}

export function withFilledWeight(decision: GroupChoice, setIndex: number, typed: string, unit: UnitPref): GroupChoice {
  const shown = parsedDecimal(typed);
  return {
    ...decision,
    typedWeights: withValueAt(decision.typedWeights, setIndex, typed, ''),
    filledKg: withValueAt(decision.filledKg, setIndex, shown === null ? null : unitToKg(shown, unit), null),
  };
}

export interface GroupSetView {
  text: string;
  asksWeight: boolean;
}

export interface GroupView {
  sets: GroupSetView[];
  notes: string[];
}

export function groupView(
  group: GarminSetGroup,
  decision: GroupChoice,
  exerciseName: string | undefined,
  unit: UnitPref,
): GroupView {
  const loadType = decision.skipped ? undefined : decision.exercise?.loadType;
  const leftOutWeights = new Set<string>();
  const sets = group.sets.map((set): GroupSetView => {
    const weight = formatWeight(set.weightKg, unit);
    const source = loadType === undefined ? null : garminSetWeight(set, loadType, null).source;
    if (source === 'left_out') leftOutWeights.add(weight);
    return {
      text: set.weightKg > 0 ? `${set.reps} × ${weight}` : formatCount(set.reps, 'rep'),
      asksWeight: source === 'asked',
    };
  });
  const notes = [
    group.leftOut > 0 ? `${formatCount(group.leftOut, 'set')} without reps left out.` : null,
    leftOutWeights.size > 0
      ? `${exerciseName ?? 'This exercise'} takes no added weight: ${[...leftOutWeights].join(', ')} left out.`
      : null,
  ].filter((note) => note !== null);
  return { sets, notes };
}

const UNDECIDED_BADGE_TEXT: Record<GarminUndecidedStatus, string> = {
  needs_exercise: 'Needs exercises',
  needs_weight: 'Needs a weight',
  needs_bodyweight: 'Needs your bodyweight',
  nothing_chosen: 'Every group skipped',
};

export function strengthBadgeText(decision: GarminStrengthDecision): string | null {
  return decision.status === 'ready' ? null : UNDECIDED_BADGE_TEXT[decision.status];
}

export function strengthFacts(groups: readonly GarminSetGroup[]): string {
  return `${formatCount(garminUsableSetCount(groups), 'set')} in ${formatCount(groups.length, 'group')}`;
}
