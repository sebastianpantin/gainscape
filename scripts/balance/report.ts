import { DEFAULT_BALANCE } from '../../supabase/functions/_shared/domain/index.ts';
import { evaluateBands } from './bands.ts';
import { simulateCommittedConstantsUntilLegsReach99, tune } from './tune.ts';

function formatYears(years: number): string {
  return Number.isFinite(years) ? years.toFixed(1) : '∞';
}

const candidates = tune();
const feasible = candidates.filter((candidate) => candidate.report.violation === 0);

console.log(
  'bonusMax bonusFull xp/rep | hyp  str  bal  cas (years to 99 in compared skill) | gap   cas-ratio time/effort | a b d  (balanced/casual informational)',
);
for (const { intensityBonusMax, intensityBonusFull, report } of candidates) {
  const { years, passes } = report;
  console.log(
    [
      intensityBonusMax.toFixed(2).padStart(8),
      intensityBonusFull.toFixed(2).padStart(9),
      String(report.xpPerEffectiveRep).padStart(6),
      '|',
      formatYears(years.hypertrophy).padStart(4),
      formatYears(years.strength).padStart(4),
      formatYears(years.balanced).padStart(4),
      formatYears(years.casual).padStart(4),
      `(${report.comparedSkill})`.padEnd(38),
      '|',
      `${(report.hypertrophyVsStrengthGap * 100).toFixed(0)}%`.padStart(4),
      `${report.casualTimeRatio.toFixed(2)}/${report.casualEffortRatio.toFixed(2)}`.padStart(22),
      '|',
      ['a', 'b', 'd'].map((band) => (passes[band as keyof typeof passes] ? '✓' : '✗')).join(' '),
    ].join(' '),
  );
}
console.log(
  feasible.length > 0
    ? `\n${feasible.length} feasible configurations.`
    : '\nNo configuration meets bands a, b and d. Closest is listed first.',
);

const exact = evaluateBands(
  simulateCommittedConstantsUntilLegsReach99(),
  'legs',
  DEFAULT_BALANCE.xpPerEffectiveRep,
  DEFAULT_BALANCE.xpPerEffectiveRep,
);
console.log(
  `\nCommitted constants (XP ${DEFAULT_BALANCE.xpPerEffectiveRep}, bonus ${DEFAULT_BALANCE.intensityBonusMax} at ${DEFAULT_BALANCE.intensityBonusFull}), exact simulation:`,
);
console.log(
  `  hypertrophy ${formatYears(exact.years.hypertrophy)}y, strength ${formatYears(exact.years.strength)}y, balanced ${formatYears(exact.years.balanced)}y, casual ${formatYears(exact.years.casual)}y, gap ${(exact.hypertrophyVsStrengthGap * 100).toFixed(1)}%`,
);
