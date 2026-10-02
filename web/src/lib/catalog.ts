import { type Exercise, type ExerciseRow, type Skill, toExercise } from './catalog-rules.ts';
import { supabase } from './supabase.ts';

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

export async function fetchSkillXp(userId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('user_skills').select('skill_id, xp').eq('user_id', userId);
  if (error) throw error;
  return new Map(data.map((row) => [row.skill_id, Number(row.xp)]));
}
