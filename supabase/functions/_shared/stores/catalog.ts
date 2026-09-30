import type { Transaction } from '../db.ts';
import type { Catalog, ExerciseDef, LoadType, SkillDef } from '../domain/index.ts';

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
      and (e.owner_user_id is null or (e.owner_user_id = ${userId} and (${includeArchived} or e.archived_at is null)))`;

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
