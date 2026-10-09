import type { CardioEffortLevel, EffortInput, EffortLevel } from '@domain/types.ts';
import type { EffortInputMode } from './profile-rules.ts';

export const EFFORT_LEVELS: readonly EffortLevel[] = ['easy', 'hard', 'near_failure', 'failure'];

export const EFFORT_LEVEL_LABELS: Record<EffortLevel, string> = {
  easy: 'Easy',
  hard: 'Hard',
  near_failure: 'Near fail',
  failure: 'Failure',
};

export const CARDIO_EFFORT_LABELS: Record<CardioEffortLevel, string> = {
  easy: 'Easy',
  moderate: 'Moderate',
  hard: 'Hard',
  max: 'Max',
};

export function effortLabel(effort: EffortInput): string | null {
  if (effort === null) return null;
  if (effort.type === 'level') return EFFORT_LEVEL_LABELS[effort.level];
  if (effort.type === 'cardio') return CARDIO_EFFORT_LABELS[effort.level];
  return `${effort.type.toUpperCase()} ${effort.value}`;
}

const HIGHEST_RIR_CHOICE = 6;
const LOWEST_RPE_CHOICE = 6;
const RPE_AT_FAILURE = 10;

export function assumedEffort(
  mode: EffortInputMode,
  rir: number,
  levelRir: Readonly<Record<EffortLevel, number>>,
): EffortInput {
  if (mode === 'rir') return { type: 'rir', value: Math.min(HIGHEST_RIR_CHOICE, Math.max(0, rir)) };
  if (mode === 'rpe') {
    const rpe = RPE_AT_FAILURE - Math.max(0, rir);
    return rpe < LOWEST_RPE_CHOICE ? null : { type: 'rpe', value: rpe };
  }
  const distance = (level: EffortLevel) => Math.abs(levelRir[level] - rir);
  const nearest = EFFORT_LEVELS.reduce((best, level) => (distance(level) < distance(best) ? level : best));
  return { type: 'level', level: nearest };
}
