import { describe, expect, it } from 'vitest';
import {
  type Exercise,
  exerciseLabels,
  type ExerciseRow,
  isCardioExercise,
  isLiftExercise,
  toExercise,
} from '../../web/src/lib/catalog-rules.ts';

function row(overrides: Partial<ExerciseRow>): ExerciseRow {
  return {
    id: 'bench',
    name: 'Barbell Bench Press',
    equipment: 'barbell',
    modality: 'lift',
    load_type: 'external',
    owner_user_id: null,
    archived_at: null,
    reference_pace_s_per_km: null,
    pace_unit: null,
    max_effort: null,
    exercise_skills: [],
    ...overrides,
  };
}

describe('toExercise', () => {
  it('maps a built-in lift with its load type', () => {
    expect(toExercise(row({ load_type: 'bodyweight_plus' }))).toEqual({
      id: 'bench',
      name: 'Barbell Bench Press',
      equipment: 'barbell',
      custom: false,
      archived: false,
      modality: 'lift',
      loadType: 'bodyweight_plus',
    });
  });

  it('marks owned exercises as custom and archived ones as archived, defaulting the load type to external', () => {
    expect(
      toExercise(row({ owner_user_id: 'user-1', archived_at: '2026-09-30T00:00:00Z', load_type: null })),
    ).toMatchObject({ custom: true, archived: true, loadType: 'external' });
  });

  it('maps a cardio activity with its skill shares, skipping shares without a skill', () => {
    expect(
      toExercise(
        row({
          id: 'run',
          name: 'Run',
          equipment: 'other',
          modality: 'cardio',
          load_type: null,
          reference_pace_s_per_km: 330,
          pace_unit: 'per_km',
          max_effort: 'hard',
          exercise_skills: [
            { share_bp: 7000, skills: { key: 'legs' } },
            { share_bp: 3000, skills: null },
          ],
        }),
      ),
    ).toEqual({
      id: 'run',
      name: 'Run',
      equipment: 'other',
      custom: false,
      archived: false,
      modality: 'cardio',
      activity: {
        paceUnit: 'per_km',
        referencePaceSPerKm: 330,
        maxEffort: 'hard',
        shares: [{ skillKey: 'legs', shareBasisPoints: 7000 }],
      },
    });
  });

  it('defaults a cardio activity to per-km pace and a max effort ceiling', () => {
    const exercise = toExercise(row({ modality: 'cardio', load_type: null }));
    expect(exercise).toMatchObject({ activity: { paceUnit: 'per_km', maxEffort: 'max', referencePaceSPerKm: null } });
  });
});

describe('exercise guards and labels', () => {
  const lift = toExercise(row({}));
  const cardio = toExercise(row({ id: 'run', modality: 'cardio', load_type: null }));

  it('tells lifts and cardio apart', () => {
    expect([lift, cardio].map(isLiftExercise)).toEqual([true, false]);
    expect([lift, cardio].map(isCardioExercise)).toEqual([false, true]);
  });

  it('labels custom and archived exercises', () => {
    const labelled = (custom: boolean, archived: boolean): Exercise => ({ ...lift, custom, archived });
    expect(exerciseLabels(labelled(false, false))).toBe('');
    expect(exerciseLabels(labelled(true, false))).toBe('(custom)');
    expect(exerciseLabels(labelled(false, true))).toBe('(archived)');
    expect(exerciseLabels(labelled(true, true))).toBe('(custom) (archived)');
  });
});
