import {
  type BalanceConfig,
  type Catalog,
  DEFAULT_BALANCE,
  effectiveLoadForNewSet,
  type LiftExerciseDef,
  type LiftSetInput,
  processSession,
  resolveEffort,
  type SetResult,
  type StrengthState,
} from '@domain/index.ts';
import type { DraftExercise, DraftSet } from '../../offline/draft-format.ts';

export type PreviewBasis = 'logged' | 'estimated' | 'cold_start' | 'unknown';

export interface SetPreview {
  xp: number;
  basis: PreviewBasis;
  rir: number | null;
}

const UNKNOWN_PREVIEW: SetPreview = Object.freeze({ xp: 0, basis: 'unknown', rir: null });
const PREVIEW_SKILL_ID = 'preview';
const FULL_SHARE_BASIS_POINTS = 10_000;
const PREVIEW_SESSION_ID = 'preview';
const PREVIEW_STARTED_AT = '1970-01-01T00:00:00.000Z';
const REPS_MODEL_PLACEHOLDER_BODYWEIGHT_KG = 0;

interface PlacedSet {
  input: LiftSetInput | null;
  done: boolean;
  unrated: boolean;
  hasPriorSession: boolean;
}

function hasValidEffort(set: DraftSet, cfg: BalanceConfig): boolean {
  try {
    resolveEffort(set.effort, cfg, 'lift');
    return true;
  } catch {
    return false;
  }
}

function previewLoadKg(set: DraftSet, exercise: LiftExerciseDef, bodyweightKg: number | null): number | null {
  const knownBodyweightKg =
    exercise.loadType === 'bodyweight' ? (bodyweightKg ?? REPS_MODEL_PLACEHOLDER_BODYWEIGHT_KG) : bodyweightKg;
  try {
    return effectiveLoadForNewSet(set, exercise, knownBodyweightKg);
  } catch {
    return null;
  }
}

function previewInput(
  set: DraftSet,
  exercise: LiftExerciseDef,
  position: number,
  bodyweightKg: number | null,
  cfg: BalanceConfig,
): LiftSetInput | null {
  if (!Number.isInteger(set.reps) || set.reps < 1) return null;
  if (!Number.isFinite(set.weightKg) || set.weightKg < 0) return null;
  if (!hasValidEffort(set, cfg)) return null;
  const effectiveLoadKg = previewLoadKg(set, exercise, bodyweightKg);
  if (effectiveLoadKg === null) return null;
  return {
    id: set.id,
    exerciseId: exercise.id,
    position,
    weightKg: set.weightKg,
    reps: set.reps,
    isWarmup: false,
    effort: set.effort,
    recordedEffectiveLoadKg: effectiveLoadKg,
  };
}

function previewDefinitions(
  exercises: readonly DraftExercise[],
  isBuiltIn: (exerciseId: string) => boolean,
): Map<string, LiftExerciseDef> {
  const definitions = exercises.map((exercise): LiftExerciseDef => ({
    id: exercise.exerciseId,
    loadType: exercise.loadType,
    builtIn: isBuiltIn(exercise.exerciseId),
    shares: [{ skillId: PREVIEW_SKILL_ID, shareBasisPoints: FULL_SHARE_BASIS_POINTS }],
  }));
  return new Map(definitions.map((definition) => [definition.id, definition]));
}

function placeSets(
  exercises: readonly DraftExercise[],
  definitions: ReadonlyMap<string, LiftExerciseDef>,
  strength: StrengthState | null,
  bodyweightKg: number | null,
  cfg: BalanceConfig,
): PlacedSet[][] {
  let position = 0;
  return exercises.map((exercise) => {
    const definition = definitions.get(exercise.exerciseId)!;
    return exercise.sets.map((set): PlacedSet => {
      const placed = {
        input: previewInput(set, definition, position, bodyweightKg, cfg),
        done: set.done,
        unrated: set.effort === null,
        hasPriorSession: strength?.[exercise.exerciseId]?.hasPriorSession ?? false,
      };
      position += 1;
      return placed;
    });
  });
}

function toPreview(result: SetResult, hasPriorSession: boolean): SetPreview {
  if (result.rirSource === 'logged') return { xp: result.xp, basis: 'logged', rir: result.rir };
  if (result.rirSource === 'estimated') return { xp: result.xp, basis: 'estimated', rir: result.rir };
  if (hasPriorSession) return { ...UNKNOWN_PREVIEW, xp: result.xp };
  return { xp: result.xp, basis: 'cold_start', rir: null };
}

export function previewSession(
  exercises: readonly DraftExercise[],
  isBuiltIn: (exerciseId: string) => boolean,
  strength: StrengthState | null,
  bodyweightKg: number | null = null,
  cfg: BalanceConfig = DEFAULT_BALANCE,
): SetPreview[][] {
  const definitions = previewDefinitions(exercises, isBuiltIn);
  const catalog: Catalog = {
    skills: [{ id: PREVIEW_SKILL_ID, key: PREVIEW_SKILL_ID, sortOrder: 0, combatWeight: 0 }],
    exercises: definitions,
  };
  const placed = placeSets(exercises, definitions, strength, bodyweightKg, cfg);
  const doneInputs = placed.flat().flatMap((entry) => (entry.done && entry.input ? [entry.input] : []));

  const resultsFor = (inputs: LiftSetInput[]): Map<string, SetResult> => {
    const { outputs } = processSession(
      { skillXp: {}, bodyweightKg },
      { id: PREVIEW_SESSION_ID, startedAt: PREVIEW_STARTED_AT, sets: inputs },
      cfg,
      { catalog, strength: strength ?? {} },
    );
    return new Map(outputs.sets.map((result) => [result.set.id, result]));
  };
  const doneResults = resultsFor(doneInputs);

  return placed.map((sets) =>
    sets.map((entry) => {
      if (entry.input === null || (strength === null && entry.unrated)) return UNKNOWN_PREVIEW;
      const result = entry.done
        ? doneResults.get(entry.input.id)
        : resultsFor([...doneInputs, entry.input]).get(entry.input.id);
      return result ? toPreview(result, entry.hasPriorSession) : UNKNOWN_PREVIEW;
    }),
  );
}

export function formatXp(xp: number): string {
  return xp.toLocaleString('en-US');
}
