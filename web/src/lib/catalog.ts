import type { CardioEffortLevel } from '@domain/types.ts';
import { supabase } from './supabase.ts';

export type Modality = 'lift' | 'cardio';

export interface Skill {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  combatWeight: number;
  modality: Modality;
}

export type LoadType = 'external' | 'bodyweight' | 'bodyweight_plus';

export const LOAD_TYPES: LoadType[] = ['external', 'bodyweight', 'bodyweight_plus'];

export type PaceUnit = 'per_km' | 'per_100m';

export interface ActivityShare {
  skillKey: string;
  shareBasisPoints: number;
}

export interface CardioActivity {
  paceUnit: PaceUnit;
  referencePaceSPerKm: number | null;
  maxEffort: CardioEffortLevel;
  shares: ActivityShare[];
}

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other';

export const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'];

export const PACE_UNITS: PaceUnit[] = ['per_km', 'per_100m'];

interface ExerciseBase {
  id: string;
  name: string;
  equipment: string;
  custom: boolean;
  archived: boolean;
}

export interface LiftExercise extends ExerciseBase {
  modality: 'lift';
  loadType: LoadType;
}

export interface CardioExercise extends ExerciseBase {
  modality: 'cardio';
  activity: CardioActivity;
}

export type Exercise = LiftExercise | CardioExercise;

export function isLiftExercise(exercise: Exercise): exercise is LiftExercise {
  return exercise.modality === 'lift';
}

export async function fetchSkills(): Promise<Skill[]> {
  const { data, error } = await supabase
    .from('skills')
    .select('id, key, name, sort_order, combat_weight, modality')
    .order('sort_order');
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    sortOrder: row.sort_order,
    combatWeight: Number(row.combat_weight),
    modality: row.modality,
  }));
}

const EXERCISE_COLUMNS =
  'id, name, equipment, modality, load_type, owner_user_id, archived_at, reference_pace_s_per_km, pace_unit, max_effort, exercise_skills(share_bp, skills(key))';

export interface ExerciseRow {
  id: string;
  name: string;
  equipment: string;
  modality: Modality;
  load_type: LoadType | null;
  owner_user_id: string | null;
  archived_at: string | null;
  reference_pace_s_per_km: number | null;
  pace_unit: PaceUnit | null;
  max_effort: CardioEffortLevel | null;
  exercise_skills: { share_bp: number; skills: { key: string } | null }[];
}

export function toExercise(row: ExerciseRow): Exercise {
  const base = {
    id: row.id,
    name: row.name,
    equipment: row.equipment,
    custom: row.owner_user_id !== null,
    archived: row.archived_at !== null,
  };
  if (row.modality === 'lift') return { ...base, modality: 'lift', loadType: row.load_type ?? 'external' };
  return {
    ...base,
    modality: 'cardio',
    activity: {
      paceUnit: row.pace_unit ?? 'per_km',
      referencePaceSPerKm: row.reference_pace_s_per_km,
      maxEffort: row.max_effort ?? 'max',
      shares: row.exercise_skills.flatMap((share) =>
        share.skills ? [{ skillKey: share.skills.key, shareBasisPoints: share.share_bp }] : [],
      ),
    },
  };
}

export interface ExerciseQuery {
  includeArchived: boolean;
  signal?: AbortSignal;
}

export async function fetchExercises({ includeArchived, signal }: ExerciseQuery): Promise<Exercise[]> {
  let query = supabase.from('exercises').select(EXERCISE_COLUMNS).order('name');
  if (!includeArchived) query = query.is('archived_at', null);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as ExerciseRow[]).map(toExercise);
}

export function exerciseLabels(exercise: Exercise): string {
  return [exercise.custom && '(custom)', exercise.archived && '(archived)'].filter(Boolean).join(' ');
}

export async function saveBodyweight(userId: string, bodyweightKg: number): Promise<void> {
  const { error } = await supabase
    .from('profile_private')
    .update({ bodyweight_kg: bodyweightKg })
    .eq('user_id', userId);
  if (error) throw error;
}

export async function fetchSkillXp(userId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('user_skills').select('skill_id, xp').eq('user_id', userId);
  if (error) throw error;
  return new Map(data.map((row) => [row.skill_id, Number(row.xp)]));
}
