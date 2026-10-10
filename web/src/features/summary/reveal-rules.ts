import { FLOAT_TOLERANCE } from '@domain/math.ts';
import type { PersonalRecordSummary, SessionSummary } from '@domain/types.ts';
import type { DraftChallenge } from '../../offline/draft-format.ts';
import { describeCardioGains } from '../../lib/cardio-rules.ts';
import type { Exercise } from '../../lib/catalog-rules.ts';
import { formatLoad, formatXp } from '../../lib/format.ts';
import type { UnitPref } from '../../lib/profile-rules.ts';
import { distanceUnitFor, formatWeight } from '../../lib/units.ts';

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
    const paceUnit =
      exercise?.modality === 'cardio' ? exercise.activity.paceUnit : exercise?.measure ? 'per_100m' : 'per_km';
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

export function gearBonusText(summary: Pick<SessionSummary, 'gearBonusBySkill'>, skillKey: string): string | null {
  const bonus = summary.gearBonusBySkill?.[skillKey] ?? 0;
  return bonus > 0 ? `Gear bonus +${formatXp(bonus)} XP` : null;
}

export function challengeHeadline(summary: Pick<SessionSummary, 'challenge'>): string | null {
  const challenge = summary.challenge;
  if (!challenge) return null;
  return `${challenge.passed ? 'Challenge complete' : 'Challenge failed'}: ${challenge.name}`;
}

export function challengeNotAppliedText(
  summary: Pick<SessionSummary, 'challenge' | 'historyOnly'>,
  planned: DraftChallenge | null,
): string | null {
  if (!planned || summary.challenge) return null;
  return summary.historyOnly
    ? 'Challenge not applied: a workout older than 7 days is saved to history only. Your scroll was kept.'
    : `Challenge not applied: ${planned.name} couldn't be applied to this workout, so it was saved as a normal workout.`;
}

export function challengeBonusText(
  summary: Pick<SessionSummary, 'challengeBonusBySkill'>,
  skillKey: string,
): string | null {
  const bonus = summary.challengeBonusBySkill?.[skillKey] ?? 0;
  return bonus > 0 ? `Challenge bonus +${formatXp(bonus)} XP` : null;
}

function risenTarget(
  serverFloorsKg: Record<string, number | null>,
  plannedLoadsKg: Record<string, number | null>,
): { exerciseId: string; floorKg: number; plannedKg: number } | null {
  for (const [exerciseId, floorKg] of Object.entries(serverFloorsKg)) {
    const plannedKg = plannedLoadsKg[exerciseId] ?? null;
    if (floorKg !== null && plannedKg !== null && floorKg > plannedKg + FLOAT_TOLERANCE) {
      return { exerciseId, floorKg, plannedKg };
    }
  }
  return null;
}

export function challengeFailReason(
  summary: Pick<SessionSummary, 'challenge'>,
  planned: DraftChallenge | null,
  nameOf: (exerciseId: string) => string,
  unit: UnitPref,
): string | null {
  const challenge = summary.challenge;
  if (!challenge || challenge.passed) return null;
  if (!planned) return 'Challenge target not reached';
  const risen = risenTarget(challenge.targetLoadsKg, planned.targetLoadsKg);
  if (risen) {
    const { exerciseId, floorKg, plannedKg } = risen;
    return `Target rose since you started: ${nameOf(exerciseId)} ${formatWeight(floorKg, unit)} (planned ${formatWeight(plannedKg, unit)})`;
  }
  return planned.definition.kind === 'prescription'
    ? 'Not every prescribed set reached its reps and load'
    : 'Volume target not reached';
}

export function unappliedChangesText(
  summary: Pick<SessionSummary, 'historyOnly'> & { storedContentDiffers?: true },
): string | null {
  if (!summary.storedContentDiffers) return null;
  const notApplied =
    "This workout was already saved, and the saved version differs from this device's copy, so this copy was not applied.";
  return summary.historyOnly ? notApplied : `${notApplied} Check it in History.`;
}
