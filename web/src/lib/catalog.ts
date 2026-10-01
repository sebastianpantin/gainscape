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

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other';

export const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'];

export interface Exercise {
  id: string;
  name: string;
  equipment: string;
  modality: Modality;
  loadType: LoadType;
  custom: boolean;
  archived: boolean;
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

export interface ExerciseQuery {
  includeArchived: boolean;
  signal?: AbortSignal;
}

export async function fetchExercises({ includeArchived, signal }: ExerciseQuery): Promise<Exercise[]> {
  let query = supabase
    .from('exercises')
    .select('id, name, equipment, modality, load_type, owner_user_id, archived_at')
    .eq('modality', 'lift')
    .order('name');
  if (!includeArchived) query = query.is('archived_at', null);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    equipment: row.equipment,
    modality: row.modality,
    loadType: row.load_type,
    custom: row.owner_user_id !== null,
    archived: row.archived_at !== null,
  }));
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
