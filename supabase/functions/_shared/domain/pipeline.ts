import type { BalanceConfig } from './balance.ts';
import { resolveEffort } from './effort.ts';
import { levelForXp } from './levels.ts';
import type {
  Catalog,
  ExerciseDef,
  LevelUp,
  Rng,
  RollKind,
  SessionInput,
  SessionSummary,
  SetInput,
  SetResult,
  SkillDef,
  StrengthState,
  UserState,
} from './types.ts';
import { NO_RECORDS } from './types.ts';
import { detectPersonalRecords, summarizePersonalRecords } from './records.ts';
import { trackStrength } from './strength.ts';
import { effectiveReps, setXp, splitXp } from './xp.ts';

export interface PipelineDeps {
  catalog: Catalog;
  strength?: StrengthState;
  rngFor?: (setId: string, kind: RollKind) => Rng;
}

export interface SessionContext {
  readonly session: SessionInput;
  readonly cfg: BalanceConfig;
  readonly deps: PipelineDeps;
  readonly stateBeforeSession: UserState;
  readonly state: UserState;
  readonly sets: readonly SetResult[];
  readonly levelUps: readonly LevelUp[];
}

export type Step = (ctx: SessionContext) => SessionContext;

export interface SessionOutputs extends Omit<SessionSummary, 'sessionId'> {
  sets: SetResult[];
}

export class UnknownExerciseError extends Error {
  readonly exerciseId: string;

  constructor(exerciseId: string) {
    super(`unknown exercise: ${exerciseId}`);
    this.exerciseId = exerciseId;
  }
}

export class BodyweightRequiredError extends Error {
  constructor() {
    super('bodyweight required');
  }
}

function skillsInDisplayOrder(catalog: Catalog): SkillDef[] {
  return [...catalog.skills].sort((a, b) => a.sortOrder - b.sortOrder);
}

function exerciseFor(set: SetInput, catalog: Catalog): ExerciseDef {
  const exercise = catalog.exercises.get(set.exerciseId);
  if (!exercise) throw new UnknownExerciseError(set.exerciseId);
  return exercise;
}

export class BodyweightLoadNotZeroError extends Error {
  constructor() {
    super('pure bodyweight sets carry no added load');
  }
}

function effectiveLoadKg(set: SetInput, exercise: ExerciseDef, state: UserState): number {
  if (exercise.loadType === 'bodyweight' && set.weightKg > 0) throw new BodyweightLoadNotZeroError();
  if (set.recordedEffectiveLoadKg !== undefined) return set.recordedEffectiveLoadKg;
  if (exercise.loadType === 'external') return set.weightKg;
  if (state.bodyweightKg === null) throw new BodyweightRequiredError();
  return state.bodyweightKg + set.weightKg;
}

export const resolveSets: Step = (ctx) => {
  const sets = [...ctx.session.sets]
    .sort((a, b) => a.position - b.position)
    .map((set): SetResult => {
      const exercise = exerciseFor(set, ctx.deps.catalog);
      const { effortInputType, effortValue, loggedRir } = resolveEffort(set.effort, ctx.cfg);
      return {
        set,
        effortInputType,
        effortValue,
        rir: loggedRir,
        rirSource: loggedRir === null ? 'cold_start' : 'logged',
        rirForXp: loggedRir,
        rirFlagged: false,
        intensityBonus: 1,
        coldStartXp: 0,
        e1rmBeforeKg: null,
        repsCapacityBefore: null,
        e1rmCandidateKg: null,
        repsCapacityCandidate: null,
        effectiveLoadKg: effectiveLoadKg(set, exercise, ctx.state),
        personalRecord: null,
        effectiveReps: 0,
        xp: 0,
        skillXp: [],
      };
    });
  return { ...ctx, sets };
};

export const awardXp: Step = (ctx) => {
  const sortOrderBySkillId = new Map(ctx.deps.catalog.skills.map((skill) => [skill.id, skill.sortOrder]));
  const sets = ctx.sets.map((result) => {
    const effectiveRepCount =
      result.rirForXp === null ? 0 : effectiveReps(result.set.reps, result.rirForXp, result.set.isWarmup, ctx.cfg);
    const xp = result.rirForXp === null ? result.coldStartXp : setXp(effectiveRepCount, result.intensityBonus, ctx.cfg);
    const shares = exerciseFor(result.set, ctx.deps.catalog).shares.map((share) => ({
      ...share,
      sortOrder: sortOrderBySkillId.get(share.skillId) ?? Number.MAX_SAFE_INTEGER,
    }));
    return { ...result, effectiveReps: effectiveRepCount, xp, skillXp: splitXp(xp, shares) };
  });
  return { ...ctx, sets };
};

export const applyXp: Step = (ctx) => {
  const skillXp: Record<string, number> = { ...ctx.state.skillXp };
  for (const part of ctx.sets.flatMap((result) => result.skillXp)) {
    skillXp[part.skillId] = Math.min(ctx.cfg.maxXp, (skillXp[part.skillId] ?? 0) + part.xp);
  }
  return { ...ctx, state: { ...ctx.state, skillXp } };
};

export const detectLevelUps: Step = (ctx) => {
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
  detectPersonalRecords,
  awardXp,
  applyXp,
  detectLevelUps,
]);

function xpGainedBySkillKey(sets: readonly SetResult[], catalog: Catalog): Record<string, number> {
  const xpBySkill: Record<string, number> = {};
  for (const skill of skillsInDisplayOrder(catalog)) {
    const gained = sets
      .flatMap((result) => result.skillXp)
      .filter((part) => part.skillId === skill.id)
      .reduce((sum, part) => sum + part.xp, 0);
    if (gained > 0) xpBySkill[skill.key] = gained;
  }
  return xpBySkill;
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
  return {
    nextState: final.state,
    outputs: {
      sets: [...final.sets],
      xpBySkill: xpGainedBySkillKey(final.sets, deps.catalog),
      levelUps: [...final.levelUps],
      prs: summarizePersonalRecords(final.sets, state.records ?? NO_RECORDS, final.state.records ?? NO_RECORDS),
      drops: [],
    },
  };
}
