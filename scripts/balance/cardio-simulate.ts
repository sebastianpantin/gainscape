import {
  type BalanceConfig,
  type CardioSetInput,
  type GearLoadout,
  intervalDurationSeconds,
  processSession,
  type SessionInput,
  type SkillDef,
} from '../../supabase/functions/_shared/domain/index.ts';
import { CARDIO_SIM_CATALOG, CARDIO_SIM_EXERCISES, CARDIO_SIM_SKILLS } from './catalog.ts';
import { type CardioAthleteProfile, type PlannedBout, STEADY_AGILITY_BOUT } from './profiles.ts';
import { DAY_MS, SIMULATION_SEED, skillProgress } from './progress.ts';
import { seededRandom, type SeededRandom } from './random.ts';
import { WEEKS_PER_YEAR } from './simulate.ts';

const MAX_SIMULATED_YEARS = 10;
const METRES_PER_KM = 1000;
const DISTANCE_DECIMALS_FACTOR = 10;

const SIMULATION_START_MS = Date.parse('2026-01-05T07:00:00.000Z');

export interface CardioSimulationResult {
  profile: string;
  weeksToLevel99: Record<string, number | null>;
  cumulativeXpByWeek: Record<string, number[]>;
  weeksSimulated: number;
}

export interface CardioSimulationOptions {
  maxYears?: number;
  stopWhenAllSkillsReach99?: boolean;
  gearLoadout?: GearLoadout;
  skills?: readonly SkillDef[];
}

function distanceAtSpeedRatio(
  plan: PlannedBout,
  durationS: number,
  random: SeededRandom,
  range: readonly [number, number],
) {
  const referencePaceSPerKm = CARDIO_SIM_EXERCISES[plan.exercise].cardio.referencePaceSPerKm;
  if (plan.interval || referencePaceSPerKm === null) return null;
  const ratio = range[0] + random.next() * (range[1] - range[0]);
  const distanceM = (ratio * durationS * METRES_PER_KM) / referencePaceSPerKm;
  return Math.round(distanceM * DISTANCE_DECIMALS_FACTOR) / DISTANCE_DECIMALS_FACTOR;
}

function boutFor(
  plan: PlannedBout,
  id: string,
  position: number,
  random: SeededRandom,
  speedRatioRange: readonly [number, number],
): CardioSetInput {
  const interval = plan.interval ?? null;
  const durationS = interval ? intervalDurationSeconds(interval) : plan.durationS!;
  return {
    kind: 'cardio',
    id,
    exerciseId: plan.exercise,
    position,
    durationS,
    distanceM: distanceAtSpeedRatio(plan, durationS, random, speedRatioRange),
    interval,
    effort: { type: 'cardio', level: plan.effort },
  };
}

function sessionSkillXp(session: SessionInput, cfg: BalanceConfig): Record<string, number> {
  const { nextState } = processSession({ skillXp: {}, bodyweightKg: null }, session, cfg, {
    catalog: CARDIO_SIM_CATALOG,
  });
  return { ...nextState.skillXp };
}

export function simulateCardioProfile(
  profile: CardioAthleteProfile,
  cfg: BalanceConfig,
  options: CardioSimulationOptions = {},
): CardioSimulationResult {
  const random = seededRandom(SIMULATION_SEED);
  const maxWeeks = (options.maxYears ?? MAX_SIMULATED_YEARS) * WEEKS_PER_YEAR;
  const skillXp: Record<string, number> = {};
  const skills = options.skills ?? CARDIO_SIM_SKILLS;
  const { cumulativeXpByWeek, weeksToLevel99, recordWeek } = skillProgress(skills);
  const allReached99 = () => skills.every((skill) => weeksToLevel99[skill.key] !== null);
  let setCounter = 0;
  let week = 0;

  for (; week < maxWeeks && !(options.stopWhenAllSkillsReach99 && allReached99()); week++) {
    profile.weeklySessions.forEach((plans, dayIndex) => {
      const startedAt = new Date(
        SIMULATION_START_MS + (week * 7 + profile.dayOffsets[dayIndex]) * DAY_MS,
      ).toISOString();
      const sets = plans.map((plan, position) => {
        setCounter += 1;
        return boutFor(plan, `bout-${setCounter}`, position, random, profile.speedRatioRange);
      });
      const session: SessionInput = {
        id: `${profile.name}-${String(week).padStart(5, '0')}-${dayIndex}`,
        startedAt,
        sets,
        gearLoadout: options.gearLoadout,
      };
      const { nextState } = processSession({ skillXp, bodyweightKg: null }, session, cfg, {
        catalog: CARDIO_SIM_CATALOG,
      });
      Object.assign(skillXp, nextState.skillXp);
    });

    recordWeek(week, skillXp);
  }

  return { profile: profile.name, weeksToLevel99, cumulativeXpByWeek, weeksSimulated: week };
}

function singleBoutSession(plans: readonly PlannedBout[], id: string, profile: CardioAthleteProfile): SessionInput {
  const random = seededRandom(SIMULATION_SEED);
  return {
    id,
    startedAt: new Date(SIMULATION_START_MS).toISOString(),
    sets: plans.map((plan, position) => boutFor(plan, `${id}-${position}`, position, random, profile.speedRatioRange)),
  };
}

export function steadyAgilityBoutXp(profile: CardioAthleteProfile, cfg: BalanceConfig): number {
  return sessionSkillXp(singleBoutSession([STEADY_AGILITY_BOUT], 'steady-agility', profile), cfg).agility ?? 0;
}

export function intervalSessionAgilityXp(profile: CardioAthleteProfile, cfg: BalanceConfig): number {
  const intervalSessions = profile.weeklySessions.filter((plans) => plans.some((plan) => plan.interval));
  return Math.min(
    ...intervalSessions.map(
      (plans, index) => sessionSkillXp(singleBoutSession(plans, `interval-${index}`, profile), cfg).agility ?? 0,
    ),
  );
}
