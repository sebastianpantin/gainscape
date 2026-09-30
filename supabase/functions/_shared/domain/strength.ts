import type { BalanceConfig } from './balance.ts';
import { compareSessionKeys, isBefore } from './ordering.ts';
import type { SessionContext, Step } from './pipeline.ts';
import type {
  ExerciseDef,
  ExerciseStrength,
  SessionKey,
  SetResult,
  StrengthHistoryRow,
  StrengthState,
} from './types.ts';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const FLOOR_TOLERANCE = 1e-9;

const NO_STRENGTH: ExerciseStrength = Object.freeze({ windowMax: null, fallbackMax: null, hasPriorSession: false });

export function roundTo(decimals: number, value: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function epley(loadKg: number, repsToFailure: number): number {
  return roundTo(2, loadKg * (1 + (repsToFailure - 1) / 30));
}

export function predictedMaxReps(loadKg: number, e1rmKg: number): number {
  return Math.max(0, 1 + 30 * (e1rmKg / loadKg - 1));
}

export function estimateRir(loadKg: number, reps: number, e1rmKg: number): number {
  return Math.max(0, Math.floor(predictedMaxReps(loadKg, e1rmKg) - reps + FLOOR_TOLERANCE));
}

export function intensityBonus(loadKg: number, e1rmKg: number | null, cfg: BalanceConfig): number {
  if (e1rmKg === null || e1rmKg <= 0 || loadKg <= 0) return 1;
  const relativeIntensity = loadKg / e1rmKg;
  if (relativeIntensity <= cfg.intensityBonusStart) return 1;
  const progress = Math.min(
    1,
    (relativeIntensity - cfg.intensityBonusStart) / (cfg.intensityBonusFull - cfg.intensityBonusStart),
  );
  return roundTo(6, 1 + (cfg.intensityBonusMax - 1) * progress);
}

function usesRepsCapacity(exercise: ExerciseDef): boolean {
  return exercise.loadType === 'bodyweight';
}

function maxOrNull(...values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? Math.max(...present) : null;
}

export function strengthStateAt(
  history: readonly StrengthHistoryRow[],
  session: SessionKey,
  cfg: BalanceConfig,
): StrengthState {
  const windowStartMs = Date.parse(session.startedAt) - cfg.e1rmWindowDays * MS_PER_DAY;
  const rowsByExercise = new Map<string, StrengthHistoryRow[]>();
  for (const row of history) {
    if (!isBefore(row.session, session)) continue;
    const rows = rowsByExercise.get(row.exerciseId) ?? [];
    rows.push(row);
    rowsByExercise.set(row.exerciseId, rows);
  }
  const state: Record<string, ExerciseStrength> = {};

  for (const [exerciseId, rows] of rowsByExercise) {
    if (rows.every((row) => row.isWarmup)) continue;
    const withCandidates = rows.filter((row) => row.strengthCandidate !== null);
    const inWindow = withCandidates.filter((row) => Date.parse(row.session.startedAt) >= windowStartMs);
    const mostRecentSession = withCandidates
      .map((row) => row.session)
      .reduce<SessionKey | null>(
        (latest, candidate) => (latest === null || compareSessionKeys(candidate, latest) > 0 ? candidate : latest),
        null,
      );
    const fromMostRecentSession = withCandidates.filter(
      (row) => mostRecentSession && row.session.id === mostRecentSession.id,
    );

    state[exerciseId] = {
      windowMax: maxOrNull(...inWindow.map((row) => row.strengthCandidate)),
      fallbackMax: maxOrNull(...fromMostRecentSession.map((row) => row.strengthCandidate)),
      hasPriorSession: true,
    };
  }
  return state;
}

interface ExerciseSessionProgress {
  strengthAtSessionStart: number | null;
  bestCandidateThisSession: number | null;
  firstCandidateThisSession: number | null;
}

interface StrengthDecision {
  rir: number | null;
  rirSource: SetResult['rirSource'];
  rirForXp: number | null;
  rirFlagged: boolean;
  coldStartXp: number;
  rirUsedForStrength: number | null;
}

function estimateFor(result: SetResult, exercise: ExerciseDef, strengthBefore: number | null): number | null {
  if (strengthBefore === null || strengthBefore <= 0) return null;
  if (usesRepsCapacity(exercise)) return Math.max(0, strengthBefore - result.set.reps);
  if (result.effectiveLoadKg <= 0) return null;
  return estimateRir(result.effectiveLoadKg, result.set.reps, strengthBefore);
}

function beatsPrediction(result: SetResult, exercise: ExerciseDef, strengthBefore: number): boolean {
  if (usesRepsCapacity(exercise)) return result.set.reps > strengthBefore;
  return result.set.reps > predictedMaxReps(result.effectiveLoadKg, strengthBefore);
}

function decideEffort(
  result: SetResult,
  exercise: ExerciseDef,
  strengthBefore: number | null,
  isBaselineSession: boolean,
  cfg: BalanceConfig,
): StrengthDecision {
  const estimated = estimateFor(result, exercise, strengthBefore);
  const logged = result.rir;

  if (logged !== null) {
    const trustFloor = estimated === null ? null : estimated - cfg.rirTrustMargin;
    const claimsImplausibleEffort = trustFloor !== null && logged < trustFloor;
    return {
      rir: logged,
      rirSource: 'logged',
      rirForXp: claimsImplausibleEffort ? trustFloor : logged,
      rirFlagged: claimsImplausibleEffort,
      coldStartXp: 0,
      rirUsedForStrength: Math.min(logged, cfg.maxRirForStrength),
    };
  }

  const coldStart = (coldStartXp: number): StrengthDecision => ({
    rir: null,
    rirSource: 'cold_start',
    rirForXp: null,
    rirFlagged: false,
    coldStartXp,
    rirUsedForStrength: cfg.coldStartAssumedRir,
  });

  if (isBaselineSession) {
    return coldStart(exercise.builtIn && !result.set.isWarmup ? cfg.coldStartXpPerSet : 0);
  }
  if (estimated === null) return coldStart(0);

  return {
    rir: estimated,
    rirSource: 'estimated',
    rirForXp: estimated,
    rirFlagged: false,
    coldStartXp: 0,
    rirUsedForStrength: beatsPrediction(result, exercise, strengthBefore!) ? 0 : null,
  };
}

function uncappedCandidate(
  result: SetResult,
  exercise: ExerciseDef,
  rirUsedForStrength: number | null,
  cfg: BalanceConfig,
): number | null {
  if (result.set.isWarmup || rirUsedForStrength === null) return null;
  const repsToFailure = result.set.reps + rirUsedForStrength;
  if (usesRepsCapacity(exercise)) return result.set.reps + Math.floor(rirUsedForStrength);
  if (result.effectiveLoadKg <= 0 || repsToFailure > cfg.epleyMaxRepsToFailure) return null;
  return epley(result.effectiveLoadKg, repsToFailure);
}

function capGrowth(candidate: number, anchor: number | null, exercise: ExerciseDef, cfg: BalanceConfig): number {
  if (anchor === null) return candidate;
  const ceiling = anchor * (1 + cfg.maxStrengthGainPerSession);
  return Math.min(candidate, usesRepsCapacity(exercise) ? Math.ceil(roundTo(6, ceiling)) : roundTo(2, ceiling));
}

export const trackStrength: Step = (ctx: SessionContext) => {
  const progressByExercise = new Map<string, ExerciseSessionProgress>();

  const sets = ctx.sets.map((result): SetResult => {
    const exercise = ctx.deps.catalog.exercises.get(result.set.exerciseId)!;
    const known = ctx.deps.strength?.[exercise.id] ?? NO_STRENGTH;
    const progress = progressByExercise.get(exercise.id) ?? {
      strengthAtSessionStart: known.windowMax ?? known.fallbackMax,
      bestCandidateThisSession: null,
      firstCandidateThisSession: null,
    };

    const strengthBefore = maxOrNull(known.windowMax, progress.bestCandidateThisSession) ?? known.fallbackMax;
    const decision = decideEffort(result, exercise, strengthBefore, !known.hasPriorSession, ctx.cfg);

    const rawCandidate = uncappedCandidate(result, exercise, decision.rirUsedForStrength, ctx.cfg);
    const growthAnchor = progress.strengthAtSessionStart ?? progress.firstCandidateThisSession;
    const candidate =
      rawCandidate !== null && decision.rirSource === 'logged'
        ? capGrowth(rawCandidate, growthAnchor, exercise, ctx.cfg)
        : rawCandidate;

    progressByExercise.set(exercise.id, {
      strengthAtSessionStart: progress.strengthAtSessionStart,
      bestCandidateThisSession: maxOrNull(progress.bestCandidateThisSession, candidate),
      firstCandidateThisSession: progress.firstCandidateThisSession ?? candidate,
    });

    const repsModel = usesRepsCapacity(exercise);
    return {
      ...result,
      rir: decision.rir,
      rirSource: decision.rirSource,
      rirForXp: decision.rirForXp,
      rirFlagged: decision.rirFlagged,
      coldStartXp: decision.coldStartXp,
      intensityBonus: repsModel ? 1 : intensityBonus(result.effectiveLoadKg, strengthBefore, ctx.cfg),
      e1rmBeforeKg: repsModel ? null : strengthBefore,
      repsCapacityBefore: repsModel ? strengthBefore : null,
      e1rmCandidateKg: repsModel ? null : candidate,
      repsCapacityCandidate: repsModel ? candidate : null,
    };
  });

  return { ...ctx, sets };
};

export function strengthHistoryRows(session: SessionKey, sets: readonly SetResult[]): StrengthHistoryRow[] {
  return sets.map((result) => ({
    exerciseId: result.set.exerciseId,
    session,
    isWarmup: result.set.isWarmup,
    strengthCandidate: result.e1rmCandidateKg ?? result.repsCapacityCandidate,
  }));
}

export interface CurrentStrength {
  value: number;
  sourceSetId: string | null;
}

export interface StrengthCandidate {
  exerciseId: string;
  setId: string;
  value: number | null;
}

export function currentStrength(
  strengthAtStart: StrengthState,
  candidates: readonly StrengthCandidate[],
): Record<string, CurrentStrength> {
  const current: Record<string, CurrentStrength> = {};
  for (const exerciseId of new Set(candidates.map((candidate) => candidate.exerciseId))) {
    const known = strengthAtStart[exerciseId] ?? NO_STRENGTH;
    const present = candidates.filter(
      (candidate): candidate is StrengthCandidate & { value: number } =>
        candidate.exerciseId === exerciseId && candidate.value !== null,
    );
    const bestThisSession = present.reduce<{ setId: string; value: number } | null>(
      (best, candidate) => (best === null || candidate.value > best.value ? candidate : best),
      null,
    );
    const windowOrSession = maxOrNull(known.windowMax, bestThisSession?.value ?? null);
    const value = windowOrSession ?? known.fallbackMax;
    if (value === null) continue;
    const setsItsOwnValue = bestThisSession !== null && bestThisSession.value === value;
    current[exerciseId] = { value, sourceSetId: setsItsOwnValue ? bestThisSession.setId : null };
  }
  return current;
}

export function strengthAfterSession(
  strength: StrengthState,
  sets: readonly SetResult[],
): Record<string, CurrentStrength> {
  return currentStrength(
    strength,
    sets.map((result) => ({
      exerciseId: result.set.exerciseId,
      setId: result.set.id,
      value: result.e1rmCandidateKg ?? result.repsCapacityCandidate,
    })),
  );
}
