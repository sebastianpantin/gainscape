import {
  type BalanceConfig,
  compareSessionKeys,
  type EffortInput,
  predictedMaxReps,
  processSession,
  type SessionInput,
  type SetInput,
  strengthHistoryRows,
  strengthStateAt,
  type StrengthHistoryRow,
} from '../../supabase/functions/_shared/domain/index.ts';
import { SIM_CATALOG, SIM_SKILLS, shareOf } from './catalog.ts';
import { type LifterProfile, STARTING_E1RM_KG } from './profiles.ts';
import { DAY_MS, SIMULATION_SEED, skillProgress } from './progress.ts';
import { seededRandom } from './random.ts';

const MAX_SIMULATED_YEARS = 40;
export const WEEKS_PER_YEAR = 52;
const UNRATED_SET_FRACTION = 0.3;
const DELOAD_EVERY_NTH_WEEK = 8;
const DELOAD_RIR = 4;
const LOAD_INCREMENT_KG = 2.5;
const FIRST_YEAR_MONTHLY_GAIN = 0.03;

const SIMULATION_START_MS = Date.parse('2026-01-05T18:00:00.000Z');

export interface SimulationResult {
  profile: string;
  weeksToLevel99: Record<string, number | null>;
  cumulativeXpByWeek: Record<string, number[]>;
  averageWeeklyEffectiveRepsBySkill: Record<string, number>;
  weeksSimulated: number;
}

export interface SimulationOptions {
  maxYears?: number;
  stopWhenSkillsReach99?: readonly string[];
}

function weeklyGrowthFactor(week: number): number {
  const yearIndex = Math.floor(week / WEEKS_PER_YEAR);
  const monthlyGain = FIRST_YEAR_MONTHLY_GAIN / 2 ** yearIndex;
  return (1 + monthlyGain) ** (12 / WEEKS_PER_YEAR);
}

function roundDownToIncrement(loadKg: number): number {
  return Math.max(LOAD_INCREMENT_KG, Math.floor(loadKg / LOAD_INCREMENT_KG) * LOAD_INCREMENT_KG);
}

function loggedEffort(trueRir: number, noise: number, unrated: boolean): EffortInput {
  if (unrated) return null;
  return { type: 'rir', value: Math.min(6, Math.max(0, trueRir + noise)) };
}

function recentHistoryOnly(history: StrengthHistoryRow[], nowMs: number, cfg: BalanceConfig): StrengthHistoryRow[] {
  const keepAfterMs = nowMs - (cfg.e1rmWindowDays + 7) * DAY_MS;
  const latestSessionIdWithCandidates = new Map<string, string>();
  const firstWorkingSetRow = new Map<string, StrengthHistoryRow>();
  for (const row of history) {
    if (row.strengthCandidate !== null) latestSessionIdWithCandidates.set(row.exerciseId, row.session.id);
    if (!row.isWarmup && !firstWorkingSetRow.has(row.exerciseId)) firstWorkingSetRow.set(row.exerciseId, row);
  }
  const kept = history.filter(
    (row) =>
      Date.parse(row.session.startedAt) >= keepAfterMs ||
      latestSessionIdWithCandidates.get(row.exerciseId) === row.session.id,
  );
  for (const marker of firstWorkingSetRow.values()) if (!kept.includes(marker)) kept.unshift(marker);
  return kept;
}

export function simulateProfile(
  profile: LifterProfile,
  cfg: BalanceConfig,
  options: SimulationOptions = {},
): SimulationResult {
  const random = seededRandom(SIMULATION_SEED);
  const maxWeeks = (options.maxYears ?? MAX_SIMULATED_YEARS) * WEEKS_PER_YEAR;
  const trueE1rm: Record<string, number> = { ...STARTING_E1RM_KG };
  const skillXp: Record<string, number> = {};
  const { cumulativeXpByWeek, weeksToLevel99, recordWeek } = skillProgress(SIM_SKILLS);
  const effectiveRepsBySkill: Record<string, number> = Object.fromEntries(SIM_SKILLS.map((skill) => [skill.key, 0]));
  let history: StrengthHistoryRow[] = [];
  let setCounter = 0;
  let week = 0;

  const stopSkills = options.stopWhenSkillsReach99 ?? [];
  const reachedStopSkills = () => stopSkills.length > 0 && stopSkills.every((skill) => weeksToLevel99[skill] !== null);

  for (; week < maxWeeks && !reachedStopSkills(); week++) {
    const isDeloadWeek = (week + 1) % DELOAD_EVERY_NTH_WEEK === 0;
    profile.weeklyDays.forEach((day, dayIndex) => {
      const startedAt = new Date(
        SIMULATION_START_MS + (week * 7 + profile.dayOffsets[dayIndex]) * DAY_MS,
      ).toISOString();
      const sets: SetInput[] = [];
      for (const planned of day.exercises) {
        const setCount = isDeloadWeek ? Math.ceil(planned.sets / 2) : planned.sets;
        for (let setIndex = 0; setIndex < setCount; setIndex++) {
          const reps = random.integerBetween(profile.repRange[0], profile.repRange[1]);
          const plannedRir = isDeloadWeek
            ? DELOAD_RIR
            : random.integerBetween(profile.rirRange[0], profile.rirRange[1]);
          const loadKg = roundDownToIncrement(trueE1rm[planned.exercise] / (1 + (reps + plannedRir - 1) / 30));
          const trueRir = Math.max(0, Math.floor(predictedMaxReps(loadKg, trueE1rm[planned.exercise]) - reps + 1e-9));
          const noise = random.integerBetween(-1, 1);
          const unrated = random.next() < UNRATED_SET_FRACTION;
          setCounter += 1;
          sets.push({
            id: `set-${setCounter}`,
            exerciseId: planned.exercise,
            position: sets.length,
            weightKg: loadKg,
            reps,
            isWarmup: false,
            effort: loggedEffort(trueRir, noise, unrated),
          });
        }
      }

      const session: SessionInput = {
        id: `${profile.name}-${String(week).padStart(5, '0')}-${dayIndex}`,
        startedAt,
        sets,
      };
      const strength = strengthStateAt(history, session, cfg);
      const { nextState, outputs } = processSession({ skillXp, bodyweightKg: null }, session, cfg, {
        catalog: SIM_CATALOG,
        strength,
      });
      Object.assign(skillXp, nextState.skillXp);
      for (const result of outputs.sets) {
        for (const skill of SIM_SKILLS)
          effectiveRepsBySkill[skill.key] += result.effectiveReps * shareOf(result.set.exerciseId, skill.key);
      }
      history = recentHistoryOnly(
        [...history, ...strengthHistoryRows(session, outputs.sets)].sort((a, b) =>
          compareSessionKeys(a.session, b.session),
        ),
        Date.parse(startedAt),
        cfg,
      );
    });

    recordWeek(week, skillXp);
    for (const exercise of Object.keys(trueE1rm)) trueE1rm[exercise] *= weeklyGrowthFactor(week);
  }

  const averageWeeklyEffectiveRepsBySkill = Object.fromEntries(
    Object.entries(effectiveRepsBySkill).map(([skill, total]) => [skill, total / Math.max(1, week)]),
  );
  return {
    profile: profile.name,
    weeksToLevel99,
    cumulativeXpByWeek,
    averageWeeklyEffectiveRepsBySkill,
    weeksSimulated: week,
  };
}

export function firstSkillToLevel99(result: SimulationResult): string | null {
  const reached = Object.entries(result.weeksToLevel99).filter((entry): entry is [string, number] => entry[1] !== null);
  if (reached.length === 0) return null;
  return reached.sort((a, b) => a[1] - b[1])[0][0];
}
