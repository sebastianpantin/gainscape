import type { BalanceConfig } from './balance.ts';
import { roundLoad } from './load-rounding.ts';
import { FLOAT_TOLERANCE, nonNegativeIntegerPercent } from './math.ts';
import { e1rmAtSessionStart } from './strength.ts';
import {
  type ChallengeSummary,
  isLiftResult,
  isRecord,
  type LiftSetResult,
  type SetResult,
  type StrengthState,
} from './types.ts';

interface ChallengeExercise {
  exerciseId: string;
  reps: number;
  pct: number | null;
}

interface ChallengeGroup {
  rounds: number;
  exercises: ChallengeExercise[];
}

export interface PrescriptionChallenge {
  kind: 'prescription';
  groups: ChallengeGroup[];
}

export type VolumeMetric = 'reps' | 'kg';

export interface VolumeChallenge {
  kind: 'volume';
  metric: VolumeMetric;
  target: number;
  exerciseId: string | null;
  minPct: number | null;
}

export type ChallengeDefinition = PrescriptionChallenge | VolumeChallenge;

export type E1rmSnapshot = Readonly<Record<string, number | null>>;

export interface ChallengeRun {
  challengeId: string;
  key: string;
  name: string;
  definition: ChallengeDefinition;
  e1rmKg: E1rmSnapshot;
}

export interface ChallengeVerdict {
  passed: boolean;
}

export const CHALLENGE_LOAD_STEP_KG = 2.5;

const PERCENT = 100;

type ChallengeBonusConfig = Pick<BalanceConfig, 'challengeBonusPercent'>;

export function loadTargetKg(pct: number | null, e1rmKg: number | null): number | null {
  if (pct === null || e1rmKg === null) return null;
  return (pct * e1rmKg) / PERCENT;
}

export function meetsLoadTarget(loadKg: number, target: number | null): boolean {
  return target === null || loadKg + FLOAT_TOLERANCE >= roundLoad(target, CHALLENGE_LOAD_STEP_KG, 'down');
}

function loadPercents(definition: ChallengeDefinition): { exerciseId: string; pct: number }[] {
  if (definition.kind === 'prescription') {
    return definition.groups.flatMap((group) =>
      group.exercises.flatMap(({ exerciseId, pct }) => (pct === null ? [] : [{ exerciseId, pct }])),
    );
  }
  const { exerciseId, minPct } = definition;
  return exerciseId === null || minPct === null ? [] : [{ exerciseId, pct: minPct }];
}

export function challengeLoadExerciseIds(definition: ChallengeDefinition): string[] {
  return [...new Set(loadPercents(definition).map(({ exerciseId }) => exerciseId))];
}

export function challengeE1rmSnapshot(definition: ChallengeDefinition, strength: StrengthState): E1rmSnapshot {
  return Object.fromEntries(
    challengeLoadExerciseIds(definition).map((exerciseId) => [exerciseId, e1rmAtSessionStart(strength, exerciseId)]),
  );
}

export function challengeTargetLoadsKg(run: ChallengeRun): Record<string, number | null> {
  return Object.fromEntries(
    loadPercents(run.definition).map(({ exerciseId, pct }) => {
      const target = loadTargetKg(pct, run.e1rmKg[exerciseId] ?? null);
      return [exerciseId, target === null ? null : roundLoad(target, CHALLENGE_LOAD_STEP_KG, 'down')];
    }),
  );
}

export function challengeSummary(
  run: ChallengeRun | null | undefined,
  verdict: ChallengeVerdict | undefined,
): ChallengeSummary | null {
  if (!run || !verdict) return null;
  return {
    challengeId: run.challengeId,
    key: run.key,
    name: run.name,
    passed: verdict.passed,
    targetLoadsKg: challengeTargetLoadsKg(run),
  };
}

function workingLiftSets(sets: readonly SetResult[]): LiftSetResult[] {
  return sets.filter(isLiftResult).filter((result) => !result.set.isWarmup);
}

function meetsPercentTarget(result: LiftSetResult, pct: number | null, e1rmSnapshot: E1rmSnapshot): boolean {
  if (pct === null) return true;
  const e1rmKg = e1rmSnapshot[result.set.exerciseId] ?? null;
  return e1rmKg !== null && meetsLoadTarget(result.effectiveLoadKg, loadTargetKg(pct, e1rmKg));
}

function prescriptionMet(
  challenge: PrescriptionChallenge,
  sets: readonly LiftSetResult[],
  e1rmSnapshot: E1rmSnapshot,
): boolean {
  return challenge.groups.every((group) =>
    group.exercises.every(({ exerciseId, reps, pct }) => {
      const metSets = sets.filter(
        (result) =>
          result.set.exerciseId === exerciseId &&
          result.set.reps >= reps &&
          meetsPercentTarget(result, pct, e1rmSnapshot),
      );
      return metSets.length >= group.rounds;
    }),
  );
}

export function liftVolume(
  sets: readonly SetResult[],
  metric: VolumeMetric,
  exerciseId: string | null,
  minPct: number | null,
  e1rmSnapshot: E1rmSnapshot,
): number {
  return workingLiftSets(sets)
    .filter(
      (result) =>
        (exerciseId === null || result.set.exerciseId === exerciseId) &&
        meetsPercentTarget(result, minPct, e1rmSnapshot),
    )
    .reduce((sum, result) => sum + (metric === 'reps' ? result.set.reps : result.set.weightKg * result.set.reps), 0);
}

function volumeMet(challenge: VolumeChallenge, sets: readonly LiftSetResult[], e1rmSnapshot: E1rmSnapshot): boolean {
  const volume = liftVolume(sets, challenge.metric, challenge.exerciseId, challenge.minPct, e1rmSnapshot);
  return volume + FLOAT_TOLERANCE >= challenge.target;
}

export function judgeChallenge(
  challenge: ChallengeDefinition,
  sets: readonly SetResult[],
  e1rmSnapshot: E1rmSnapshot,
): ChallengeVerdict {
  const working = workingLiftSets(sets);
  const passed =
    challenge.kind === 'prescription'
      ? prescriptionMet(challenge, working, e1rmSnapshot)
      : volumeMet(challenge, working, e1rmSnapshot);
  return { passed };
}

export function challengeBonusXp(baseXp: number, cfg: ChallengeBonusConfig): number {
  return Math.round((baseXp * nonNegativeIntegerPercent('challengeBonusPercent', cfg.challengeBonusPercent)) / PERCENT);
}

function storedString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new RangeError(`a stored challenge needs a string ${field}`);
  return value;
}

function storedNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`a stored challenge needs a finite number ${field}`);
  }
  return value;
}

function storedNullableNumber(value: unknown, field: string): number | null {
  return value === null || value === undefined ? null : storedNumber(value, field);
}

function storedRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new RangeError(`a stored challenge needs an object ${field}`);
  return value;
}

function storedArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new RangeError(`a stored challenge needs an array ${field}`);
  return value;
}

function storedExercise(value: unknown): ChallengeExercise {
  const exercise = storedRecord(value, 'group exercise');
  return {
    exerciseId: storedString(exercise.exerciseId, 'exerciseId'),
    reps: storedNumber(exercise.reps, 'reps'),
    pct: storedNullableNumber(exercise.pct, 'pct'),
  };
}

function storedGroup(value: unknown): ChallengeGroup {
  const group = storedRecord(value, 'group');
  return {
    rounds: storedNumber(group.rounds, 'rounds'),
    exercises: storedArray(group.exercises, 'group exercises').map(storedExercise),
  };
}

export function challengeDefinitionFromStored(value: unknown): ChallengeDefinition {
  const definition = storedRecord(value, 'definition');
  if (definition.kind === 'prescription') {
    return { kind: 'prescription', groups: storedArray(definition.groups, 'groups').map(storedGroup) };
  }
  if (definition.kind === 'volume') {
    const metric = definition.metric;
    if (metric !== 'reps' && metric !== 'kg') {
      throw new RangeError(`unknown volume metric ${JSON.stringify(metric)} in a stored challenge`);
    }
    return {
      kind: 'volume',
      metric,
      target: storedNumber(definition.target, 'target'),
      exerciseId:
        definition.exerciseId === null || definition.exerciseId === undefined
          ? null
          : storedString(definition.exerciseId, 'exerciseId'),
      minPct: storedNullableNumber(definition.minPct, 'minPct'),
    };
  }
  throw new RangeError(`unknown challenge kind ${JSON.stringify(definition.kind)} in a stored challenge`);
}

function storedSnapshot(value: unknown): E1rmSnapshot {
  return Object.fromEntries(
    Object.entries(storedRecord(value, 'e1rmKg')).map(([exerciseId, e1rmKg]) => [
      exerciseId,
      storedNullableNumber(e1rmKg, 'e1rmKg'),
    ]),
  );
}

export function challengeRunFromStored(value: unknown): ChallengeRun | null {
  if (value === null || value === undefined) return null;
  const run = storedRecord(value, 'run');
  return {
    challengeId: storedString(run.challengeId, 'challengeId'),
    key: storedString(run.key, 'key'),
    name: storedString(run.name, 'name'),
    definition: challengeDefinitionFromStored(run.definition),
    e1rmKg: storedSnapshot(run.e1rmKg),
  };
}
