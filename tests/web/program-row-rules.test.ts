import { describe, expect, it } from 'vitest';
import { type ProgramRow, programPayload, toProgram } from '../../web/src/lib/programs/program-row-rules.ts';

const slot = {
  progression: 'none' as const,
  increment_kg: null,
  increment_lb: null,
};

const row: ProgramRow = {
  id: 'rehab',
  key: 'patellar_tendon_rehab',
  name: 'Patellar Tendon Rehab',
  category: 'rehab',
  owner_user_id: null,
  copied_from_id: null,
  program_days: [
    {
      id: 'daily',
      name: 'Daily',
      position: 0,
      program_day_exercises: [
        {
          ...slot,
          position: 1,
          exercise_id: 'extension',
          target_sets: 3,
          target_reps_min: 12,
          target_reps_max: 15,
          target_duration_s: null,
        },
        {
          ...slot,
          position: 0,
          exercise_id: 'wall-sit',
          target_sets: 5,
          target_reps_min: null,
          target_reps_max: null,
          target_duration_s: 45,
        },
      ],
    },
  ],
};

describe('program rows', () => {
  const program = toProgram(row);

  it('reads the category and a timed hold slot with its duration', () => {
    expect(program.category).toBe('rehab');
    expect(program.days[0].exercises.map((planned) => [planned.exerciseId, planned.targetDurationS])).toEqual([
      ['wall-sit', 45],
      ['extension', null],
    ]);
  });

  it('saves a timed hold with its duration and no reps, and a rep lift with reps and no duration', () => {
    const payload = programPayload({ id: program.id, name: program.name, days: program.days });
    expect(
      payload.days[0].exercises.map(({ targetRepsMin, targetRepsMax, targetDurationS }) => [
        targetRepsMin,
        targetRepsMax,
        targetDurationS,
      ]),
    ).toEqual([
      [null, null, 45],
      [12, 15, null],
    ]);
  });
});
