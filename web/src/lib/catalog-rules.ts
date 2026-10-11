import type { CardioEffortLevel } from '@domain/types.ts';

export const MODALITIES = ['lift', 'cardio'] as const;
export type Modality = (typeof MODALITIES)[number];

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
  tracksDistance: boolean;
  shares: ActivityShare[];
}

export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other';

export const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'];

export const PACE_UNITS: PaceUnit[] = ['per_km', 'per_100m'];

export interface ExerciseSkill {
  skillKey: string;
  skillName: string;
  shareBasisPoints: number;
}

interface ExerciseBase {
  id: string;
  key?: string | null;
  name: string;
  equipment: string;
  custom: boolean;
  archived: boolean;
  skillShares: ExerciseSkill[];
}

export type HoldMeasure = 'time' | 'distance';

export interface LiftExercise extends ExerciseBase {
  modality: 'lift';
  loadType: LoadType;
  compound?: boolean;
  measure?: HoldMeasure;
}

export interface CardioExercise extends ExerciseBase {
  modality: 'cardio';
  activity: CardioActivity;
}

export type Exercise = LiftExercise | CardioExercise;

export function isLiftExercise(exercise: Exercise): exercise is LiftExercise {
  return exercise.modality === 'lift';
}

export function isCardioExercise(exercise: Exercise): exercise is CardioExercise {
  return exercise.modality === 'cardio';
}

export const EXERCISE_COLUMNS =
  'id, key, name, equipment, modality, load_type, owner_user_id, archived_at, reference_pace_s_per_km, pace_unit, max_effort, tracks_distance, measure, exercise_skills(share_bp, skills(key, name))';

export interface ExerciseRow {
  id: string;
  key?: string | null;
  name: string;
  equipment: string;
  modality: Modality;
  load_type: LoadType | null;
  owner_user_id: string | null;
  archived_at: string | null;
  reference_pace_s_per_km: number | null;
  pace_unit: PaceUnit | null;
  max_effort: CardioEffortLevel | null;
  tracks_distance: boolean;
  measure?: 'reps' | HoldMeasure;
  exercise_skills: { share_bp: number; skills: { key: string; name: string } | null }[];
}

const WHOLE_SHARE_BP = 10_000;
const SINGLE_SKILL_SHARE_BP = 8_000;

export function isCompoundLift(equipment: string, shareBasisPoints: readonly number[]): boolean {
  const largest = Math.max(0, ...shareBasisPoints);
  if (largest === 0) return false;
  return largest < SINGLE_SKILL_SHARE_BP || (equipment === 'barbell' && largest < WHOLE_SHARE_BP);
}

function skillSharesOf(row: ExerciseRow): ExerciseSkill[] {
  return row.exercise_skills
    .flatMap((share) =>
      share.skills
        ? [{ skillKey: share.skills.key, skillName: share.skills.name, shareBasisPoints: share.share_bp }]
        : [],
    )
    .sort((a, b) => b.shareBasisPoints - a.shareBasisPoints || a.skillName.localeCompare(b.skillName));
}

export function toExercise(row: ExerciseRow): Exercise {
  const base = {
    id: row.id,
    key: row.key,
    name: row.name,
    equipment: row.equipment,
    custom: row.owner_user_id !== null,
    archived: row.archived_at !== null,
    skillShares: skillSharesOf(row),
  };
  if (row.modality === 'lift') {
    const compound = isCompoundLift(
      row.equipment,
      row.exercise_skills.map((share) => share.share_bp),
    );
    const measure = row.measure === 'time' || row.measure === 'distance' ? { measure: row.measure } : {};
    return { ...base, modality: 'lift', loadType: row.load_type ?? 'external', compound, ...measure };
  }
  return {
    ...base,
    modality: 'cardio',
    activity: {
      paceUnit: row.pace_unit ?? 'per_km',
      referencePaceSPerKm: row.reference_pace_s_per_km,
      maxEffort: row.max_effort ?? 'max',
      tracksDistance: row.tracks_distance,
      shares: row.exercise_skills.flatMap((share) =>
        share.skills ? [{ skillKey: share.skills.key, shareBasisPoints: share.share_bp }] : [],
      ),
    },
  };
}

export function exerciseLabels(exercise: Exercise): string {
  return [exercise.custom && '(custom)', exercise.archived && '(archived)'].filter(Boolean).join(' ');
}
