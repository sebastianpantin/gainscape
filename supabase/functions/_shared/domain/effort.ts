import type { BalanceConfig } from './balance.ts';
import {
  CARDIO_EFFORT_LEVELS,
  type EffortInput,
  type EffortInputType,
  type EffortLevel,
  type SetKind,
} from './types.ts';

export interface ResolvedEffort {
  effortInputType: EffortInputType | null;
  effortValue: number | null;
  loggedRir: number | null;
}

function isHalfStep(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value * 2);
}

export function resolveEffort(input: EffortInput, cfg: BalanceConfig, kind: SetKind = 'lift'): ResolvedEffort {
  if (input === null) {
    return { effortInputType: null, effortValue: null, loggedRir: null };
  }
  if ((input.type === 'cardio') !== (kind === 'cardio')) {
    throw new RangeError(`a ${kind} set cannot carry a ${input.type} effort`);
  }
  switch (input.type) {
    case 'cardio': {
      const value = CARDIO_EFFORT_LEVELS.indexOf(input.level) + 1;
      if (value === 0) throw new RangeError(`invalid cardio effort: ${input.level}`);
      return { effortInputType: 'cardio', effortValue: value, loggedRir: null };
    }
    case 'level': {
      const rir = cfg.effortLevelRir[input.level];
      return { effortInputType: 'level', effortValue: rir, loggedRir: rir };
    }
    case 'rir':
      if (!isHalfStep(input.value) || input.value < 0 || input.value > 10) {
        throw new RangeError(`invalid RIR: ${input.value}`);
      }
      return { effortInputType: 'rir', effortValue: input.value, loggedRir: input.value };
    case 'rpe':
      if (!isHalfStep(input.value) || input.value < 5 || input.value > 10) {
        throw new RangeError(`invalid RPE: ${input.value}`);
      }
      return { effortInputType: 'rpe', effortValue: input.value, loggedRir: 10 - input.value };
  }
}

export function effortInputFromStored(
  effortInputType: EffortInputType | null,
  effortValue: number | null,
  cfg: BalanceConfig,
): EffortInput {
  if (effortInputType === null || effortValue === null) return null;
  if (effortInputType === 'rir') return { type: 'rir', value: effortValue };
  if (effortInputType === 'rpe') return { type: 'rpe', value: effortValue };
  if (effortInputType === 'cardio') {
    const cardioLevel = CARDIO_EFFORT_LEVELS[effortValue - 1];
    if (!Number.isInteger(effortValue) || cardioLevel === undefined) {
      throw new RangeError(`no cardio effort maps to ${effortValue}`);
    }
    return { type: 'cardio', level: cardioLevel };
  }
  const levels = Object.entries(cfg.effortLevelRir) as [EffortLevel, number][];
  const level = levels.find(([, rir]) => rir === effortValue)?.[0];
  if (!level) throw new RangeError(`no effort level maps to RIR ${effortValue}`);
  return { type: 'level', level };
}
