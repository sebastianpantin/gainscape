import { z } from 'zod';
import {
  EXERCISE_COLUMNS,
  type Exercise,
  exerciseRowSchema,
  MODALITIES,
  type Skill,
  toExercise,
} from './catalog-rules.ts';
import { numericColumn, parsedRows } from '../rows.ts';
import { supabase } from '../platform/supabase.ts';

const skillRowSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  sort_order: z.number(),
  combat_weight: numericColumn,
  modality: z.enum(MODALITIES),
});

const skillXpRowSchema = z.object({ skill_id: z.string(), xp: numericColumn });

export async function fetchSkills(): Promise<Skill[]> {
  const { data, error } = await supabase
    .from('skills')
    .select('id, key, name, sort_order, combat_weight, modality')
    .order('sort_order');
  if (error) throw error;
  return parsedRows(skillRowSchema, data).map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    sortOrder: row.sort_order,
    combatWeight: Number(row.combat_weight),
    modality: row.modality,
  }));
}

interface ExerciseQuery {
  includeArchived: boolean;
  signal?: AbortSignal;
}

export async function fetchExercises({ includeArchived, signal }: ExerciseQuery): Promise<Exercise[]> {
  let query = supabase.from('exercises').select(EXERCISE_COLUMNS).order('name');
  if (!includeArchived) query = query.is('archived_at', null);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return parsedRows(exerciseRowSchema, data).map(toExercise);
}

export async function fetchSkillXp(userId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('user_skills').select('skill_id, xp').eq('user_id', userId);
  if (error) throw error;
  return new Map(parsedRows(skillXpRowSchema, data).map((row) => [row.skill_id, Number(row.xp)]));
}
