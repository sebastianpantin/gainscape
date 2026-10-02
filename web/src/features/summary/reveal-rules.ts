import type { PersonalRecordSummary } from '@domain/types.ts';
import { describeCardioGains } from '../../lib/cardio-rules.ts';
import type { Exercise } from '../../lib/catalog-rules.ts';
import { formatLoad } from '../../lib/format.ts';
import type { UnitPref } from '../../lib/profile-rules.ts';
import { distanceUnitFor } from '../../lib/units.ts';

export interface DescribedRecord {
  headline: string;
  previous: string;
}

export function describeRecord(
  record: PersonalRecordSummary,
  exercise: Exercise | undefined,
  unit: UnitPref,
): DescribedRecord {
  const name = exercise?.name ?? 'Exercise';
  if (record.kind === 'cardio') {
    const paceUnit = exercise?.modality === 'cardio' ? exercise.activity.paceUnit : 'per_km';
    return { headline: `${name}:`, previous: describeCardioGains(record.records, distanceUnitFor(unit, paceUnit)) };
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
