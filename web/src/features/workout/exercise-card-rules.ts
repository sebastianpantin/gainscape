import { type PrescriptionSnapshot } from '@domain/index.ts';
import { type CardioExercise, type Exercise, isPlannableExercise } from '../../lib/exercises/catalog-rules.ts';
import type { ExerciseStrengthView } from '../../lib/collection/collection-data.ts';
import { strengthText } from '../../lib/collection/collection-rules.ts';
import type { RecentSessions } from '../../lib/history/last-session-rules.ts';
import type { UnitPref } from '../../lib/profile/profile.ts';
import { fatigueAdvice, nextWeightHint, progressionStep } from '../../lib/workout/progression-rules.ts';
import type { DraftBarbellSetup } from '../../lib/programs/program-set-rules.ts';
import { REST_OFF, restClock, startsRest } from '../../lib/workout/rest-timer-rules.ts';
import { groupOf, restsAfter } from '../../lib/workout/superset-rules.ts';
import { shownWeight, unitToKg } from '../../lib/units.ts';
import {
  routineDrills,
  routineSummary,
  type WarmupRoutine,
  warmupRoutineFor,
} from '../../lib/workout/warmup-routine-rules.ts';
import { warmupPlan, type WarmupRamp } from '../../lib/workout/warmup-rules.ts';
import { type DraftSet, type LiftDraftExercise, type WorkoutDraft } from '../../offline/draft-format.ts';
import {
  addWarmupSets,
  canSwapExercise,
  firstWorkingSet,
  insertWarmupDrills,
  type LastLoggedSet,
  routineDrillsFit,
} from '../../offline/draft-edits.ts';
import { type PendingFocus } from './use-focus-after-removal.ts';

export interface LiftEquipment {
  barbellIds: ReadonlySet<string>;
  compoundIds: ReadonlySet<string>;
}

export type ExerciseMenuChoice = 'superset_with_next' | 'ungroup' | 'swap' | 'remove';

export const EXERCISE_MENU_LABELS: Readonly<Record<ExerciseMenuChoice, string>> = {
  superset_with_next: 'Superset with next',
  ungroup: 'Ungroup',
  swap: 'Swap',
  remove: 'Remove exercise',
};

const STARTING_SETS = 1;

export function removingAsksFirst(exercise: {
  sets: readonly { done: boolean; prescription?: PrescriptionSnapshot | null }[];
}): boolean {
  return exercise.sets.length > STARTING_SETS || exercise.sets.some((set) => set.done || Boolean(set.prescription));
}

export function liftEquipment(exercises: readonly Exercise[]): LiftEquipment {
  const lifts = exercises.filter(isPlannableExercise);
  return {
    barbellIds: new Set(
      lifts
        .filter((exercise) => exercise.equipment === 'barbell' && exercise.loadType === 'external')
        .map((exercise) => exercise.id),
    ),
    compoundIds: new Set(lifts.filter((exercise) => exercise.compound).map((exercise) => exercise.id)),
  };
}

export function isBarbellLift(
  exercise: Pick<LiftDraftExercise, 'exerciseId' | 'loadType'>,
  equipment: LiftEquipment,
): boolean {
  return exercise.loadType === 'external' && equipment.barbellIds.has(exercise.exerciseId);
}

export function exerciseMenuChoices(draft: WorkoutDraft, exerciseIndex: number): ExerciseMenuChoice[] {
  const group = groupOf(draft, exerciseIndex);
  const groupedWithNext = group !== undefined && group.exerciseIndexes.includes(exerciseIndex + 1);
  const choices: ExerciseMenuChoice[] = [];
  if (draft.exercises[exerciseIndex + 1]?.modality === 'lift' && !groupedWithNext) choices.push('superset_with_next');
  if (group !== undefined) choices.push('ungroup');
  if (canSwapExercise(draft, exerciseIndex)) choices.push('swap');
  choices.push('remove');
  return choices;
}

export function liftDetailsText(
  exercise: LiftDraftExercise,
  strength: ExerciseStrengthView | undefined,
  restS: number,
  unit: UnitPref,
): string {
  const doneHere = exercise.sets.filter((set) => set.done).length;
  const details = [
    exercise.target && `${exercise.target.sets} × ${exercise.target.repsMin}–${exercise.target.repsMax}`,
    strengthText(strength, exercise.loadType, unit),
    restS !== REST_OFF && `Rest ${restClock(restS)}`,
  ].filter(Boolean);
  return [...details, `${doneHere}/${exercise.sets.length} sets`].join(' · ');
}

export function liftAdvice(
  exercise: LiftDraftExercise,
  recent: RecentSessions | undefined,
  unit: UnitPref,
  barbell: DraftBarbellSetup | null,
): string | null {
  if (exercise.sets.some((set) => Boolean(set.prescription))) return null;
  const step = progressionStep(unit, barbell ? barbell.plates : null);
  return (
    fatigueAdvice(recent, exercise.loadType, unit, step, barbell ? barbell.barWeight : 0) ??
    nextWeightHint(recent?.[0], exercise.loadType, exercise.target, unit, step)
  );
}

function warmupRampFor(exercise: LiftDraftExercise, unit: UnitPref, barbell: DraftBarbellSetup | null): WarmupRamp {
  if (barbell !== null) return { kind: 'barbell', setup: barbell };
  if (exercise.loadType === 'external') return { kind: 'increment', step: progressionStep(unit, null) };
  return { kind: 'single' };
}

export function warmupsToOffer(
  exercise: LiftDraftExercise,
  unit: UnitPref,
  barbell: DraftBarbellSetup | null,
  roomForSets: number,
): LastLoggedSet[] {
  const workingSet = firstWorkingSet(exercise);
  if (workingSet === undefined || exercise.sets.some((set) => set.isWarmup)) return [];
  const plan = warmupPlan(
    { weight: shownWeight(workingSet.weightKg, unit), reps: workingSet.reps },
    warmupRampFor(exercise, unit, barbell),
  );
  if (plan.length > roomForSets) return [];
  return plan.map(({ weight, reps }) => ({ weightKg: unitToKg(weight, unit), reps }));
}

export interface RoutineOffer {
  routine: WarmupRoutine;
  drills: CardioExercise[];
}

export type WarmupChoice = 'ramp' | 'routine' | 'both';

function cardioRightAbove(draft: WorkoutDraft, exerciseIndex: number): Set<string> {
  const ids = new Set<string>();
  for (let index = exerciseIndex - 1; draft.exercises[index]?.modality === 'cardio'; index--)
    ids.add(draft.exercises[index].exerciseId);
  return ids;
}

export function routineToOffer(
  draft: WorkoutDraft,
  exerciseIndex: number,
  catalog: readonly Exercise[],
): RoutineOffer | null {
  const liftKey = catalog.find((exercise) => exercise.id === draft.exercises[exerciseIndex]?.exerciseId)?.key;
  const routine = warmupRoutineFor(liftKey);
  const drills = routine && routineDrills(routine, catalog);
  if (!routine || !drills) return null;
  const above = cardioRightAbove(draft, exerciseIndex);
  if (drills.some((drill) => above.has(drill.id)) || !routineDrillsFit(draft, drills.length)) return null;
  return { routine, drills };
}

export function warmupChoices(rampSetCount: number, routine: RoutineOffer | null, roomForSets: number): WarmupChoice[] {
  const choices: WarmupChoice[] = [];
  if (rampSetCount > 0) choices.push('ramp');
  if (routine === null) return choices;
  choices.push('routine');
  if (rampSetCount > 0 && rampSetCount + routine.drills.length <= roomForSets) choices.push('both');
  return choices;
}

export function warmupButtonLabel(choices: readonly WarmupChoice[], routine: RoutineOffer | null): string {
  return choices.length === 1 && choices[0] === 'routine' && routine
    ? `+ Add ${routine.routine.name}`
    : '+ Add warm-ups';
}

function loadedSetsText(count: number): string {
  return `${count} loaded ${count === 1 ? 'set' : 'sets'}`;
}

export function warmupChoiceText(
  choice: WarmupChoice,
  rampSetCount: number,
  routine: RoutineOffer,
): { label: string; hint: string } {
  if (choice === 'ramp') return { label: 'Ramp sets', hint: loadedSetsText(rampSetCount) };
  if (choice === 'routine') return { label: routine.routine.name, hint: routineSummary(routine.routine) };
  return { label: 'Both', hint: `The routine, then ${loadedSetsText(rampSetCount)}` };
}

export function withChosenWarmup(
  draft: WorkoutDraft,
  exerciseIndex: number,
  choice: WarmupChoice,
  rampSets: readonly LastLoggedSet[],
  routine: RoutineOffer | null,
): WorkoutDraft {
  const withRamp = choice === 'routine' ? draft : addWarmupSets(draft, exerciseIndex, rampSets);
  if (choice === 'ramp' || routine === null) return withRamp;
  return insertWarmupDrills(withRamp, exerciseIndex, routine.drills);
}

export function warmupButtonKey(clientId: string): string {
  return `warmups-${clientId}`;
}

export function warmupFocusAfter(draft: WorkoutDraft, next: WorkoutDraft, exerciseIndex: number): PendingFocus {
  const lift = draft.exercises[exerciseIndex];
  const firstDrill = next.exercises[exerciseIndex];
  if (firstDrill === undefined || firstDrill.clientId === lift?.clientId)
    return { setId: null, addKey: warmupButtonKey(lift?.clientId ?? '') };
  return { setId: firstDrill.sets[0]?.id ?? null, addKey: firstDrill.clientId };
}

export function restStartsAfterChange(
  draft: WorkoutDraft,
  exerciseIndex: number,
  set: DraftSet,
  changes: Partial<Omit<DraftSet, 'id'>>,
): boolean {
  return startsRest(set, changes) && restsAfter(draft, exerciseIndex, set.id);
}
