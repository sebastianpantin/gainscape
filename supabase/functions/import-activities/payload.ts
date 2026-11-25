import { z } from 'npm:zod@4.6.5';
import {
  CARDIO_BOUNDS,
  GARMIN_IMPORT_CHUNK,
  GARMIN_KEY_PATTERN,
  garminActivityEnd,
  garminActivityIdentity,
  garminCategoryKey,
  type GarminExercisePick,
  MAX_SESSION_DURATION_S,
  MAX_SETS_PER_SESSION,
} from '../_shared/domain/index.ts';
import { isoInstant, lowerUuid, parseOr422, type SetPayload, setSchema } from '../_shared/session-payload.ts';

const activityIdentity = {
  startedAt: isoInstant.refine(
    (instant) => garminActivityIdentity(instant) === instant,
    'a Garmin activity starts on a whole second',
  ),
  garminType: z.string().regex(GARMIN_KEY_PATTERN).nullable().default(null),
};

const cardioActivitySchema = z
  .object({
    ...activityIdentity,
    exerciseId: lowerUuid,
    durationS: z.int().min(CARDIO_BOUNDS.steadyDurationS.min).max(CARDIO_BOUNDS.steadyDurationS.max),
    distanceM: z.unknown().default(null),
    interval: z.unknown().default(null),
  })
  .strict();

const pickSchema = z
  .object({
    category: z.string().refine((category) => garminCategoryKey(category) !== null, 'no Garmin exercise category'),
    exerciseId: lowerUuid,
  })
  .strict();

const strengthActivitySchema = z
  .object({
    ...activityIdentity,
    durationS: z.int().min(0).max(MAX_SESSION_DURATION_S),
    sets: z
      .array(z.object({ exerciseId: lowerUuid, reps: z.unknown(), weightKg: z.unknown() }).strict())
      .min(1)
      .max(MAX_SETS_PER_SESSION),
    picks: z.array(pickSchema).max(MAX_SETS_PER_SESSION).default([]),
  })
  .strict()
  .refine(
    (activity) => activity.picks.every((pick) => activity.sets.some((set) => set.exerciseId === pick.exerciseId)),
    { message: 'a pick names an exercise of one of the sets', path: ['picks'] },
  );

const importSchema = z
  .object({
    activities: z
      .array(z.union([cardioActivitySchema, strengthActivitySchema]))
      .min(1)
      .max(GARMIN_IMPORT_CHUNK.maxActivities),
  })
  .strict();

type SentActivity = z.infer<typeof importSchema>['activities'][number];

export interface ConfirmedActivity {
  startedAt: string;
  endedAt: string;
  garminType: string | null;
  sets: SetPayload[];
  picks: GarminExercisePick[];
}

export interface ImportActivitiesPayload {
  activities: ConfirmedActivity[];
}

function setsOf(activity: SentActivity): SetPayload[] {
  if ('sets' in activity) {
    return activity.sets.map((set, position) =>
      parseOr422(setSchema, { kind: 'lift', id: crypto.randomUUID(), position, ...set }),
    );
  }
  const { exerciseId, durationS, distanceM, interval } = activity;
  return [
    parseOr422(setSchema, {
      kind: 'cardio',
      id: crypto.randomUUID(),
      exerciseId,
      position: 0,
      ...(interval === null ? { durationS } : {}),
      distanceM,
      interval,
    }),
  ];
}

export function parseImportActivitiesPayload(body: unknown): ImportActivitiesPayload {
  const { activities } = parseOr422(importSchema, body);
  return {
    activities: activities.map((activity) => ({
      startedAt: activity.startedAt,
      endedAt: garminActivityEnd(activity),
      garminType: activity.garminType,
      sets: setsOf(activity),
      picks: 'picks' in activity ? activity.picks : [],
    })),
  };
}
