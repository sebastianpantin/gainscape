import type {
  CardioExerciseDef,
  CardioProfile,
  Catalog,
  LiftExerciseDef,
  SkillDef,
} from '../../supabase/functions/_shared/domain/index.ts';

export const SIM_SKILLS: SkillDef[] = [
  { id: 'chest', key: 'chest', sortOrder: 1, combatWeight: 2 },
  { id: 'back', key: 'back', sortOrder: 2, combatWeight: 2 },
  { id: 'shoulders', key: 'shoulders', sortOrder: 3, combatWeight: 2 },
  { id: 'arms', key: 'arms', sortOrder: 4, combatWeight: 1 },
  { id: 'legs', key: 'legs', sortOrder: 5, combatWeight: 2 },
  { id: 'core', key: 'core', sortOrder: 6, combatWeight: 1 },
];

export const SIM_EXERCISE_SHARES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  barbell_bench_press: { chest: 7000, shoulders: 2000, arms: 1000 },
  barbell_row: { back: 7000, arms: 2000, core: 1000 },
  overhead_press: { shoulders: 7000, arms: 2000, core: 1000 },
  lat_pulldown: { back: 7500, arms: 2500 },
  barbell_curl: { arms: 10000 },
  cable_triceps_pushdown: { arms: 10000 },
  back_squat: { legs: 9000, core: 1000 },
  romanian_deadlift: { legs: 7000, back: 2000, core: 1000 },
  leg_press: { legs: 10000 },
  leg_curl: { legs: 10000 },
  standing_calf_raise: { legs: 10000 },
  cable_crunch: { core: 10000 },
};

function exerciseDef(key: string): LiftExerciseDef {
  const shares = Object.entries(SIM_EXERCISE_SHARES[key]).map(([skillId, shareBasisPoints]) => ({
    skillId,
    shareBasisPoints,
  }));
  return { id: key, loadType: 'external', builtIn: true, shares };
}

export const SIM_CATALOG: Catalog = {
  skills: SIM_SKILLS,
  exercises: new Map(Object.keys(SIM_EXERCISE_SHARES).map((key) => [key, exerciseDef(key)])),
};

export function shareOf(exerciseKey: string, skillKey: string): number {
  return (SIM_EXERCISE_SHARES[exerciseKey][skillKey] ?? 0) / 10_000;
}

export const CARDIO_SIM_SKILLS: SkillDef[] = [
  { id: 'endurance', key: 'endurance', sortOrder: 7, combatWeight: 0 },
  { id: 'agility', key: 'agility', sortOrder: 8, combatWeight: 0 },
];

export interface CardioSimExercise {
  cardio: CardioProfile;
  shares: Readonly<Record<string, number>>;
}

export const CARDIO_SIM_EXERCISES: Readonly<Record<string, CardioSimExercise>> = {
  running: {
    cardio: { referencePaceSPerKm: 360, maxEffort: 'max', recordMinDistanceM: 1000 },
    shares: { endurance: 10000 },
  },
  sprint_intervals: {
    cardio: { referencePaceSPerKm: null, maxEffort: 'max', recordMinDistanceM: null },
    shares: { agility: 10000 },
  },
  jump_rope: {
    cardio: { referencePaceSPerKm: null, maxEffort: 'max', recordMinDistanceM: null },
    shares: { agility: 10000 },
  },
};

function cardioExerciseDef(key: string): CardioExerciseDef {
  const { cardio, shares } = CARDIO_SIM_EXERCISES[key];
  return {
    id: key,
    modality: 'cardio',
    cardio,
    builtIn: true,
    shares: Object.entries(shares).map(([skillId, shareBasisPoints]) => ({ skillId, shareBasisPoints })),
  };
}

export const CARDIO_SIM_CATALOG: Catalog = {
  skills: CARDIO_SIM_SKILLS,
  exercises: new Map(Object.keys(CARDIO_SIM_EXERCISES).map((key) => [key, cardioExerciseDef(key)])),
};
