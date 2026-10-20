import type { SupabaseClient } from '@supabase/supabase-js';
import { MS_PER_DAY } from '@domain/math.ts';
import { MAX_SET_LOAD_KG, measuresRepsCapacity, REP_MAX_SLOT_COUNT } from '@domain/types.ts';
import { z } from 'zod';
import { LOAD_TYPES, type LoadType, MODALITIES, type Modality } from '../exercises/catalog-rules.ts';
import { formatLoad } from '../format.ts';
import type { UnitPref } from '../profile/profile-rules.ts';
import { numericColumn, parsedRows } from '../rows.ts';
import { highestWeightInUnit, shownWeight, steppedWeight, unitToKg } from '../units.ts';
import { liftE1rmKg, type RepMaxEntry } from './exercise-progress-rules.ts';

const LIFT_GOAL_COLUMNS =
  'exercise_id, target_kg, reps, target_date, exercises(name, modality, load_type, measure, archived_at)';
const GOAL_REP_MAX_COLUMNS = 'exercise_id, reps, load_kg';

export const HIGHEST_GOAL_REPS = REP_MAX_SLOT_COUNT;
const NEW_GOAL_REPS = 5;
const UNACHIEVED_PROGRESS_CAP = 0.99;
export const GOAL_REACHED_TEXT = 'Goal reached';

export const liftGoalRowSchema = z.object({
  exercise_id: z.string(),
  target_kg: numericColumn,
  reps: z.number(),
  target_date: z.string().nullable(),
  exercises: z.object({
    name: z.string(),
    modality: z.enum(MODALITIES),
    load_type: z.enum(LOAD_TYPES).nullable(),
    measure: z.enum(['reps', 'time', 'distance']).optional(),
    archived_at: z.string().nullable(),
  }),
});

export type LiftGoalRow = z.infer<typeof liftGoalRowSchema>;

export const goalRepMaxRowSchema = z.object({
  exercise_id: z.string(),
  reps: z.number(),
  load_kg: numericColumn,
});

export type GoalRepMaxRow = z.infer<typeof goalRepMaxRowSchema>;

export interface LiftGoal {
  exerciseId: string;
  exerciseName: string;
  loadType: LoadType;
  targetKg: number;
  reps: number;
  targetDate: string | null;
  archived: boolean;
  trackable: boolean;
}

export interface LiftGoalsLoad {
  goals: LiftGoal[];
  repMaxes: GoalRepMaxRow[];
}

interface LiftGoalStatus {
  goal: LiftGoal;
  achieved: boolean;
  bestE1rmKg: number | null;
  targetE1rmKg: number;
  fraction: number;
}

export interface LiftGoalDraft {
  weight: number;
  reps: number;
  targetDate: string;
}

export interface LiftGoalInput {
  exerciseId: string;
  targetKg: number;
  reps: number;
  targetDate: string | null;
}

interface GoalExercise {
  modality: Modality;
  loadType?: LoadType;
  measure?: string;
}

export function canHaveLiftGoal({ modality, loadType, measure }: GoalExercise): boolean {
  return (
    modality === 'lift' &&
    (measure === undefined || measure === 'reps') &&
    loadType !== undefined &&
    !measuresRepsCapacity(loadType)
  );
}

export function toLiftGoal(row: LiftGoalRow): LiftGoal {
  const loadType = row.exercises.load_type ?? 'external';
  return {
    exerciseId: row.exercise_id,
    exerciseName: row.exercises.name,
    loadType,
    targetKg: Number(row.target_kg),
    reps: row.reps,
    targetDate: row.target_date,
    archived: row.exercises.archived_at !== null,
    trackable: canHaveLiftGoal({ modality: row.exercises.modality, loadType, measure: row.exercises.measure }),
  };
}

export function liftGoalStatus(
  goal: LiftGoal,
  repMaxes: readonly GoalRepMaxRow[],
  bodyweightKg: number | null,
): LiftGoalStatus {
  const countedBodyweightKg = goal.loadType === 'bodyweight_plus' ? (bodyweightKg ?? 0) : 0;
  const estimate = (loadKg: number, reps: number) =>
    liftE1rmKg(loadKg + countedBodyweightKg, countedBodyweightKg, reps);
  const records = repMaxes
    .filter((row) => row.exercise_id === goal.exerciseId)
    .map((row) => ({ reps: row.reps, loadKg: Number(row.load_kg) }));
  const achieved = records.some((record) => record.reps >= goal.reps && record.loadKg >= goal.targetKg);
  const estimates = records.flatMap((record) => estimate(record.loadKg, record.reps) ?? []);
  const bestE1rmKg = estimates.length > 0 ? Math.max(...estimates) : null;
  const targetE1rmKg = estimate(goal.targetKg, goal.reps) ?? 0;
  const fraction = achieved ? 1 : Math.min(UNACHIEVED_PROGRESS_CAP, (bestE1rmKg ?? 0) / targetE1rmKg);
  return { goal, achieved, bestE1rmKg, targetE1rmKg, fraction };
}

export function liftGoalStatuses(
  goals: readonly LiftGoal[],
  repMaxes: readonly GoalRepMaxRow[],
  bodyweightKg: number | null,
): LiftGoalStatus[] {
  return goals
    .map((goal) => liftGoalStatus(goal, repMaxes, bodyweightKg))
    .sort((a, b) => Number(a.achieved) - Number(b.achieved) || a.goal.exerciseName.localeCompare(b.goal.exerciseName));
}

export function goalsForToday(statuses: readonly LiftGoalStatus[]): LiftGoalStatus[] {
  return statuses.filter(({ goal }) => goal.trackable && !goal.archived);
}

export function liftGoalHint(status: LiftGoalStatus, unit: UnitPref): string | null {
  if (status.achieved || status.bestE1rmKg === null || status.bestE1rmKg < status.targetE1rmKg) return null;
  const { goal } = status;
  return `Hit ${goal.reps} reps at ${formatLoad(goal.targetKg, goal.loadType, unit)} to reach it`;
}

export async function queryLiftGoals(
  client: SupabaseClient,
  userId: string,
  signal: AbortSignal,
): Promise<LiftGoalsLoad> {
  const goals = await client.from('lift_goals').select(LIFT_GOAL_COLUMNS).eq('user_id', userId).abortSignal(signal);
  if (goals.error) throw goals.error;
  const parsedGoals = parsedRows(liftGoalRowSchema, goals.data).map(toLiftGoal);
  if (parsedGoals.length === 0) return { goals: [], repMaxes: [] };
  const repMaxes = await client
    .from('rep_maxes')
    .select(GOAL_REP_MAX_COLUMNS)
    .eq('user_id', userId)
    .in(
      'exercise_id',
      parsedGoals.map((goal) => goal.exerciseId),
    )
    .abortSignal(signal);
  if (repMaxes.error) throw repMaxes.error;
  return { goals: parsedGoals, repMaxes: parsedRows(goalRepMaxRowSchema, repMaxes.data) };
}

export async function saveLiftGoalWith(client: SupabaseClient, input: LiftGoalInput): Promise<void> {
  const { error } = await client.rpc('save_lift_goal', {
    exercise_id: input.exerciseId,
    target_kg: input.targetKg,
    reps: input.reps,
    target_date: input.targetDate,
  });
  if (error) throw error;
}

export async function removeLiftGoalWith(client: SupabaseClient, exerciseId: string): Promise<void> {
  const { error } = await client.from('lift_goals').delete().eq('exercise_id', exerciseId);
  if (error) throw error;
}

function dayNumber(localDate: string): number {
  return Date.parse(`${localDate}T00:00:00Z`) / MS_PER_DAY;
}

export function deadlineText(targetDate: string | null, today: string): string | null {
  if (targetDate === null) return null;
  const days = dayNumber(targetDate) - dayNumber(today);
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
}

function shortDateText(localDate: string): string {
  return new Date(`${localDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function liftGoalTargetText(goal: LiftGoal, unit: UnitPref): string {
  const target = `${formatLoad(goal.targetKg, goal.loadType, unit)} × ${goal.reps}`;
  return goal.targetDate === null ? target : `${target} by ${shortDateText(goal.targetDate)}`;
}

export function liftGoalProgressText(status: LiftGoalStatus, unit: UnitPref): string {
  const target = formatLoad(status.targetE1rmKg, status.goal.loadType, unit);
  if (status.bestE1rmKg === null) return `No e1RM yet for ${target}`;
  return `Best e1RM ${formatLoad(status.bestE1rmKg, status.goal.loadType, unit)} of ${target}`;
}

export function todayLocalDate(now: Date, timeZone?: string): string {
  return now.toLocaleDateString('en-CA', { timeZone });
}

export function earliestTargetDate(savedDate: string, today: string): string {
  return savedDate !== '' && savedDate < today ? savedDate : today;
}

export function goalWeightLabels(loadType: LoadType, unit: UnitPref): { label: string; accessibleName: string } {
  return loadType === 'bodyweight_plus'
    ? { label: `Added weight (+${unit})`, accessibleName: `Goal added weight in ${unit}` }
    : { label: `Weight (${unit})`, accessibleName: `Goal weight in ${unit}` };
}

export function highestGoalWeight(unit: UnitPref): number {
  return highestWeightInUnit(MAX_SET_LOAD_KG, unit);
}

export function liftGoalDraft(goal: LiftGoal | null, repMaxes: readonly RepMaxEntry[], unit: UnitPref): LiftGoalDraft {
  if (goal) return { weight: shownWeight(goal.targetKg, unit), reps: goal.reps, targetDate: goal.targetDate ?? '' };
  const currentKg = repMaxes.find((entry) => entry.reps === NEW_GOAL_REPS)?.loadKg ?? 0;
  return {
    weight: steppedWeight(shownWeight(currentKg, unit), unit, 1, highestGoalWeight(unit)),
    reps: NEW_GOAL_REPS,
    targetDate: '',
  };
}

export function liftGoalInput(exerciseId: string, draft: LiftGoalDraft, unit: UnitPref): LiftGoalInput {
  return {
    exerciseId,
    targetKg: unitToKg(draft.weight, unit),
    reps: draft.reps,
    targetDate: draft.targetDate === '' ? null : draft.targetDate,
  };
}
