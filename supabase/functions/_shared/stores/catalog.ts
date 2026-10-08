import type { Transaction } from '../db.ts';
import type { CardioEffortLevel, Catalog, ExerciseDef, LoadType, SkillDef } from '../domain/index.ts';
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

interface ExerciseRow {
  id: string;
  modality: string;
  load_type: string | null;
  owner_user_id: string | null;
  reference_pace_s_per_km: number | null;
  pace_unit: string | null;
  max_effort: string | null;
  record_min_distance_m: number | null;
  skill_id: string;
  share_bp: number;
}

function exerciseFromRow(row: ExerciseRow): ExerciseDef {
  const base = { id: row.id, builtIn: row.owner_user_id === null, shares: [] };
  if (row.modality !== 'cardio') return { ...base, modality: 'lift', loadType: row.load_type as LoadType };
  return {
    ...base,
    modality: 'cardio',
    cardio: {
      paceUnit: row.pace_unit === 'per_100m' ? 'per_100m' : 'per_km',
      referencePaceSPerKm: row.reference_pace_s_per_km,
      maxEffort: row.max_effort as CardioEffortLevel,
      recordMinDistanceM: row.record_min_distance_m,
    },
  };
}

async function loadExercisesVisibleTo(
  tx: Transaction,
  userId: string,
  exerciseIds: readonly string[],
  includeArchived = false,
): Promise<Map<string, ExerciseDef>> {
  const rows = await tx<ExerciseRow[]>`
    select e.id, e.modality, e.load_type, e.owner_user_id, e.reference_pace_s_per_km, e.pace_unit, e.max_effort,
           e.record_min_distance_m, es.skill_id, es.share_bp
    from public.exercises e
    join public.exercise_skills es on es.exercise_id = e.id
    where e.id = any(${exerciseIds as string[]}::uuid[])
      and (e.owner_user_id is null or (e.owner_user_id = ${userId} and (${includeArchived} or e.archived_at is null)))`;

  const exercises = new Map<string, ExerciseDef>();
  for (const row of rows) {
    const exercise = exercises.get(row.id) ?? exerciseFromRow(row);
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
