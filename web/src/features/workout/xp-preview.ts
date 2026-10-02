import {
  type BalanceConfig,
  type CardioExerciseDef,
  type CardioSetInput,
  type Catalog,
  DEFAULT_BALANCE,
  effectiveLoadForNewSet,
  type ExerciseDef,
  type LiftExerciseDef,
  type LiftSetInput,
  processSession,
  resolveEffort,
  type SetInput,
  type SetResult,
  type SkillDef,
  type StrengthState,
} from '@domain/index.ts';
import { isLoggableBout } from '../../lib/cardio-rules.ts';
import type {
  CardioDraftExercise,
  CardioDraftSet,
  DraftExercise,
  DraftSet,
  LiftDraftExercise,
} from '../../offline/draft-format.ts';

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
  input: SetInput | null;
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

function previewBout(bout: CardioDraftSet, exerciseId: string, position: number): CardioSetInput | null {
  if (!isLoggableBout(bout)) return null;
  const { id, durationS, distanceM, interval, effort } = bout;
  return { kind: 'cardio', id, exerciseId, position, durationS, distanceM, interval, effort };
}

function liftDefinition(exercise: LiftDraftExercise, builtIn: boolean): LiftExerciseDef {
  return {
    id: exercise.exerciseId,
    loadType: exercise.loadType,
    builtIn,
    shares: [{ skillId: PREVIEW_SKILL_ID, shareBasisPoints: FULL_SHARE_BASIS_POINTS }],
  };
}

function cardioDefinition({ exerciseId, activity }: CardioDraftExercise, builtIn: boolean): CardioExerciseDef {
  return {
    id: exerciseId,
    modality: 'cardio',
    builtIn,
    shares: activity.shares.map((share) => ({ skillId: share.skillKey, shareBasisPoints: share.shareBasisPoints })),
    cardio: {
      paceUnit: activity.paceUnit,
      referencePaceSPerKm: activity.referencePaceSPerKm,
      maxEffort: activity.maxEffort,
      recordMinDistanceM: null,
    },
  };
}

function previewDefinition(exercise: DraftExercise, builtIn: boolean): ExerciseDef {
  return exercise.modality === 'lift' ? liftDefinition(exercise, builtIn) : cardioDefinition(exercise, builtIn);
}

function previewSkills(exercises: readonly DraftExercise[]): SkillDef[] {
  const cardioKeys = exercises.flatMap((exercise) =>
    exercise.modality === 'cardio' ? exercise.activity.shares.map((share) => share.skillKey) : [],
  );
  return [PREVIEW_SKILL_ID, ...new Set(cardioKeys)].map((key, sortOrder) => ({
    id: key,
    key,
    sortOrder,
    combatWeight: 0,
  }));
}

function placeCardio(exercise: CardioDraftExercise, firstPosition: number): PlacedSet[] {
  return exercise.sets.map((bout, index) => ({
    input: previewBout(bout, exercise.exerciseId, firstPosition + index),
    done: bout.done,
    unrated: false,
    hasPriorSession: false,
  }));
}

function placeSets(
  exercises: readonly DraftExercise[],
  isBuiltIn: (exerciseId: string) => boolean,
  strength: StrengthState | null,
  bodyweightKg: number | null,
  cfg: BalanceConfig,
): PlacedSet[][] {
  let position = 0;
  return exercises.map((exercise) => {
    const firstPosition = position;
    position += exercise.sets.length;
    if (exercise.modality === 'cardio') return placeCardio(exercise, firstPosition);
    const definition = liftDefinition(exercise, isBuiltIn(exercise.exerciseId));
    return exercise.sets.map((set, index): PlacedSet => ({
      input: previewInput(set, definition, firstPosition + index, bodyweightKg, cfg),
      done: set.done,
      unrated: set.effort === null,
      hasPriorSession: strength?.[exercise.exerciseId]?.hasPriorSession ?? false,
    }));
  });
}

function toPreview(result: SetResult, hasPriorSession: boolean): SetPreview {
  if (result.cardio !== null) return { xp: result.xp, basis: 'logged', rir: null };
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
  const definitions = new Map(
    exercises.map((exercise) => [exercise.exerciseId, previewDefinition(exercise, isBuiltIn(exercise.exerciseId))]),
  );
  const catalog: Catalog = { skills: previewSkills(exercises), exercises: definitions };
  const placed = placeSets(exercises, isBuiltIn, strength, bodyweightKg, cfg);
  const doneInputs = placed.flat().flatMap((entry) => (entry.done && entry.input ? [entry.input] : []));

  const resultsFor = (inputs: SetInput[]): Map<string, SetResult> => {
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

export function previewXpLabel(preview: SetPreview): string {
  return preview.basis === 'unknown' ? '~?' : `~${formatXp(preview.xp)}`;
}

export function previewNote(preview: SetPreview, cfg: BalanceConfig = DEFAULT_BALANCE): string {
  const firstRirWithoutXp = cfg.effectiveRirWindow + 1;
  if (preview.basis === 'logged' && preview.rir !== null && preview.rir >= firstRirWithoutXp) return 'counts for e1RM';
  if (preview.basis === 'estimated') return `est. RIR ${preview.rir}`;
  if (preview.basis === 'cold_start') return 'first time';
  return '';
}
