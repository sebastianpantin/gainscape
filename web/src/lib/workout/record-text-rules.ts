import type { PersonalRecordSummary } from '@domain/types.ts';
import type { Exercise } from '../exercises/catalog-rules.ts';
import { formatLoad } from '../format.ts';
import type { UnitPref } from '../profile/profile-rules.ts';
import { type DistanceUnit, distanceUnitFor, HOLD_DISTANCE_UNIT } from '../units.ts';
import { describeCardioGains } from './cardio-rules.ts';

interface DescribedRecord {
  headline: string;
  previous: string;
}

function recordDistanceUnit(exercise: Exercise | undefined, unit: UnitPref): DistanceUnit {
  if (exercise?.modality === 'cardio') return distanceUnitFor(unit, exercise.activity.paceUnit);
  if (exercise?.measure !== undefined) return HOLD_DISTANCE_UNIT;
  return distanceUnitFor(unit, 'per_km');
}

export function describeRecord(
  record: PersonalRecordSummary,
  exercise: Exercise | undefined,
  unit: UnitPref,
): DescribedRecord {
  const name = exercise?.name ?? 'Exercise';
  if (record.kind === 'cardio') {
    return { headline: `${name}:`, previous: describeCardioGains(record.records, recordDistanceUnit(exercise, unit)) };
  }
  if (record.kind === 'bodyweight_reps') {
    const previous = record.previousReps === null ? 'first record' : `was ${record.previousReps}`;
    return { headline: `${name}: ${record.reps} reps`, previous: `(${previous})` };
  }
  const loadType = exercise?.modality === 'lift' ? exercise.loadType : 'external';
  const previous =
    record.previousLoadKg === null ? 'first record' : `was ${formatLoad(record.previousLoadKg, loadType, unit)}`;
  return {
    headline: `${name}: ${record.reps}RM ${formatLoad(record.loadKg!, loadType, unit)}`,
    previous: `(${previous})`,
  };
}
