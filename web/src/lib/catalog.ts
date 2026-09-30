import { supabase } from './supabase.ts';

export interface Skill {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  combatWeight: number;
}

const LOAD_TYPE_CHECK_TIMEOUT_MS = 5000;

export type LoadType = 'external' | 'bodyweight' | 'bodyweight_plus';

export interface Exercise {
  id: string;
  name: string;
  equipment: string;
  loadType: LoadType;
}

export async function fetchSkills(): Promise<Skill[]> {
  const { data, error } = await supabase
    .from('skills')
    .select('id, key, name, sort_order, combat_weight')
    .order('sort_order');
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    sortOrder: row.sort_order,
    combatWeight: Number(row.combat_weight),
  }));
}

export async function fetchBuiltInExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, equipment, load_type')
    .is('owner_user_id', null)
    .is('archived_at', null)
    .order('name');
  if (error) throw error;
  return data.map((row) => ({ id: row.id, name: row.name, equipment: row.equipment, loadType: row.load_type }));
}

export async function fetchLoadTypes(exerciseIds: string[]): Promise<Map<string, LoadType>> {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, load_type')
    .in('id', exerciseIds)
    .abortSignal(AbortSignal.timeout(LOAD_TYPE_CHECK_TIMEOUT_MS));
  if (error) throw error;
  return new Map(data.map((row) => [row.id, row.load_type]));
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
