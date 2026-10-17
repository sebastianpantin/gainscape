import type { SupabaseClient } from '@supabase/supabase-js';
import { epley } from '@domain/strength.ts';
import { MAX_SET_LOAD_KG, measuresRepsCapacity, REP_MAX_SLOT_COUNT } from '@domain/types.ts';
import { z } from 'zod';
import { type Exercise, LOAD_TYPES, type LoadType } from '../exercises/catalog-rules.ts';
import { formatLoad } from '../format.ts';
import type { UnitPref } from '../profile/profile-rules.ts';
import { numericColumn, parsedRows } from '../rows.ts';
import { highestWeightInUnit, shownWeight, steppedWeight, unitToKg } from '../units.ts';
import type { RepMaxEntry } from './exercise-progress-rules.ts';

export const LIFT_GOAL_COLUMNS = 'exercise_id, target_kg, reps, target_date, exercises(name, load_type)';
export const GOAL_REP_MAX_COLUMNS = 'exercise_id, reps, load_kg, achieved_at';

export const HIGHEST_GOAL_REPS = REP_MAX_SLOT_COUNT;
const NEW_GOAL_REPS = 5;
const MS_PER_DAY = 86_400_000;

export const liftGoalRowSchema = z.object({
  exercise_id: z.string(),
  target_kg: numericColumn,
  reps: z.number(),
  target_date: z.string().nullable(),
  exercises: z.object({ name: z.string(), load_type: z.enum(LOAD_TYPES).nullable() }),
});

export type LiftGoalRow = z.infer<typeof liftGoalRowSchema>;

export const goalRepMaxRowSchema = z.object({
  exercise_id: z.string(),
  reps: z.number(),
  load_kg: numericColumn,
  achieved_at: z.string(),
});

export type GoalRepMaxRow = z.infer<typeof goalRepMaxRowSchema>;

export interface LiftGoal {
  exerciseId: string;
  exerciseName: string;
  loadType: LoadType;
  targetKg: number;
  reps: number;
  targetDate: string | null;
}

export interface LiftGoalStatus {
  goal: LiftGoal;
  achievedAt: string | null;
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

export function toLiftGoal(row: LiftGoalRow): LiftGoal {
  return {
    exerciseId: row.exercise_id,
    exerciseName: row.exercises.name,
    loadType: row.exercises.load_type ?? 'external',
    targetKg: Number(row.target_kg),
    reps: row.reps,
    targetDate: row.target_date,
  };
}

export function canHaveLiftGoal(exercise: Exercise): boolean {
  return exercise.modality === 'lift' && exercise.measure === undefined && !measuresRepsCapacity(exercise.loadType);
}

export function liftGoalStatus(goal: LiftGoal, repMaxes: readonly GoalRepMaxRow[]): LiftGoalStatus {
  const records = repMaxes
    .filter((row) => row.exercise_id === goal.exerciseId)
    .map((row) => ({ reps: row.reps, loadKg: Number(row.load_kg), achievedAt: row.achieved_at }));
  const achievedAt =
    records
      .filter((record) => record.reps >= goal.reps && record.loadKg >= goal.targetKg)
      .map((record) => record.achievedAt)
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  const estimates = records.filter((record) => record.loadKg > 0).map((record) => epley(record.loadKg, record.reps));
  const bestE1rmKg = estimates.length > 0 ? Math.max(...estimates) : null;
  const targetE1rmKg = epley(goal.targetKg, goal.reps);
  const fraction = achievedAt !== null ? 1 : Math.min(1, (bestE1rmKg ?? 0) / targetE1rmKg);
  return { goal, achievedAt, bestE1rmKg, targetE1rmKg, fraction };
}

export function liftGoalStatuses(goals: readonly LiftGoal[], repMaxes: readonly GoalRepMaxRow[]): LiftGoalStatus[] {
  return goals
    .map((goal) => liftGoalStatus(goal, repMaxes))
    .sort(
      (a, b) =>
        Number(a.achievedAt !== null) - Number(b.achievedAt !== null) ||
        a.goal.exerciseName.localeCompare(b.goal.exerciseName),
    );
}

export async function queryLiftGoals(
  client: SupabaseClient,
  userId: string,
  signal: AbortSignal,
): Promise<LiftGoalStatus[]> {
  const goals = await client.from('lift_goals').select(LIFT_GOAL_COLUMNS).eq('user_id', userId).abortSignal(signal);
  if (goals.error) throw goals.error;
  const parsedGoals = parsedRows(liftGoalRowSchema, goals.data).map(toLiftGoal);
  if (parsedGoals.length === 0) return [];
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
  return liftGoalStatuses(parsedGoals, parsedRows(goalRepMaxRowSchema, repMaxes.data));
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

export function achievedText(achievedAt: string): string {
  return `Achieved ${new Date(achievedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function todayLocalDate(now: Date): string {
  return now.toLocaleDateString('en-CA');
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
