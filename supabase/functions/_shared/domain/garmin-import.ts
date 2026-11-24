import { CARDIO_BOUNDS, intervalDurationSeconds, isLoggableInterval } from './cardio.ts';
import { isWithinEditWindow } from './edit-window.ts';
import { type GarminSet, type GarminSetGroup, garminSetGroups, garminUsableSetCount } from './garmin-strength.ts';
import { MS_PER_SECOND, roundTo } from './math.ts';
import { implausibleTiming } from './session-timing.ts';
import { type CardioInterval, MAX_SETS_PER_SESSION } from './types.ts';

export interface GarminWorkoutStep {
  intensity: string | null;
  durationS: number | null;
}

export interface GarminLap {
  workoutStepIndex: number | null;
  durationS: number | null;
}

export interface GarminActivity {
  type: string | null;
  startedAt: string;
  durationS: number;
  distanceM: number | null;
  laps: readonly GarminLap[];
  workoutSteps: readonly GarminWorkoutStep[];
  sets: readonly GarminSet[];
}

export type GarminRejection = 'unreadable' | 'too_short' | 'too_long' | 'too_far' | 'no_sets' | 'too_many_sets';

export type GarminCandidateKind = 'cardio' | 'strength';

export type GarminCandidateStatus = 'importable' | 'history_only' | 'needs_exercise' | 'rejected';

export interface GarminImportCandidate {
  kind: GarminCandidateKind;
  startedAt: string | null;
  garminType: string | null;
  exerciseId: string | null;
  durationS: number | null;
  distanceM: number | null;
  interval: CardioInterval | null;
  setGroups: GarminSetGroup[];
  historyOnly: boolean;
  status: GarminCandidateStatus;
  rejection: GarminRejection | null;
}

const DISTANCE_DECIMALS = 1;
const GARMIN_STRENGTH_TYPES: ReadonlySet<string> = new Set(['strength_training']);
const WORK_INTENSITIES: ReadonlySet<string> = new Set(['active', 'interval']);
const REST_INTENSITIES: ReadonlySet<string> = new Set(['rest', 'recovery']);
const FEWEST_INTERVAL_PHASES = 3;
const STEP_TIME_TOLERANCE_S = 2;

export function garminActivityIdentity(startedAt: string): string | null {
  const startedMs = Date.parse(startedAt);
  if (Number.isNaN(startedMs)) return null;
  return new Date(Math.floor(startedMs / MS_PER_SECOND) * MS_PER_SECOND).toISOString();
}

export function garminActivityEnd(activity: { startedAt: string; durationS: number }): string {
  return new Date(Date.parse(activity.startedAt) + activity.durationS * MS_PER_SECOND).toISOString();
}

interface IntervalPhase {
  isWork: boolean;
  durationS: number | null;
}

interface StepRun {
  stepIndex: number | null;
  lapSeconds: (number | null)[];
}

function stepRuns(laps: readonly GarminLap[]): StepRun[] {
  const runs: StepRun[] = [];
  for (const lap of laps) {
    const run = runs.at(-1);
    if (run !== undefined && run.stepIndex === lap.workoutStepIndex) run.lapSeconds.push(lap.durationS);
    else runs.push({ stepIndex: lap.workoutStepIndex, lapSeconds: [lap.durationS] });
  }
  return runs;
}

function timesStepWasDone(lapSeconds: readonly (number | null)[], plannedS: number): number | null {
  if (lapSeconds.includes(null)) return lapSeconds.length;
  const doneS = lapSeconds.reduce<number>((total, seconds) => total + (seconds ?? 0), 0);
  const times = Math.round(doneS / plannedS);
  const asPlanned = times >= 1 && Math.abs(doneS - times * plannedS) <= times * STEP_TIME_TOLERANCE_S;
  return asPlanned ? times : null;
}

function phasesOfRun(run: StepRun, workoutSteps: readonly GarminWorkoutStep[]): IntervalPhase[] {
  const step = run.stepIndex === null ? undefined : workoutSteps[run.stepIndex];
  if (step === undefined || step.intensity === null) return [];
  const isWork = WORK_INTENSITIES.has(step.intensity);
  if (!isWork && !REST_INTENSITIES.has(step.intensity)) return [];
  const times = step.durationS === null ? null : timesStepWasDone(run.lapSeconds, step.durationS);
  if (times === null) return [{ isWork, durationS: null }];
  return Array.from({ length: times }, () => ({ isWork, durationS: step.durationS }));
}

function intervalPhases(activity: GarminActivity): IntervalPhase[] {
  return stepRuns(activity.laps).flatMap((run) => phasesOfRun(run, activity.workoutSteps));
}

function sharedSeconds(phases: readonly IntervalPhase[]): number | null {
  const seconds = new Set(phases.map((phase) => (phase.durationS === null ? null : Math.round(phase.durationS))));
  const [only] = seconds;
  return seconds.size === 1 && only !== null ? only : null;
}

function structuredInterval(activity: GarminActivity, durationS: number): CardioInterval | null {
  const phases = intervalPhases(activity);
  if (phases.at(-1)?.isWork === false) phases.pop();
  const alternatesFromWorkToWork =
    phases.length % 2 === 1 && phases.every((phase, index) => phase.isWork === (index % 2 === 0));
  if (phases.length < FEWEST_INTERVAL_PHASES || !alternatesFromWorkToWork) return null;
  const workS = sharedSeconds(phases.filter((phase) => phase.isWork));
  const restS = sharedSeconds(phases.filter((phase) => !phase.isWork));
  if (workS === null || restS === null) return null;
  const interval = { workS, restS, rounds: (phases.length + 1) / 2 };
  return isLoggableInterval(interval) && intervalDurationSeconds(interval) <= durationS ? interval : null;
}

function loggedDistance(distanceM: number | null): number | null {
  if (distanceM === null) return null;
  const rounded = roundTo(DISTANCE_DECIMALS, distanceM);
  return rounded < CARDIO_BOUNDS.distanceM.min ? null : rounded;
}

function hasUnreadableMeasures(activity: GarminActivity): boolean {
  const badDuration = !Number.isFinite(activity.durationS) || activity.durationS < 0;
  const badDistance = activity.distanceM !== null && !(activity.distanceM >= 0 && Number.isFinite(activity.distanceM));
  return badDuration || badDistance;
}

function sizeRejection(durationS: number, distanceM: number | null): GarminRejection | null {
  if (durationS > CARDIO_BOUNDS.steadyDurationS.max) return 'too_long';
  if (distanceM !== null && distanceM > CARDIO_BOUNDS.distanceM.max) return 'too_far';
  if (durationS < CARDIO_BOUNDS.steadyDurationS.min) return 'too_short';
  return null;
}

function strengthRejection(durationS: number, setGroups: readonly GarminSetGroup[]): GarminRejection | null {
  const usableSets = garminUsableSetCount(setGroups);
  if (durationS > CARDIO_BOUNDS.steadyDurationS.max) return 'too_long';
  if (usableSets === 0) return 'no_sets';
  if (usableSets > MAX_SETS_PER_SESSION) return 'too_many_sets';
  return null;
}

export function garminImportCandidate(
  activity: GarminActivity,
  exerciseIdByGarminType: ReadonlyMap<string, string>,
  now: number,
): GarminImportCandidate {
  const kind: GarminCandidateKind =
    activity.type !== null && GARMIN_STRENGTH_TYPES.has(activity.type) ? 'strength' : 'cardio';
  const rejected = (rejection: GarminRejection): GarminImportCandidate => ({
    kind,
    startedAt: null,
    garminType: activity.type,
    exerciseId: null,
    durationS: null,
    distanceM: null,
    interval: null,
    setGroups: [],
    historyOnly: false,
    status: 'rejected',
    rejection,
  });
  const startedAt = garminActivityIdentity(activity.startedAt);
  if (startedAt === null || hasUnreadableMeasures(activity)) return rejected('unreadable');

  const measured = {
    kind,
    startedAt,
    garminType: activity.type,
    durationS: Math.round(activity.durationS),
    distanceM: kind === 'strength' ? null : loggedDistance(activity.distanceM),
    historyOnly: !isWithinEditWindow(startedAt, now),
  };
  const isImplausible = implausibleTiming(startedAt, garminActivityEnd(measured), now) !== null;
  if (kind === 'strength') {
    const setGroups = garminSetGroups(activity.sets);
    const unusable = strengthRejection(measured.durationS, setGroups);
    if (unusable !== null) return { ...rejected(unusable), ...measured };
    if (isImplausible) return rejected('unreadable');
    return {
      ...measured,
      exerciseId: null,
      interval: null,
      setGroups,
      status: measured.historyOnly ? 'history_only' : 'importable',
      rejection: null,
    };
  }

  const exerciseId = (activity.type === null ? undefined : exerciseIdByGarminType.get(activity.type)) ?? null;
  const tooBigOrSmall = sizeRejection(measured.durationS, measured.distanceM);
  if (tooBigOrSmall !== null) return { ...rejected(tooBigOrSmall), ...measured, exerciseId };
  if (isImplausible) return rejected('unreadable');

  const status = exerciseId === null ? 'needs_exercise' : measured.historyOnly ? 'history_only' : 'importable';
  return {
    ...measured,
    exerciseId,
    interval: structuredInterval(activity, measured.durationS),
    setGroups: [],
    status,
    rejection: null,
  };
}

export type GarminSeenOutcome = 'imported' | 'deleted' | 'rejected';

export type GarminSkipReason = 'already_imported' | 'deleted' | 'rejected' | 'daily_cap' | 'unreadable';

export type GarminImportOutcome =
  | { startedAt: string; outcome: 'imported'; sessionId: string; xp: number }
  | { startedAt: string; outcome: 'history_only'; sessionId: string }
  | { startedAt: string; outcome: 'skipped'; reason: GarminSkipReason };

export const GARMIN_IMPORT_CHUNK = Object.freeze({ maxActivities: 50, maxScored: 10 });

export function garminImportChunks<Activity extends { historyOnly: boolean }>(
  activities: readonly Activity[],
): Activity[][] {
  const chunks: Activity[][] = [];
  let scoredInChunk = 0;
  for (const activity of activities) {
    const chunk = chunks.at(-1);
    const scored = activity.historyOnly ? 0 : 1;
    const fits =
      chunk !== undefined &&
      chunk.length < GARMIN_IMPORT_CHUNK.maxActivities &&
      scoredInChunk + scored <= GARMIN_IMPORT_CHUNK.maxScored;
    if (fits) chunk.push(activity);
    else chunks.push([activity]);
    scoredInChunk = fits ? scoredInChunk + scored : scored;
  }
  return chunks;
}
