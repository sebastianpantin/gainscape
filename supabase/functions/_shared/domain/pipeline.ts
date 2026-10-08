import type { BalanceConfig } from './balance.ts';
import { boutPace, cardioSkillXp, countedWorkSeconds, derivedCardioEffort, SECONDS_PER_MINUTE } from './cardio.ts';
import { resolveEffort } from './effort.ts';
import { levelForXp } from './levels.ts';
import type {
  CardioExerciseDef,
  CardioSetInput,
  Catalog,
  ExerciseDef,
  LevelUp,
  LiftExerciseDef,
  LiftSetInput,
  SessionInput,
  SessionSummary,
  SetInput,
  SetResult,
  SkillDef,
  SkillXp,
  StrengthState,
  UserState,
} from './types.ts';
import { isLiftResult, measuresRepsCapacity, NO_RECORDS } from './types.ts';
import { BodyweightLoadNotZeroError, BodyweightRequiredError } from './errors.ts';
import { challengeBonusXp, type ChallengeVerdict, judgeChallenge } from './challenges.ts';
import { cardioExercise, exerciseFor, liftExercise, liftExerciseFor } from './exercise-lookup.ts';
import { detectPersonalRecords, summarizePersonalRecords } from './records.ts';
import { checkFatigue } from './fatigue.ts';
import { gearBonusXp } from './gear.ts';
import { roundTo } from './math.ts';
import { liftsNoLoad, trackStrength } from './strength.ts';
import { effectiveReps, setXp, splitXp } from './xp.ts';

export interface PipelineDeps {
  catalog: Catalog;
  strength?: StrengthState;
}

export interface SessionContext {
  readonly session: SessionInput;
  readonly cfg: BalanceConfig;
  readonly deps: PipelineDeps;
  readonly stateBeforeSession: UserState;
  readonly state: UserState;
  readonly sets: readonly SetResult[];
  readonly levelUps: readonly LevelUp[];
  readonly bonusXpBySkill?: Readonly<Record<string, SessionBonusXp>>;
  readonly challengeVerdict?: ChallengeVerdict;
}

export interface SessionBonusXp {
  readonly baseXp: number;
  readonly gear: number;
  readonly challenge: number;
}

export type Step = (ctx: SessionContext) => SessionContext;

export interface SessionOutputs extends Omit<SessionSummary, 'sessionId'> {
  sets: SetResult[];
  challengeVerdict?: ChallengeVerdict;
}

function skillsInDisplayOrder(catalog: Catalog): SkillDef[] {
  return [...catalog.skills].sort((a, b) => a.sortOrder - b.sortOrder);
}

function assertNoAddedLoadOnPureBodyweight(set: Pick<LiftSetInput, 'weightKg'>, exercise: LiftExerciseDef): void {
  if (measuresRepsCapacity(exercise.loadType) && set.weightKg > 0) throw new BodyweightLoadNotZeroError();
}

export function effectiveLoadForNewSet(
  set: Pick<LiftSetInput, 'weightKg'>,
  anyExercise: ExerciseDef,
  bodyweightKg: number | null,
): number {
  const exercise = liftExercise(anyExercise);
  assertNoAddedLoadOnPureBodyweight(set, exercise);
  if (exercise.loadType === 'external') return set.weightKg;
  if (bodyweightKg === null) throw new BodyweightRequiredError();
  return bodyweightKg + set.weightKg;
}

export interface StoredSetLoad {
  exerciseId: string;
  weightKg: number;
  effectiveLoadKg: number;
}

export function carriedEffectiveLoadKg(
  stored: StoredSetLoad,
  next: Pick<LiftSetInput, 'exerciseId' | 'weightKg'>,
  anyExercise: ExerciseDef,
  bodyweightKg: number | null,
): number {
  const exercise = liftExercise(anyExercise);
  assertNoAddedLoadOnPureBodyweight(next, exercise);
  if (exercise.loadType === 'external') return roundTo(2, next.weightKg);
  if (stored.exerciseId === next.exerciseId) {
    return roundTo(2, stored.effectiveLoadKg - stored.weightKg + next.weightKg);
  }
  return roundTo(2, effectiveLoadForNewSet(next, exercise, bodyweightKg));
}

export type WritableSet = (LiftSetInput & { effectiveLoadKg: number }) | CardioSetInput;

export function writableSetFor(
  set: SetInput,
  exercise: ExerciseDef,
  bodyweightKg: number | null,
  stored?: StoredSetLoad,
): WritableSet {
  if (set.kind === 'cardio') {
    cardioExercise(exercise);
    return set;
  }
  const effectiveLoadKg =
    stored === undefined
      ? effectiveLoadForNewSet(set, exercise, bodyweightKg)
      : carriedEffectiveLoadKg(stored, set, exercise, bodyweightKg);
  return { ...set, effectiveLoadKg };
}

function effectiveLoadKg(set: LiftSetInput, exercise: LiftExerciseDef, state: UserState): number {
  if (set.recordedEffectiveLoadKg === undefined) return effectiveLoadForNewSet(set, exercise, state.bodyweightKg);
  assertNoAddedLoadOnPureBodyweight(set, exercise);
  return set.recordedEffectiveLoadKg;
}

const UNSCORED_RESULT_FIELDS = Object.freeze({
  rir: null,
  rirForXp: null,
  rirFlagged: false,
  intensityBonus: 1,
  coldStartXp: 0,
  e1rmBeforeKg: null,
  repsCapacityBefore: null,
  e1rmCandidateKg: null,
  repsCapacityCandidate: null,
  effectiveLoadKg: 0,
  personalRecord: null,
  effectiveReps: 0,
  xp: 0,
  cardio: null,
});

function liftResult(set: LiftSetInput, exercise: LiftExerciseDef, ctx: SessionContext): SetResult {
  const { effortInputType, effortValue, loggedRir } = resolveEffort(set.effort, ctx.cfg, 'lift');
  return {
    ...UNSCORED_RESULT_FIELDS,
    set,
    skillXp: [],
    effortInputType,
    effortValue,
    rir: loggedRir,
    rirSource: loggedRir === null ? 'cold_start' : 'logged',
    rirForXp: loggedRir,
    effectiveLoadKg: effectiveLoadKg(set, exercise, ctx.state),
  };
}

function cardioResult(
  bout: CardioSetInput,
  exercise: CardioExerciseDef,
  counted: { workS: number; xpWorkS: number },
  ctx: SessionContext,
): SetResult {
  const { effortInputType, effortValue } = resolveEffort(bout.effort, ctx.cfg, 'cardio');
  return {
    ...UNSCORED_RESULT_FIELDS,
    set: bout,
    skillXp: [],
    effortInputType,
    effortValue,
    rirSource: bout.effort === null ? 'default' : 'logged',
    cardio: {
      records: [],
      countedWorkS: counted.workS,
      xpCountedWorkS: counted.xpWorkS,
      cappedWorkS: counted.workS - counted.xpWorkS,
      effort: derivedCardioEffort(bout.effort, exercise.cardio.maxEffort),
      ...boutPace(bout, exercise, ctx.cfg),
    },
  };
}

const resolveSets: Step = (ctx) => {
  let xpWorkSecondsLeft = ctx.cfg.cardioMaxCountedMinutesPerSession * SECONDS_PER_MINUTE;
  const sets = [...ctx.session.sets]
    .sort((a, b) => a.position - b.position)
    .map((set): SetResult => {
      const exercise = exerciseFor(set, ctx.deps.catalog);
      if (set.kind === 'cardio') {
        const workS = countedWorkSeconds(set);
        const xpWorkS = Math.min(workS, xpWorkSecondsLeft);
        xpWorkSecondsLeft -= xpWorkS;
        return cardioResult(set, cardioExercise(exercise), { workS, xpWorkS }, ctx);
      }
      return liftResult(set, liftExercise(exercise), ctx);
    });
  return { ...ctx, sets };
};

const awardXp: Step = (ctx) => {
  const skillsById = new Map(ctx.deps.catalog.skills.map((skill) => [skill.id, skill]));
  const sortOrderOf = (skillId: string) => skillsById.get(skillId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const xpSetsSeenByExercise = new Map<string, number>();
  const sets = ctx.sets.map((result) => {
    if (result.cardio !== null) {
      const shares = [...exerciseFor(result.set, ctx.deps.catalog).shares]
        .sort((a, b) => sortOrderOf(a.skillId) - sortOrderOf(b.skillId))
        .map((share) => ({ ...share, skillKey: skillsById.get(share.skillId)?.key ?? '' }));
      const steady = result.set.kind === 'cardio' && result.set.interval === null;
      const skillXp = cardioSkillXp({ ...result.cardio, steady }, shares, ctx.cfg);
      return { ...result, xp: skillXp.reduce((sum, part) => sum + part.xp, 0), skillXp };
    }
    if (!isLiftResult(result)) return result;
    const exercise = liftExerciseFor(result.set, ctx.deps.catalog);
    const earnsNothing = result.rirForXp === null || liftsNoLoad(exercise, result.effectiveLoadKg);
    const effectiveRepCount = earnsNothing
      ? 0
      : effectiveReps(result.set.reps, result.rirForXp!, result.set.isWarmup, ctx.cfg);
    const xp = result.rirForXp === null ? result.coldStartXp : setXp(effectiveRepCount, result.intensityBonus, ctx.cfg);
    const xpSetOrdinal = xpSetsSeenByExercise.get(exercise.id) ?? 0;
    if (xp > 0) xpSetsSeenByExercise.set(exercise.id, xpSetOrdinal + 1);
    const shares = exercise.shares.map((share) => ({ ...share, sortOrder: sortOrderOf(share.skillId) }));
    return { ...result, effectiveReps: effectiveRepCount, xp, skillXp: splitXp(xp, shares, xpSetOrdinal) };
  });
  return { ...ctx, sets };
};

function spreadBonus(parts: readonly SkillXp[], baseXp: number, bonus: number): void {
  const shares = parts.map((part) => ({
    part,
    share: Math.floor((bonus * part.xp) / baseXp),
    remainder: (bonus * part.xp) % baseXp,
  }));
  const leftover = bonus - shares.reduce((sum, entry) => sum + entry.share, 0);
  [...shares]
    .sort((a, b) => b.remainder - a.remainder)
    .slice(0, leftover)
    .forEach((entry) => (entry.share += 1));
  for (const entry of shares) entry.part.xp += entry.share;
}

const awardSessionBonuses: Step = (ctx) => {
  const loadout = ctx.session.gearLoadout;
  const challenge = ctx.session.challenge;
  if (!loadout && !challenge) return ctx;
  const challengeVerdict = challenge ? judgeChallenge(challenge.definition, ctx.sets, challenge.e1rmKg) : undefined;
  const skillKeyOf = new Map(ctx.deps.catalog.skills.map((skill) => [skill.id, skill.key]));
  const sets = ctx.sets.map((result) => ({ ...result, skillXp: result.skillXp.map((part) => ({ ...part })) }));
  const partsBySkill = new Map<string, SkillXp[]>();
  for (const part of sets.flatMap((result) => result.skillXp)) {
    partsBySkill.set(part.skillId, [...(partsBySkill.get(part.skillId) ?? []), part]);
  }
  const bonusXpBySkill: Record<string, SessionBonusXp> = {};
  for (const [skillId, parts] of partsBySkill) {
    const skillKey = skillKeyOf.get(skillId);
    if (skillKey === undefined) continue;
    const baseXp = parts.reduce((sum, part) => sum + part.xp, 0);
    const gear = gearBonusXp(baseXp, skillKey, loadout, ctx.cfg);
    const challengeBonus = challengeVerdict?.passed ? challengeBonusXp(baseXp, ctx.cfg) : 0;
    if (baseXp === 0 || gear + challengeBonus === 0) continue;
    spreadBonus(parts, baseXp, gear + challengeBonus);
    bonusXpBySkill[skillKey] = { baseXp, gear, challenge: challengeBonus };
  }
  return { ...ctx, sets, bonusXpBySkill, challengeVerdict };
};

const applyXp: Step = (ctx) => {
  const skillXp: Record<string, number> = { ...ctx.state.skillXp };
  for (const part of ctx.sets.flatMap((result) => result.skillXp)) {
    skillXp[part.skillId] = Math.min(ctx.cfg.maxXp, (skillXp[part.skillId] ?? 0) + part.xp);
  }
  return { ...ctx, state: { ...ctx.state, skillXp } };
};

const detectLevelUps: Step = (ctx) => {
  const levelUps = skillsInDisplayOrder(ctx.deps.catalog)
    .map((skill) => ({
      skill: skill.key,
      from: levelForXp(ctx.stateBeforeSession.skillXp[skill.id] ?? 0),
      to: levelForXp(ctx.state.skillXp[skill.id] ?? 0),
    }))
    .filter((levelUp) => levelUp.to > levelUp.from);
  return { ...ctx, levelUps };
};

export const DEFAULT_STEPS: readonly Step[] = Object.freeze([
  resolveSets,
  trackStrength,
  checkFatigue,
  detectPersonalRecords,
  awardXp,
  awardSessionBonuses,
  applyXp,
  detectLevelUps,
]);

export const HISTORY_ONLY_STEPS: readonly Step[] = Object.freeze([resolveSets]);

export function historyOnlySummary(sessionId: string): SessionSummary {
  return { sessionId, xpBySkill: {}, levelUps: [], prs: [], drops: [], historyOnly: true };
}

export function pendingSummary(sessionId: string): Pick<SessionSummary, 'sessionId' | 'drops'> {
  return { sessionId, drops: [] };
}

function xpGainedBySkillKey(before: UserState, after: UserState, catalog: Catalog): Record<string, number> {
  const xpBySkill: Record<string, number> = {};
  for (const skill of skillsInDisplayOrder(catalog)) {
    const gained = (after.skillXp[skill.id] ?? 0) - (before.skillXp[skill.id] ?? 0);
    if (gained > 0) xpBySkill[skill.key] = gained;
  }
  return xpBySkill;
}

const NO_BONUS: SessionBonusXp = Object.freeze({ baseXp: 0, gear: 0, challenge: 0 });

function positiveEntries(entries: readonly (readonly [string, number])[]): Record<string, number> | undefined {
  const positive = entries.filter(([, bonus]) => bonus > 0);
  return positive.length === 0 ? undefined : Object.fromEntries(positive);
}

function bonusesWithinGains(
  bonusXpBySkill: Readonly<Record<string, SessionBonusXp>>,
  xpBySkill: Readonly<Record<string, number>>,
): Pick<SessionOutputs, 'gearBonusBySkill' | 'challengeBonusBySkill'> {
  const reported = Object.entries(xpBySkill).map(([skillKey, gained]) => {
    const { baseXp, gear, challenge } = bonusXpBySkill[skillKey] ?? NO_BONUS;
    const bonusRoom = Math.max(0, gained - baseXp);
    const challengeGained = Math.min(challenge, bonusRoom);
    return { skillKey, challengeGained, gearGained: Math.min(gear, bonusRoom - challengeGained) };
  });
  const gearBonusBySkill = positiveEntries(reported.map((entry) => [entry.skillKey, entry.gearGained]));
  const challengeBonusBySkill = positiveEntries(reported.map((entry) => [entry.skillKey, entry.challengeGained]));
  return {
    ...(gearBonusBySkill === undefined ? {} : { gearBonusBySkill }),
    ...(challengeBonusBySkill === undefined ? {} : { challengeBonusBySkill }),
  };
}

export function processSession(
  state: UserState,
  session: SessionInput,
  cfg: BalanceConfig,
  deps: PipelineDeps,
  steps: readonly Step[] = DEFAULT_STEPS,
): { nextState: UserState; outputs: SessionOutputs } {
  const initial: SessionContext = { session, cfg, deps, stateBeforeSession: state, state, sets: [], levelUps: [] };
  const final = steps.reduce((ctx, step) => step(ctx), initial);
  const xpBySkill = xpGainedBySkillKey(state, final.state, deps.catalog);
  return {
    nextState: final.state,
    outputs: {
      sets: [...final.sets],
      xpBySkill,
      levelUps: [...final.levelUps],
      prs: summarizePersonalRecords(final.sets, state.records ?? NO_RECORDS, final.state.records ?? NO_RECORDS),
      drops: [],
      ...bonusesWithinGains(final.bonusXpBySkill ?? {}, xpBySkill),
      ...(final.challengeVerdict === undefined ? {} : { challengeVerdict: final.challengeVerdict }),
    },
  };
}
