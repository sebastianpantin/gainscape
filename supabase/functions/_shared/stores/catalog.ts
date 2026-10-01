import type { Transaction } from '../db.ts';
import type { Catalog, ExerciseDef, LoadType, SkillDef } from '../domain/index.ts';
import { HttpError } from '../http.ts';

async function loadSkills(tx: Transaction): Promise<SkillDef[]> {
  const rows = await tx`select id, key, sort_order, combat_weight from public.skills`;
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    sortOrder: row.sort_order,
    combatWeight: Number(row.combat_weight),
  }));
}

async function loadExercisesVisibleTo(
  tx: Transaction,
  userId: string,
  exerciseIds: readonly string[],
  includeArchived = false,
): Promise<Map<string, ExerciseDef>> {
  const rows = await tx`
    select e.id, e.load_type, e.owner_user_id, es.skill_id, es.share_bp
    from public.exercises e
    join public.exercise_skills es on es.exercise_id = e.id
    where e.id = any(${exerciseIds as string[]}::uuid[])
      and (e.owner_user_id is null or (e.owner_user_id = ${userId} and (${includeArchived} or e.archived_at is null)))
      and (not e.requires_unlock or exists (
        select 1 from public.user_unlocks u where u.user_id = ${userId} and u.exercise_id = e.id))`;

  const exercises = new Map<string, ExerciseDef>();
  for (const row of rows) {
    const exercise: ExerciseDef = exercises.get(row.id) ?? {
      id: row.id,
      loadType: row.load_type as LoadType,
      builtIn: row.owner_user_id === null,
      shares: [],
    };
    exercise.shares.push({ skillId: row.skill_id, shareBasisPoints: row.share_bp });
    exercises.set(row.id, exercise);
  }
  return exercises;
}

export async function loadCatalog(
  tx: Transaction,
  userId: string,
  exerciseIds: readonly string[],
  includeArchived = false,
): Promise<Catalog> {
  return {
    skills: await loadSkills(tx),
    exercises: await loadExercisesVisibleTo(tx, userId, exerciseIds, includeArchived),
  };
}

export async function loadKnownCatalog(
  tx: Transaction,
  userId: string,
  sets: readonly { exerciseId: string }[],
): Promise<Catalog> {
  const exerciseIds = [...new Set(sets.map((set) => set.exerciseId))];
  const catalog = await loadCatalog(tx, userId, exerciseIds, true);
  const unknownExerciseIds = exerciseIds.filter((id) => !catalog.exercises.has(id));
  if (unknownExerciseIds.length > 0) throw new HttpError(422, 'unknown_exercise', { exerciseIds: unknownExerciseIds });
  return catalog;
}
