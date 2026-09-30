export interface PlannedExercise {
  exercise: string;
  sets: number;
}

export interface TrainingDay {
  exercises: PlannedExercise[];
}

export interface LifterProfile {
  name: string;
  weeklyDays: TrainingDay[];
  dayOffsets: number[];
  repRange: readonly [number, number];
  rirRange: readonly [number, number];
}

export const STARTING_E1RM_KG: Readonly<Record<string, number>> = {
  barbell_bench_press: 60,
  back_squat: 80,
  romanian_deadlift: 90,
  barbell_row: 50,
  overhead_press: 35,
  lat_pulldown: 50,
  leg_press: 120,
  barbell_curl: 25,
  cable_triceps_pushdown: 25,
  leg_curl: 40,
  standing_calf_raise: 60,
  cable_crunch: 30,
};

const upperDay: TrainingDay = {
  exercises: [
    { exercise: 'barbell_bench_press', sets: 4 },
    { exercise: 'barbell_row', sets: 4 },
    { exercise: 'overhead_press', sets: 3 },
    { exercise: 'lat_pulldown', sets: 3 },
    { exercise: 'barbell_curl', sets: 3 },
    { exercise: 'cable_triceps_pushdown', sets: 3 },
  ],
};

const lowerDay: TrainingDay = {
  exercises: [
    { exercise: 'back_squat', sets: 4 },
    { exercise: 'romanian_deadlift', sets: 4 },
    { exercise: 'leg_press', sets: 3 },
    { exercise: 'leg_curl', sets: 3 },
    { exercise: 'standing_calf_raise', sets: 3 },
    { exercise: 'cable_crunch', sets: 3 },
  ],
};

const fullBodyDay: TrainingDay = {
  exercises: [
    { exercise: 'back_squat', sets: 3 },
    { exercise: 'barbell_bench_press', sets: 3 },
    { exercise: 'barbell_row', sets: 3 },
    { exercise: 'overhead_press', sets: 2 },
    { exercise: 'romanian_deadlift', sets: 2 },
    { exercise: 'barbell_curl', sets: 2 },
    { exercise: 'cable_crunch', sets: 2 },
  ],
};

const upperLowerFourDays = [upperDay, lowerDay, upperDay, lowerDay];

export const PROFILES: Readonly<Record<'hypertrophy' | 'strength' | 'balanced' | 'casual', LifterProfile>> = {
  hypertrophy: {
    name: 'hypertrophy',
    weeklyDays: upperLowerFourDays,
    dayOffsets: [0, 1, 3, 4],
    repRange: [8, 12],
    rirRange: [1, 2],
  },
  strength: {
    name: 'strength',
    weeklyDays: upperLowerFourDays,
    dayOffsets: [0, 1, 3, 4],
    repRange: [3, 5],
    rirRange: [1, 3],
  },
  balanced: {
    name: 'balanced',
    weeklyDays: [fullBodyDay, fullBodyDay, fullBodyDay],
    dayOffsets: [0, 2, 4],
    repRange: [6, 10],
    rirRange: [1, 3],
  },
  casual: {
    name: 'casual',
    weeklyDays: [fullBodyDay, fullBodyDay],
    dayOffsets: [0, 3],
    repRange: [10, 10],
    rirRange: [2, 4],
  },
};
