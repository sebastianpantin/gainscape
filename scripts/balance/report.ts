import { DEFAULT_BALANCE } from '../../supabase/functions/_shared/domain/index.ts';
import { type CardioBandReport, evaluateBands, evaluateCardioBands, evaluateMobilityBands } from './bands.ts';
import { simulateCardioProfile } from './cardio-simulate.ts';
import { MOBILITY_SIM_SKILLS } from './catalog.ts';
import { MOBILITY_PROFILES } from './profiles.ts';
import {
  simulateCommittedCardioConstantsUntilBothReach99,
  simulateCommittedConstantsUntilLegsReach99,
  tune,
  tuneCardio,
} from './tune.ts';

function formatYears(years: number): string {
  return Number.isFinite(years) ? years.toFixed(1) : '∞';
}

const candidates = tune();
const feasible = candidates.filter((candidate) => candidate.report.violation === 0);

console.log(
  'bonusMax bonusFull xp/rep | hyp  str  bal  cas (years to 99 in compared skill) | gap   cas-ratio time/effort | wk1 | a b d e  (hypertrophy/strength/casual informational)',
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
      String(report.balancedWeekOneLevel).padStart(3),
      '|',
      ['a', 'b', 'd', 'e'].map((band) => (passes[band as keyof typeof passes] ? '✓' : '✗')).join(' '),
    ].join(' '),
  );
}
console.log(
  feasible.length > 0
    ? `\n${feasible.length} feasible configurations.`
    : '\nNo configuration meets bands a, b, d and e. Closest is listed first.',
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
  `  hypertrophy ${formatYears(exact.years.hypertrophy)}y, strength ${formatYears(exact.years.strength)}y, balanced ${formatYears(exact.years.balanced)}y, casual ${formatYears(exact.years.casual)}y, gap ${(exact.hypertrophyVsStrengthGap * 100).toFixed(1)}%, balanced week 1 level ${exact.balancedWeekOneLevel}`,
);

function cardioRow(label: string, report: CardioBandReport): string {
  const perSkill = Object.keys(report.rates)
    .map(
      (skill) =>
        `${skill} ${report.rates[skill]} XP/min: ${formatYears(report.years[skill])}y, week 1 level ${report.weekOneLevel[skill]} ${report.passes.yearsTo99[skill] && report.passes.weekOneLevel[skill] ? '✓' : '✗'}`,
    )
    .join(' | ');
  return [
    `${label}: ${perSkill}`,
    `  (g) agility/endurance ${report.agilityToEnduranceRateRatio.toFixed(2)} ${report.passes.g ? '✓' : '✗'}`,
    `  (h) steady agility bout ${Math.round(report.steadyAgilityBoutXp)} XP vs interval session ${Math.round(report.intervalSessionAgilityXp)} XP ${report.passes.h ? '✓' : '✗'}`,
  ].join('\n');
}

console.log(`\n${cardioRow('Cardio tuned rates (cardio_balanced)', tuneCardio())}`);
console.log(
  cardioRow(
    'Cardio committed rates, exact simulation',
    evaluateCardioBands(
      simulateCommittedCardioConstantsUntilBothReach99(),
      DEFAULT_BALANCE.cardioXpPerWorkMinute,
      DEFAULT_BALANCE.cardioXpPerWorkMinute,
    ),
  ),
);

const mobility = evaluateMobilityBands(
  simulateCardioProfile(MOBILITY_PROFILES.mobility_regular, DEFAULT_BALANCE, {
    skills: MOBILITY_SIM_SKILLS,
    stopWhenAllSkillsReach99: true,
  }),
);
console.log(
  `\nMobility at ${DEFAULT_BALANCE.cardioXpPerWorkMinute.mobility} XP/min (mobility_regular): ` +
    `99 in ${formatYears(mobility.years)} y ${mobility.passes.years ? '✓' : '✗'}, ` +
    `week 1 level ${mobility.weekOneLevel} ${mobility.passes.weekOneLevel ? '✓' : '✗'}`,
);
