import type { CardioEffortLevel, EffortInput, EffortLevel } from '@domain/types.ts';

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
