import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { type z } from 'zod';
import { exerciseRowSchema } from '../../web/src/lib/exercises/catalog-rules.ts';
import { queryExerciseNotes } from '../../web/src/lib/exercises/exercise-note-rules.ts';
import { challengeRowSchema } from '../../web/src/lib/collection/challenge-rules.ts';
import { inventoryRowSchema, itemRowSchema, recipeRowSchema } from '../../web/src/lib/collection/item-rules.ts';
import { recentLiftRowSchema, recentSessionsByExercise } from '../../web/src/lib/history/last-session-rules.ts';
import { programTemplateRowSchema } from '../../web/src/lib/programs/program-enroll-rules.ts';
import { enrollmentFactsRowsSchema, enrollmentRowSchema } from '../../web/src/lib/programs/program-facts-rules.ts';
import { programRowSchema } from '../../web/src/lib/programs/program-row-rules.ts';
import {
  bodyweightEntryRowSchema,
  workoutBodyweightRowSchema,
} from '../../web/src/lib/progress/bodyweight-trend-rules.ts';
import {
  maxRepsRowSchema,
  progressSetRowSchema,
  repMaxRowSchema,
  sessionProgress,
} from '../../web/src/lib/progress/exercise-progress-rules.ts';
import { queryRecentSets } from '../../web/src/lib/progress/recovery-rules.ts';
import { goalRepMaxRowSchema, liftGoalRowSchema } from '../../web/src/lib/progress/lift-goal-rules.ts';
import { weeklyGoalWeekRowSchema } from '../../web/src/lib/progress/weekly-goal-rules.ts';
import {
  questCompletionRowSchema,
  questProgressRowSchema,
  questRowSchema,
} from '../../web/src/lib/quests/quest-rules.ts';
import { UNREADABLE_ROWS_TEXT } from '../../web/src/lib/rows.ts';

const ID = '11111111-1111-4111-8111-111111111111';

const ENROLLMENT_ROW = {
  id: ID,
  template_key: 'madcow',
  template_version: 1,
  unit: 'kg',
  options: { variant: 'classic', weeks: 4 },
  lift_bindings: { squat: ID, bench: null },
  inputs: { squat: { fiveRm: 100 } },
  rounding: { increment: 2.5, mode: 'nearest', barWeight: 20 },
  started_at: '2026-10-01T08:00:00Z',
  ended_at: null,
};

interface SchemaCase {
  name: string;
  schema: z.ZodType;
  row: Record<string, unknown>;
  broken: Record<string, unknown>;
}

const CASES: SchemaCase[] = [
  {
    name: 'exercise',
    schema: exerciseRowSchema,
    row: {
      id: ID,
      key: 'bench',
      name: 'Bench',
      equipment: 'barbell',
      modality: 'lift',
      load_type: 'external',
      owner_user_id: null,
      archived_at: null,
      reference_pace_s_per_km: null,
      pace_unit: null,
      max_effort: null,
      tracks_distance: false,
      measure: 'reps',
      exercise_skills: [{ share_bp: 7000, skills: { key: 'chest', name: 'Chest' } }],
    },
    broken: { modality: 'swim' },
  },
  {
    name: 'progress set',
    schema: progressSetRowSchema,
    row: {
      session_id: ID,
      weight_kg: '100.00',
      effective_load_kg: 100,
      reps: 5,
      rir: '2',
      rir_source: 'logged',
      prescription_ref: null,
      sessions: { started_at: '2026-10-01T08:00:00Z' },
    },
    broken: { rir_source: 'guessed' },
  },
  {
    name: 'rep max',
    schema: repMaxRowSchema,
    row: { reps: 3, load_kg: '120.5', achieved_at: '2026-10-01', sets: { sessions: { local_date: '2026-10-01' } } },
    broken: { load_kg: null },
  },
  {
    name: 'max reps',
    schema: maxRepsRowSchema,
    row: { max_reps: 12, achieved_at: '2026-10-01', sets: null },
    broken: { max_reps: '12' },
  },
  {
    name: 'item',
    schema: itemRowSchema,
    row: {
      id: ID,
      key: 'chalk',
      name: 'Chalk',
      kind: 'gear',
      rarity: 'common',
      tier: 'rookie',
      gear_slot: 'chalk',
      icon_key: 'chalk',
      description: 'Grip.',
      grants_challenge_id: null,
      sort_order: 1,
    },
    broken: { rarity: 'mythic-ish' },
  },
  {
    name: 'recipe',
    schema: recipeRowSchema,
    row: {
      id: ID,
      key: 'chalk',
      output_item_id: ID,
      output_quantity: 1,
      recipe_inputs: [{ item_id: ID, quantity: 2 }],
    },
    broken: { recipe_inputs: null },
  },
  {
    name: 'inventory',
    schema: inventoryRowSchema,
    row: { item_id: ID, quantity: 2, first_obtained_at: '2026-10-01T08:00:00Z' },
    broken: { quantity: undefined },
  },
  {
    name: 'challenge',
    schema: challengeRowSchema,
    row: { id: ID, key: 'volume', name: 'Volume', definition: { kind: 'volume' } },
    broken: { name: 7 },
  },
  {
    name: 'recent lift',
    schema: recentLiftRowSchema,
    row: { exercise_id: ID, session_rank: 1, weight_kg: '60', reps: 8, logged_rir: null },
    broken: { session_rank: null },
  },
  {
    name: 'program template',
    schema: programTemplateRowSchema,
    row: { key: 'madcow', version: 1, name: 'Madcow', definition: {}, owner_user_id: null },
    broken: { version: '1' },
  },
  { name: 'enrollment', schema: enrollmentRowSchema, row: ENROLLMENT_ROW, broken: { unit: 'stone' } },
  {
    name: 'enrollment facts',
    schema: enrollmentFactsRowsSchema,
    row: {
      enrollment: ENROLLMENT_ROW,
      events: [{ id: ID, kind: 'skip_day', payload: { position: { index: 2 } }, effective_at: '2026-10-02T08:00:00Z' }],
      sessions: [
        {
          id: ID,
          completed_at: '2026-10-03T08:00:00Z',
          program_position: { cycle: 1, week: 1, day: 'A' },
          sets: [
            {
              ref: 'squat',
              exercise_id: ID,
              weight_kg: 100,
              reps: 5,
              effort_input_type: 'rir',
              effort_value: 2,
              prescribed_weight_kg: 100,
              prescribed_reps: 5,
              prescribed_min_reps: null,
              prescribed_amrap: false,
            },
          ],
        },
      ],
    },
    broken: { sessions: [{ id: ID }] },
  },
  {
    name: 'program',
    schema: programRowSchema,
    row: {
      id: ID,
      key: null,
      name: 'My UL',
      owner_user_id: ID,
      copied_from_id: null,
      program_days: [
        {
          id: ID,
          name: 'Upper',
          position: 0,
          program_day_exercises: [
            {
              position: 0,
              exercise_id: ID,
              target_sets: 3,
              target_reps_min: 5,
              target_reps_max: 8,
              progression: 'linear',
              increment_kg: '2.50',
              increment_lb: '5.00',
            },
          ],
        },
      ],
    },
    broken: {
      program_days: [{ id: ID, name: 'Upper', position: 0, program_day_exercises: [{ progression: 'wave' }] }],
    },
  },
  {
    name: 'bodyweight entry',
    schema: bodyweightEntryRowSchema,
    row: { logged_on: '2026-10-01', bodyweight_kg: '80.4' },
    broken: { logged_on: null },
  },
  {
    name: 'workout bodyweight',
    schema: workoutBodyweightRowSchema,
    row: { local_date: '2026-10-01', bodyweight_kg: 80 },
    broken: { bodyweight_kg: true },
  },
  {
    name: 'weekly goal week',
    schema: weeklyGoalWeekRowSchema,
    row: { week_start: '2026-09-28', goal: 3, sessions: 2, is_current: true },
    broken: { is_current: 'yes' },
  },
  {
    name: 'lift goal',
    schema: liftGoalRowSchema,
    row: {
      exercise_id: ID,
      target_kg: '100.00',
      reps: 5,
      target_date: '2026-12-01',
      exercises: { name: 'Bench', load_type: 'external' },
    },
    broken: { reps: '5' },
  },
  {
    name: 'lift goal rep max',
    schema: goalRepMaxRowSchema,
    row: { exercise_id: ID, reps: 5, load_kg: '100.00', achieved_at: '2026-10-01T08:00:00Z' },
    broken: { achieved_at: null },
  },
  {
    name: 'quest',
    schema: questRowSchema,
    row: {
      id: ID,
      key: 'first',
      name: 'First',
      description: 'Lift.',
      quest_points: 1,
      sort_order: 1,
      definition: {},
      retired_at: null,
    },
    broken: { quest_points: null },
  },
  {
    name: 'quest progress',
    schema: questProgressRowSchema,
    row: { quest_id: ID, started_at: '2026-10-01', step_index: 0, step_progress: '12.50' },
    broken: { step_index: 'zero' },
  },
  {
    name: 'quest completion',
    schema: questCompletionRowSchema,
    row: { quest_id: ID, completed_at: '2026-10-01', quest_points: 2 },
    broken: { completed_at: 1 },
  },
];

describe('row schemas of server reads', () => {
  for (const { name, schema, row, broken } of CASES) {
    it(`reads a well-formed ${name} row, numeric strings included`, () => {
      expect(schema.safeParse(row).success).toBe(true);
    });

    it(`rejects a malformed ${name} row`, () => {
      expect(schema.safeParse({ ...row, ...broken }).success).toBe(false);
    });
  }
});

function clientAnswering(data: unknown): SupabaseClient {
  const query = {
    select: () => query,
    eq: () => query,
    gte: () => query,
    then: (resolve: (result: { data: unknown; error: null }) => unknown) => resolve({ data, error: null }),
  };
  return { from: () => query } as unknown as SupabaseClient;
}

describe('hold sets, which are lift sets without reps', () => {
  it('read in the progress, recent lift and session progress paths instead of failing the whole answer', () => {
    const holdSet = {
      session_id: ID,
      weight_kg: '20',
      effective_load_kg: 20,
      reps: null,
      rir: null,
      rir_source: 'default',
      prescription_ref: null,
      sessions: { started_at: '2026-10-01T08:00:00Z' },
    };
    expect(progressSetRowSchema.safeParse(holdSet).success).toBe(true);
    expect(
      recentLiftRowSchema.safeParse({ exercise_id: ID, session_rank: 1, weight_kg: 20, reps: null, logged_rir: null })
        .success,
    ).toBe(true);
    const [session] = sessionProgress([progressSetRowSchema.parse(holdSet)], 'external');
    expect(session).toMatchObject({ topSetKg: 20, topSetReps: 0, mostReps: 0 });
  });

  it('count as zero reps in the last session view', () => {
    const sessions = recentSessionsByExercise([
      { exercise_id: ID, session_rank: 1, weight_kg: '20', reps: null, logged_rir: null },
    ]);
    expect(sessions.get(ID)).toEqual([[{ weightKg: 20, reps: 0, loggedRir: null }]]);
  });
});

describe('query functions with an injected client', () => {
  it('turn a malformed answer into a sentence for the user instead of passing it on', async () => {
    await expect(queryRecentSets(clientAnswering([{ exercise_id: ID }]), new Date(0))).rejects.toThrow(
      UNREADABLE_ROWS_TEXT,
    );
    await expect(queryExerciseNotes(clientAnswering([{ exercise_id: ID, body: 7 }]))).rejects.toThrow(
      UNREADABLE_ROWS_TEXT,
    );
  });

  it('read well-formed rows as before', async () => {
    expect(await queryExerciseNotes(clientAnswering([{ exercise_id: ID, body: 'Elbows in' }]))).toEqual({
      [ID]: 'Elbows in',
    });
  });
});
