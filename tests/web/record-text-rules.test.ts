import { describe, expect, it } from 'vitest';
import type { CardioExercise, LiftExercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import { describeRecord } from '../../web/src/lib/workout/record-text-rules.ts';

const base = { equipment: 'barbell', custom: false, archived: false, skillShares: [] };
const dip: LiftExercise = { ...base, id: 'dip', name: 'Weighted Dip', modality: 'lift', loadType: 'bodyweight_plus' };
const swim: CardioExercise = {
  ...base,
  id: 'swim',
  name: 'Swimming',
  modality: 'cardio',
  activity: { paceUnit: 'per_100m', referencePaceSPerKm: null, maxEffort: 'max', tracksDistance: true, shares: [] },
};

const repMax = {
  exerciseId: 'dip',
  kind: 'rep_max' as const,
  setId: 'set-1',
  reps: 5,
  loadKg: 20,
  previousLoadKg: 15,
  previousReps: null,
};

describe('describeRecord', () => {
  it('shows a carry record in metres and a hold record as a duration', () => {
    const carry: LiftExercise = {
      ...dip,
      id: 'carry',
      name: 'Farmers Carry',
      loadType: 'external',
      measure: 'distance',
    };
    const gain = { kind: 'cardio' as const, exerciseId: 'carry', setId: 'set-9' };
    expect(describeRecord({ ...gain, records: [{ kind: 'distance', value: 60, previous: 40 }] }, carry, 'kg')).toEqual({
      headline: 'Farmers Carry:',
      previous: '60 m (was 40 m)',
    });
    expect(
      describeRecord({ ...gain, records: [{ kind: 'distance', value: 40, previous: null }] }, carry, 'lb'),
    ).toEqual({ headline: 'Farmers Carry:', previous: '40 m (first)' });
    expect(
      describeRecord(
        { ...gain, records: [{ kind: 'duration', value: 45, previous: 30 }] },
        { ...carry, measure: 'time' },
        'kg',
      ),
    ).toEqual({ headline: 'Farmers Carry:', previous: '45 s (was 30 s)' });
  });

  it('shows a rep max with the load type of the exercise and the beaten load', () => {
    expect(describeRecord(repMax, dip, 'kg')).toEqual({
      headline: 'Weighted Dip: 5RM +20 kg',
      previous: '(was +15 kg)',
    });
  });

  it('marks a first rep max and falls back to an external load for an unknown exercise', () => {
    expect(describeRecord({ ...repMax, previousLoadKg: null }, undefined, 'kg')).toEqual({
      headline: 'Exercise: 5RM 20 kg',
      previous: '(first record)',
    });
  });

  it('shows a bodyweight reps record', () => {
    const record = { ...repMax, kind: 'bodyweight_reps' as const, reps: 12, loadKg: null, previousReps: 10 };
    expect(describeRecord(record, dip, 'kg')).toEqual({ headline: 'Weighted Dip: 12 reps', previous: '(was 10)' });
    expect(describeRecord({ ...record, previousReps: null }, dip, 'kg').previous).toBe('(first record)');
  });

  it('shows cardio gains in the distance unit of the activity', () => {
    const record = {
      kind: 'cardio' as const,
      exerciseId: 'swim',
      setId: 'bout-1',
      records: [{ kind: 'distance' as const, value: 1500, previous: 1000 }],
    };
    expect(describeRecord(record, swim, 'kg')).toEqual({ headline: 'Swimming:', previous: '1500 m (was 1000 m)' });
    expect(describeRecord(record, undefined, 'kg')).toEqual({ headline: 'Exercise:', previous: '1.5 km (was 1 km)' });
  });
});
