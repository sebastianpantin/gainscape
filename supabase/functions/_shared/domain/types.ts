export type LoadType = 'external' | 'bodyweight' | 'bodyweight_plus';
export type EffortLevel = 'easy' | 'hard' | 'near_failure' | 'failure';
export type EffortInputType = 'level' | 'rir' | 'rpe';
export type RirSource = 'logged' | 'estimated' | 'cold_start' | 'default';

export type EffortInput =
  { type: 'level'; level: EffortLevel } | { type: 'rir'; value: number } | { type: 'rpe'; value: number } | null;

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

export interface ExerciseDef {
  id: string;
  loadType: LoadType;
  builtIn: boolean;
  shares: SkillShare[];
}

export interface Catalog {
  skills: SkillDef[];
  exercises: ReadonlyMap<string, ExerciseDef>;
}

export interface SetInput {
  id: string;
  exerciseId: string;
  position: number;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  effort: EffortInput;
  recordedEffectiveLoadKg?: number;
}

export interface SessionInput {
  id: string;
  startedAt: string;
  sets: SetInput[];
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

export interface RecordState {
  repMaxes: Readonly<Record<string, readonly (RepMaxSlot | null)[]>>;
  bodyweightReps: Readonly<Record<string, BodyweightRepRecord>>;
}

export const NO_RECORDS: RecordState = Object.freeze({ repMaxes: {}, bodyweightReps: {} });

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
}

export type SetPersonalRecord =
  | { kind: 'rep_max'; reps: number; loadKg: number; previousLoadKg: number | null }
  | { kind: 'bodyweight_reps'; reps: number; previousReps: number | null };

export interface PersonalRecordSummary {
  exerciseId: string;
  kind: 'rep_max' | 'bodyweight_reps';
  reps: number;
  loadKg: number | null;
  previousLoadKg: number | null;
  previousReps: number | null;
}

export interface LevelUp {
  skill: string;
  from: number;
  to: number;
}

export type RollKind = 'regular' | 'pr';

export interface Rng {
  next(): number;
}

export interface SessionSummary {
  sessionId: string;
  xpBySkill: Record<string, number>;
  levelUps: LevelUp[];
  prs: PersonalRecordSummary[];
  drops: never[];
  historyOnly?: true;
}
