import type { BalanceConfig } from './balance.ts';
import type { EffortInput, EffortInputType, EffortLevel } from './types.ts';

export interface ResolvedEffort {
  effortInputType: EffortInputType | null;
  effortValue: number | null;
  loggedRir: number | null;
}

function isHalfStep(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value * 2);
}

export function resolveEffort(input: EffortInput, cfg: BalanceConfig): ResolvedEffort {
  if (input === null) {
    return { effortInputType: null, effortValue: null, loggedRir: null };
  }
  switch (input.type) {
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
  const levels = Object.entries(cfg.effortLevelRir) as [EffortLevel, number][];
  const level = levels.find(([, rir]) => rir === effortValue)?.[0];
  if (!level) throw new RangeError(`no effort level maps to RIR ${effortValue}`);
  return { type: 'level', level };
}
