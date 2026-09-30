import type { Equipment, LoadType } from './catalog.ts';
import { supabase } from './supabase.ts';

export interface SkillShare {
  skillId: string;
  shareBp: number;
}

export interface CustomExerciseDoc {
  id: string;
  name: string;
  loadType: LoadType;
  equipment: Equipment;
  shares: SkillShare[];
}

export const NAME_TAKEN_MESSAGE =
  'You already have an exercise with this name (it may be archived) — unarchive or rename it.';

function describeSaveError(message: string): string {
  return message === 'name_taken' ? NAME_TAKEN_MESSAGE : message;
}

export async function saveCustomExercise(exercise: CustomExerciseDoc): Promise<void> {
  const { error } = await supabase.rpc('save_custom_exercise', { exercise });
  if (error) throw new Error(describeSaveError(error.message));
}

export async function setCustomExerciseArchived(exerciseId: string, archived: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_custom_exercise_archived', { exercise_id: exerciseId, archived });
  if (error) throw error;
}

export async function fetchExerciseShares(exerciseId: string): Promise<SkillShare[]> {
  const { data, error } = await supabase
    .from('exercise_skills')
    .select('skill_id, share_bp')
    .eq('exercise_id', exerciseId);
  if (error) throw error;
  return data.map((row) => ({ skillId: row.skill_id, shareBp: row.share_bp }));
}

export async function hasLoggedSet(exerciseId: string): Promise<boolean> {
  const { data, error } = await supabase.from('sets').select('id').eq('exercise_id', exerciseId).limit(1);
  if (error) throw error;
  return data.length > 0;
}
