import { CARDIO_BOUNDS, isLoggableInterval } from './cardio.ts';
import { isWithinEditWindow } from './edit-window.ts';
import { MS_PER_SECOND, roundTo } from './math.ts';
import { implausibleTiming } from './session-timing.ts';
import type { CardioInterval } from './types.ts';

export interface GarminWorkoutStep {
  intensity: string | null;
  durationS: number | null;
}

export interface GarminLap {
  workoutStepIndex: number | null;
}

export interface GarminActivity {
  type: string | null;
  startedAt: string;
  durationS: number;
  distanceM: number | null;
  laps: readonly GarminLap[];
  workoutSteps: readonly GarminWorkoutStep[];
}

export type GarminRejection = 'unreadable' | 'strength' | 'too_short' | 'too_long' | 'too_far';

export type GarminCandidateStatus = 'importable' | 'history_only' | 'needs_exercise' | 'rejected';

export interface GarminImportCandidate {
  startedAt: string | null;
  garminType: string | null;
  exerciseId: string | null;
  durationS: number | null;
  distanceM: number | null;
  interval: CardioInterval | null;
  historyOnly: boolean;
  status: GarminCandidateStatus;
  rejection: GarminRejection | null;
}

const DISTANCE_DECIMALS = 1;
const GARMIN_STRENGTH_TYPES: ReadonlySet<string> = new Set(['strength_training']);
const WORK_INTENSITIES: ReadonlySet<string> = new Set(['active', 'interval']);
const REST_INTENSITIES: ReadonlySet<string> = new Set(['rest', 'recovery']);
const FEWEST_INTERVAL_PHASES = 3;

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

function intervalPhases(activity: GarminActivity): IntervalPhase[] {
  return activity.laps.flatMap((lap): IntervalPhase[] => {
    const step = lap.workoutStepIndex === null ? undefined : activity.workoutSteps[lap.workoutStepIndex];
    if (step === undefined || step.intensity === null) return [];
    if (WORK_INTENSITIES.has(step.intensity)) return [{ isWork: true, durationS: step.durationS }];
    if (REST_INTENSITIES.has(step.intensity)) return [{ isWork: false, durationS: step.durationS }];
    return [];
  });
}

function sharedSeconds(phases: readonly IntervalPhase[]): number | null {
  const seconds = new Set(phases.map((phase) => (phase.durationS === null ? null : Math.round(phase.durationS))));
  const [only] = seconds;
  return seconds.size === 1 && only !== null ? only : null;
}

function structuredInterval(activity: GarminActivity): CardioInterval | null {
  const phases = intervalPhases(activity);
  if (phases.at(-1)?.isWork === false) phases.pop();
  const alternatesFromWorkToWork =
    phases.length % 2 === 1 && phases.every((phase, index) => phase.isWork === (index % 2 === 0));
  if (phases.length < FEWEST_INTERVAL_PHASES || !alternatesFromWorkToWork) return null;
  const workS = sharedSeconds(phases.filter((phase) => phase.isWork));
  const restS = sharedSeconds(phases.filter((phase) => !phase.isWork));
  if (workS === null || restS === null) return null;
  const interval = { workS, restS, rounds: (phases.length + 1) / 2 };
  return isLoggableInterval(interval) ? interval : null;
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

export function garminImportCandidate(
  activity: GarminActivity,
  exerciseIdByGarminType: ReadonlyMap<string, string>,
  now: number,
): GarminImportCandidate {
  const rejected = (rejection: GarminRejection): GarminImportCandidate => ({
    startedAt: null,
    garminType: activity.type,
    exerciseId: null,
    durationS: null,
    distanceM: null,
    interval: null,
    historyOnly: false,
    status: 'rejected',
    rejection,
  });
  const startedAt = garminActivityIdentity(activity.startedAt);
  if (startedAt === null || hasUnreadableMeasures(activity)) return rejected('unreadable');
  const durationS = Math.round(activity.durationS);
  if (implausibleTiming(startedAt, garminActivityEnd({ startedAt, durationS }), now) !== null) {
    return rejected('unreadable');
  }

  const measured = {
    startedAt,
    garminType: activity.type,
    durationS,
    distanceM: loggedDistance(activity.distanceM),
    historyOnly: !isWithinEditWindow(startedAt, now),
  };
  if (activity.type !== null && GARMIN_STRENGTH_TYPES.has(activity.type)) {
    return { ...rejected('strength'), ...measured };
  }

  const exerciseId = (activity.type === null ? undefined : exerciseIdByGarminType.get(activity.type)) ?? null;
  const tooBigOrSmall = sizeRejection(measured.durationS, measured.distanceM);
  if (tooBigOrSmall !== null) return { ...rejected(tooBigOrSmall), ...measured, exerciseId };

  const status = exerciseId === null ? 'needs_exercise' : measured.historyOnly ? 'history_only' : 'importable';
  return { ...measured, exerciseId, interval: structuredInterval(activity), status, rejection: null };
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
