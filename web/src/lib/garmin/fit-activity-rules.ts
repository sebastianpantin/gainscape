import { type GarminActivity, type GarminLap, type GarminWorkoutStep, isRecord, MS_PER_SECOND } from '@domain/index.ts';

const GENERIC_SUB_SPORT = 'generic';
const TIMED_STEP = 'time';
const SPORTS_NAMED_BY_SUB_SPORT: ReadonlySet<string> = new Set(['training', 'fitness_equipment', 'generic']);
const GARMIN_TYPE_BY_SPORT_AND_SUB_SPORT: ReadonlyMap<string, string> = new Map([
  ['running/treadmill', 'treadmill_running'],
  ['running/trail', 'trail_running'],
  ['cycling/indoor_cycling', 'indoor_cycling'],
  ['cycling/virtual_activity', 'virtual_ride'],
  ['swimming/lap_swimming', 'lap_swimming'],
  ['swimming/open_water', 'open_water_swimming'],
  ['rowing/indoor_rowing', 'indoor_rowing'],
  ['training/cardio_training', 'indoor_cardio'],
]);
const UNWRITTEN_STEP: GarminWorkoutStep = Object.freeze({ intensity: null, durationS: null });

type FitMessage = Record<string, unknown>;

function messageOf(value: unknown): FitMessage {
  return isRecord(value) ? value : {};
}

function messagesOf(value: unknown): FitMessage[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nameOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function isoTimeOf(value: unknown): string {
  const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? '' : new Date(time).toISOString();
}

function messageIndexOf(value: unknown): number | null {
  return numberOf(messageOf(value).value);
}

export function garminTypeOfFitSport(sport: string | null, subSport: string | null): string | null {
  if (sport === null) return null;
  const specific = subSport === null || subSport === GENERIC_SUB_SPORT ? null : subSport;
  if (specific === null) return sport;
  const known = GARMIN_TYPE_BY_SPORT_AND_SUB_SPORT.get(`${sport}/${specific}`);
  if (known !== undefined) return known;
  return SPORTS_NAMED_BY_SUB_SPORT.has(sport) ? specific : sport;
}

function workoutStepsOf(messages: readonly FitMessage[]): GarminWorkoutStep[] {
  const steps: GarminWorkoutStep[] = [];
  messages.forEach((message, position) => {
    const durationMs = message.duration_type === TIMED_STEP ? numberOf(message.duration_value) : null;
    steps[messageIndexOf(message.message_index) ?? position] = {
      intensity: nameOf(message.intensity),
      durationS: durationMs === null ? null : durationMs / MS_PER_SECOND,
    };
  });
  return Array.from(steps, (step) => step ?? UNWRITTEN_STEP);
}

function lapsOfSession(session: FitMessage, sessionCount: number, laps: readonly GarminLap[]): GarminLap[] {
  const first = numberOf(session.first_lap_index);
  const count = numberOf(session.num_laps);
  if (first !== null && count !== null) return laps.slice(first, first + count);
  return sessionCount === 1 ? [...laps] : [];
}

export function garminActivitiesFromFit(parsed: unknown): GarminActivity[] {
  const file = messageOf(parsed);
  const sessions = messagesOf(file.sessions);
  const laps = messagesOf(file.laps).map((lap) => ({ workoutStepIndex: messageIndexOf(lap.wkt_step_index) }));
  const workoutSteps = workoutStepsOf(messagesOf(messageOf(file.messages).workout_step));
  return sessions.map((session) => ({
    type: garminTypeOfFitSport(nameOf(session.sport), nameOf(session.sub_sport)),
    startedAt: isoTimeOf(session.start_time),
    durationS: numberOf(session.total_timer_time) ?? numberOf(session.total_elapsed_time) ?? Number.NaN,
    distanceM: numberOf(session.total_distance) || null,
    laps: lapsOfSession(session, sessions.length, laps),
    workoutSteps,
  }));
}
