import { z } from 'npm:zod@4.6.5';
import { implausibleTiming, MAX_SETS_PER_SESSION, storableSnapshot } from '../_shared/domain/index.ts';
import { HttpError } from '../_shared/http.ts';
import { assertDistinctSetIdsAndPositions, lowerUuid, parseOr422, setSchema } from '../_shared/session-payload.ts';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  notes: z.string().max(2000).nullable().default(null),
  programDayId: lowerUuid.nullable().default(null),
  program: z.unknown().default(null).transform(programLinkOrNull),
  sets: z.array(setSchema).min(1).max(MAX_SETS_PER_SESSION),
});

export type CompleteSessionPayload = z.infer<typeof sessionSchema>;

export function assertPlausibleTiming(payload: CompleteSessionPayload, now: Date): void {
  const reason = implausibleTiming(payload.startedAt, payload.endedAt, now.getTime());
  if (reason !== null) throw new HttpError(422, reason);
}

export function parseCompleteSessionPayload(body: unknown): CompleteSessionPayload {
  const { body: bodyWithoutPrescriptions, prescriptions } = withoutPrescriptions(body);
  const payload = parseOr422(sessionSchema, bodyWithoutPrescriptions);
  assertDistinctSetIdsAndPositions(payload.sets);
  return {
    ...payload,
    sets: payload.sets.map((set, index) =>
      set.kind === 'lift' ? { ...set, prescription: storableSnapshot(prescriptions[index]) } : set,
    ),
  };
}
