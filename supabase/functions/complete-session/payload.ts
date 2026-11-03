import { z } from 'npm:zod@4.6.5';
import {
  implausibleTiming,
  isRecord,
  MAX_SETS_PER_SESSION,
  splitSetsByDay,
  storableSnapshot,
} from '../_shared/domain/index.ts';
import { HttpError } from '../_shared/http.ts';
import {
  assertDistinctSetIdsAndPositions,
  lowerUuid,
  parseOr422,
  sessionNotes,
  setSchema,
} from '../_shared/session-payload.ts';

const programLinkSchema = z.object({ enrollmentId: lowerUuid, position: z.record(z.string(), z.unknown()) }).strict();

type ProgramLinkPayload = z.infer<typeof programLinkSchema>;

function containsNul(value: unknown): boolean {
  if (typeof value === 'string') return value.includes('\u0000');
  if (Array.isArray(value)) return value.some(containsNul);
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).some(([key, inner]) => key.includes('\u0000') || containsNul(inner));
  }
  return false;
}

function programLinkOrNull(value: unknown): ProgramLinkPayload | null {
  const parsed = programLinkSchema.safeParse(value);
  return parsed.success && !containsNul(parsed.data.position) ? parsed.data : null;
}

function withoutPrescriptions(body: unknown): { body: unknown; prescriptions: unknown[] } {
  if (!isRecord(body) || !Array.isArray(body.sets)) return { body, prescriptions: [] };
  const prescriptions = body.sets.map((set) => (isRecord(set) ? set.prescription : undefined));
  const sets = body.sets.map((set) =>
    isRecord(set) ? Object.fromEntries(Object.entries(set).filter(([key]) => key !== 'prescription')) : set,
  );
  return { body: { ...body, sets }, prescriptions };
}

function toMillisecondIsoString(instant: string): string {
  return new Date(instant).toISOString();
}

const sessionSchema = z.object({
  id: lowerUuid,
  startedAt: z.iso.datetime({ offset: true }).transform(toMillisecondIsoString),
  endedAt: z.iso.datetime({ offset: true }).transform(toMillisecondIsoString),
  notes: sessionNotes.nullable().default(null),
  sessionRpe: z.number().int().min(1).max(10).nullable().default(null),
  programDayId: lowerUuid.nullable().default(null),
  program: z.unknown().default(null).transform(programLinkOrNull),
  secondDay: z
    .object({
      id: lowerUuid,
      program: z.unknown().default(null).transform(programLinkOrNull),
      setIds: z.array(lowerUuid).max(MAX_SETS_PER_SESSION),
    })
    .strict()
    .nullable()
    .default(null),
  challenge: z.object({ challengeId: lowerUuid }).strict().nullable().default(null),
  sets: z.array(setSchema).min(1).max(MAX_SETS_PER_SESSION),
});

export type CompleteSessionPayload = z.infer<typeof sessionSchema>;

const SECOND_DAY_START_OFFSET_MS = 1;

export type DayPayload = Omit<CompleteSessionPayload, 'secondDay'>;

export function dayPayloads(payload: CompleteSessionPayload): DayPayload[] {
  const { secondDay, ...firstDay } = payload;
  if (secondDay === null) return [firstDay];
  const { first, second } = splitSetsByDay(payload.sets, secondDay.setIds);
  const days: DayPayload[] = [
    { ...firstDay, sets: first },
    {
      ...firstDay,
      id: secondDay.id,
      startedAt: new Date(Date.parse(firstDay.startedAt) + SECOND_DAY_START_OFFSET_MS).toISOString(),
      program: secondDay.program,
      programDayId: null,
      challenge: null,
      sets: second,
    },
  ];
  return days.filter((day) => day.sets.length > 0);
}

export function assertPlausibleTiming(payload: Pick<DayPayload, 'startedAt' | 'endedAt'>, now: Date): void {
  const reason = implausibleTiming(payload.startedAt, payload.endedAt, now.getTime());
  if (reason !== null) throw new HttpError(422, reason);
}

export function parseCompleteSessionPayload(body: unknown): CompleteSessionPayload {
  const { body: bodyWithoutPrescriptions, prescriptions } = withoutPrescriptions(body);
  const payload = parseOr422(sessionSchema, bodyWithoutPrescriptions);
  assertDistinctSetIdsAndPositions(payload.sets);
  if (payload.secondDay?.id === payload.id) throw new HttpError(422, 'second_day_session_id');
  return {
    ...payload,
    sets: payload.sets.map((set, index) =>
      set.kind === 'lift' ? { ...set, prescription: storableSnapshot(prescriptions[index]) } : set,
    ),
  };
}
