import type { ChallengeRun } from './challenges.ts';
import type { GearLoadout } from './gear.ts';

export type LoadType = 'external' | 'bodyweight' | 'bodyweight_plus';
export type EffortLevel = 'easy' | 'hard' | 'near_failure' | 'failure';
export type EffortInputType = 'level' | 'rir' | 'rpe' | 'cardio';
export type CardioEffortLevel = 'easy' | 'moderate' | 'hard' | 'max';
export const CARDIO_EFFORT_LEVELS: readonly CardioEffortLevel[] = Object.freeze(['easy', 'moderate', 'hard', 'max']);
export type SetKind = 'lift' | 'cardio' | 'hold';
export type ExerciseMeasure = 'reps' | 'time' | 'distance';
export type RirSource = 'logged' | 'estimated' | 'cold_start' | 'default';

export type EffortInput =
  | { type: 'level'; level: EffortLevel }
  | { type: 'rir'; value: number }
  | { type: 'rpe'; value: number }
  | { type: 'cardio'; level: CardioEffortLevel }
  | null;

export interface SkillDef {
  id: string;
  key: string;
  sortOrder: number;
  combatWeight: number;
}

export interface SkillShare {
  skillId: string;
  shareBasisPoints: number;
}

interface ExerciseBase {
  id: string;
  builtIn: boolean;
  shares: SkillShare[];
}

export interface LiftExerciseDef extends ExerciseBase {
  modality?: 'lift';
  loadType: LoadType;
  measure?: ExerciseMeasure;
}

export type PaceUnit = 'per_km' | 'per_100m';

export interface CardioProfile {
  paceUnit: PaceUnit;
  referencePaceSPerKm: number | null;
  maxEffort: CardioEffortLevel;
  recordMinDistanceM: number | null;
  tracksDistance: boolean;
}

export interface CardioExerciseDef extends ExerciseBase {
  modality: 'cardio';
  cardio: CardioProfile;
}

export type ExerciseDef = LiftExerciseDef | CardioExerciseDef;

export interface Catalog {
  skills: SkillDef[];
  exercises: ReadonlyMap<string, ExerciseDef>;
}

export interface LiftSetInput {
  kind?: 'lift';
  id: string;
  exerciseId: string;
  position: number;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  effort: EffortInput;
  recordedEffectiveLoadKg?: number;
}

export interface CardioInterval {
  workS: number;
  restS: number;
  rounds: number;
}

export interface CardioSetInput {
  kind: 'cardio';
  id: string;
  exerciseId: string;
  position: number;
  durationS: number;
  distanceM: number | null;
  interval: CardioInterval | null;
  effort: EffortInput;
}

export interface HoldSetInput {
  kind: 'hold';
  id: string;
  exerciseId: string;
  position: number;
  weightKg: number;
  durationS: number | null;
  distanceM: number | null;
  effort: EffortInput;
  recordedEffectiveLoadKg?: number;
}

export const HOLD_BOUNDS = Object.freeze({
  durationS: Object.freeze({ min: 1, max: 3600 }),
  distanceM: Object.freeze({ min: 1, max: 10_000 }),
});

export type SetInput = LiftSetInput | CardioSetInput | HoldSetInput;

export function measuresRepsCapacity(loadType: LoadType): boolean {
  return loadType === 'bodyweight';
}

export function setKind(set: Pick<SetInput, 'kind'>): SetKind {
  return set.kind ?? 'lift';
}

export function isLiftSet(set: SetInput): set is LiftSetInput {
  return set.kind === undefined || set.kind === 'lift';
}

export function isHoldSet(set: SetInput): set is HoldSetInput {
  return set.kind === 'hold';
}

export function measureOf(exercise: Pick<LiftExerciseDef, 'measure'>): ExerciseMeasure {
  return exercise.measure ?? 'reps';
}

export interface SessionInput {
  id: string;
  startedAt: string;
  sets: SetInput[];
  gearLoadout?: GearLoadout | null;
  challenge?: ChallengeRun | null;
}

export const REP_MAX_SLOT_COUNT = 10;

export const MAX_SETS_PER_SESSION = 200;

export interface RepMaxSlot {
  loadKg: number;
  setId: string;
  achievedAt: string;
  exactSetId: string | null;
}

export interface BodyweightRepRecord {
  maxReps: number;
  setId: string;
  achievedAt: string;
}

export type CardioRecordKind = 'distance' | 'pace' | 'duration';

export const CARDIO_RECORD_KINDS: readonly CardioRecordKind[] = Object.freeze(['distance', 'pace', 'duration']);

export interface CardioRecord {
  value: number;
  setId: string;
  achievedAt: string;
}

export type CardioRecords = Readonly<Partial<Record<CardioRecordKind, CardioRecord>>>;

export interface RecordState {
  repMaxes: Readonly<Record<string, readonly (RepMaxSlot | null)[]>>;
  bodyweightReps: Readonly<Record<string, BodyweightRepRecord>>;
  cardio: Readonly<Record<string, CardioRecords>>;
}

export const NO_RECORDS: RecordState = Object.freeze({ repMaxes: {}, bodyweightReps: {}, cardio: {} });

export interface UserState {
  skillXp: Readonly<Record<string, number>>;
  bodyweightKg: number | null;
  records?: RecordState;
}

export interface SessionKey {
  id: string;
  startedAt: string;
}

export interface ExerciseStrength {
  windowMax: number | null;
  fallbackMax: number | null;
  hasPriorSession: boolean;
}

export type StrengthState = Readonly<Record<string, ExerciseStrength>>;

export interface StrengthHistoryRow {
  exerciseId: string;
  session: SessionKey;
  isWarmup: boolean;
  strengthCandidate: number | null;
}

export interface SkillXp {
  skillId: string;
  xp: number;
}

export interface CardioRecordGain {
  kind: CardioRecordKind;
  value: number;
  previous: number | null;
}

export interface CardioSetResult {
  records: CardioRecordGain[];
  countedWorkS: number;
  xpCountedWorkS: number;
  cappedWorkS: number;
  effort: CardioEffortLevel;
  paceBonus: number;
  paceFlagged: boolean;
}

export interface SetResult {
  set: SetInput;
  effortInputType: EffortInputType | null;
  effortValue: number | null;
  rir: number | null;
  rirSource: RirSource;
  rirForXp: number | null;
  rirFlagged: boolean;
  intensityBonus: number;
  coldStartXp: number;
  e1rmBeforeKg: number | null;
  repsCapacityBefore: number | null;
  e1rmCandidateKg: number | null;
  repsCapacityCandidate: number | null;
  effectiveLoadKg: number;
  personalRecord: SetPersonalRecord | null;
  effectiveReps: number;
  xp: number;
  skillXp: SkillXp[];
  cardio: CardioSetResult | null;
  holdRecords?: CardioRecordGain[];
}

export interface LiftSetResult extends SetResult {
  set: LiftSetInput;
}

export function isLiftResult(result: SetResult): result is LiftSetResult {
  return isLiftSet(result.set);
}

export interface HoldSetResult extends SetResult {
  set: HoldSetInput;
}

export function isHoldResult(result: SetResult): result is HoldSetResult {
  return isHoldSet(result.set);
}

export type SetPersonalRecord =
  | { kind: 'rep_max'; reps: number; loadKg: number; previousLoadKg: number | null }
  | { kind: 'bodyweight_reps'; reps: number; previousReps: number | null };

export interface LiftRecordSummary {
  exerciseId: string;
  kind: 'rep_max' | 'bodyweight_reps';
  setId: string;
  reps: number;
  loadKg: number | null;
  previousLoadKg: number | null;
  previousReps: number | null;
}

export interface CardioRecordSummary {
  kind: 'cardio';
  exerciseId: string;
  setId: string;
  records: CardioRecordGain[];
}

export type PersonalRecordSummary = LiftRecordSummary | CardioRecordSummary;

export interface LevelUp {
  skill: string;
  from: number;
  to: number;
}

export type RollKind = 'regular' | 'pr';

export interface Rng {
  next(): number;
}

export type RevokeReason = 'set_removed' | 'session_deleted' | 'no_longer_qualifies';

export interface DropSummary {
  dropId: string;
  setId: string;
  itemId: string;
  itemKey: string;
  quantity: number;
  source: RollKind;
}

export interface RevokedDrop extends DropSummary {
  revokedQuantity: number;
}

export interface ChallengeSummary {
  challengeId: string;
  key: string;
  name: string;
  passed: boolean;
  targetLoadsKg: Record<string, number | null>;
}

export interface SessionSummary {
  sessionId: string;
  xpBySkill: Record<string, number>;
  levelUps: LevelUp[];
  prs: PersonalRecordSummary[];
  drops: DropSummary[];
  gearBonusBySkill?: Record<string, number>;
  challenge?: ChallengeSummary | null;
  challengeBonusBySkill?: Record<string, number>;
  historyOnly?: true;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
