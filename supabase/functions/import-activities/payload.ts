import { z } from 'npm:zod@4.6.5';
import {
  CARDIO_BOUNDS,
  GARMIN_IMPORT_CHUNK,
  garminActivityEnd,
  garminActivityIdentity,
} from '../_shared/domain/index.ts';
import { lowerUuid, parseOr422, type SetPayload, setSchema } from '../_shared/session-payload.ts';

const activitySchema = z
  .object({
    startedAt: z.iso
      .datetime({ offset: true })
      .transform((instant) => new Date(instant).toISOString())
      .refine((instant) => garminActivityIdentity(instant) === instant, 'a Garmin activity starts on a whole second'),
    garminType: z
      .string()
      .regex(/^[a-z0-9_]{1,60}$/)
      .nullable()
      .default(null),
    exerciseId: lowerUuid,
    durationS: z.int().min(CARDIO_BOUNDS.steadyDurationS.min).max(CARDIO_BOUNDS.steadyDurationS.max),
    distanceM: z.unknown().default(null),
    interval: z.unknown().default(null),
  })
  .strict();

const importSchema = z
  .object({ activities: z.array(activitySchema).min(1).max(GARMIN_IMPORT_CHUNK.maxActivities) })
  .strict();

export interface ConfirmedActivity {
  startedAt: string;
  endedAt: string;
  garminType: string | null;
  set: SetPayload;
}

export interface ImportActivitiesPayload {
  activities: ConfirmedActivity[];
}

export function parseImportActivitiesPayload(body: unknown): ImportActivitiesPayload {
  const { activities } = parseOr422(importSchema, body);
  return {
    activities: activities.map(({ startedAt, garminType, exerciseId, durationS, distanceM, interval }) => ({
      startedAt,
      endedAt: garminActivityEnd({ startedAt, durationS }),
      garminType,
      set: parseOr422(setSchema, {
        kind: 'cardio',
        id: crypto.randomUUID(),
        exerciseId,
        position: 0,
        ...(interval === null ? { durationS } : {}),
        distanceM,
        interval,
      }),
    })),
  };
}
