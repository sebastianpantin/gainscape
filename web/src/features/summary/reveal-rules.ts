import { FLOAT_TOLERANCE } from '@domain/math.ts';
import type { PersonalRecordSummary, SessionSummary } from '@domain/types.ts';
import type { DraftChallenge } from '../../offline/draft-format.ts';
import { describeCardioGains } from '../../lib/cardio-rules.ts';
import type { Exercise } from '../../lib/catalog-rules.ts';
import { formatLoad, formatXp } from '../../lib/format.ts';
import type { UnitPref } from '../../lib/profile-rules.ts';
import { type DistanceUnit, distanceUnitFor, formatWeight, HOLD_DISTANCE_UNIT } from '../../lib/units.ts';

export interface DescribedRecord {
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

export const REVEAL_MAX_PRE_LOOT_S = 1.5;
const SKILLS_START_S = 0.1;
const SKILL_STAGGER_S = 0.15;
const SKILL_SPREAD_MAX_S = 0.45;
const BAR_LAG_S = 0.1;
const SKILL_SETTLE_S = 0.35;
const LEVEL_UP_BEAT_S = 0.3;
const RECORDS_BEAT_S = 0.25;
const RISE_S = 0.4;
const GAIN_FILL_S = 0.6;
const POP_PEAK_MS = 300;

export interface RevealShape {
  skillCount: number;
  hasLevelUps: boolean;
  hasRecords: boolean;
}

export function revealShape(
  summary: Pick<SessionSummary, 'historyOnly' | 'xpBySkill' | 'levelUps' | 'prs'> | null,
): RevealShape {
  if (!summary || summary.historyOnly) return { skillCount: 0, hasLevelUps: false, hasRecords: false };
  return {
    skillCount: Object.values(summary.xpBySkill).filter((xp) => xp > 0).length,
    hasLevelUps: summary.levelUps.length > 0,
    hasRecords: summary.prs.length > 0,
  };
}

export interface RevealTimeline {
  skillDelaysS: number[];
  barDelaysS: number[];
  levelUpDelayS: number | null;
  recordsDelayS: number | null;
  lootDelayS: number;
  settledAfterMs: number;
}

function toMs(seconds: number): number {
  return Math.round(seconds * 1000);
}

function roundedS(seconds: number): number {
  return toMs(seconds) / 1000;
}

export function revealTimeline({ skillCount, hasLevelUps, hasRecords }: RevealShape): RevealTimeline {
  const stagger = skillCount > 1 ? Math.min(SKILL_STAGGER_S, SKILL_SPREAD_MAX_S / (skillCount - 1)) : 0;
  const skillDelaysS = Array.from({ length: skillCount }, (_, index) => roundedS(SKILLS_START_S + index * stagger));
  const barDelaysS = skillDelaysS.map((delay) => roundedS(delay + BAR_LAG_S));
  const lastSkillS = skillDelaysS.at(-1);
  let cursor = lastSkillS === undefined ? SKILLS_START_S : lastSkillS + SKILL_SETTLE_S;
  const levelUpDelayS = hasLevelUps ? roundedS(cursor) : null;
  if (hasLevelUps) cursor += LEVEL_UP_BEAT_S;
  const recordsDelayS = hasRecords ? roundedS(cursor) : null;
  if (hasRecords) cursor += RECORDS_BEAT_S;
  const lootDelayS = roundedS(cursor);
  const lastBarEndS = Math.max(0, ...barDelaysS.map((delay) => delay + GAIN_FILL_S));
  return {
    skillDelaysS,
    barDelaysS,
    levelUpDelayS,
    recordsDelayS,
    lootDelayS,
    settledAfterMs: toMs(Math.max(lootDelayS + RISE_S, lastBarEndS)),
  };
}

export function levelUpCueDelayMs(
  timeline: Pick<RevealTimeline, 'levelUpDelayS'>,
  reducedMotion: boolean,
): number | null {
  if (timeline.levelUpDelayS === null) return null;
  return reducedMotion ? 0 : toMs(timeline.levelUpDelayS) + POP_PEAK_MS;
}
