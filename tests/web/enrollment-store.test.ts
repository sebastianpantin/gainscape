import { describe, expect, it } from 'vitest';
import {
  type EnrollmentFactsRows,
  type EnrollmentRow,
  type LinkedSessionRow,
} from '../../web/src/lib/programs/program-facts-rules.ts';
import { withSecondDay } from '../../web/src/offline/draft-days.ts';
import { type WorkoutDraft } from '../../web/src/offline/draft-format.ts';
import { startDraftFromPrescription } from '../../web/src/offline/draft-starts.ts';
import {
  type EnrollmentIo,
  type EnrollmentServer,
  eraseStoredEnrollment,
  forgetStoredEnrollment,
  forgetStoredSession,
  recordFinishedWorkout,
  refreshEnrollment,
  refreshEnrollmentFacts,
  type StoredEnrollment,
  storedEnrollment,
  storeTemplates,
  watchStoredEnrollment,
} from '../../web/src/offline/enrollment-store.ts';
import { factClock, sessionFact, setReferenceFact } from '../domain/program-fixtures/facts.ts';
import { MADCOW_5X5, madcowDaySets, MADCOW_EXERCISES, weekDay } from '../domain/program-fixtures/madcow_5x5.ts';
import { madcowEnrollmentRow } from './madcow-enrollment-fixture.ts';
import { MemoryStorage } from './memory-storage.ts';
import {
  MADCOW_TEMPLATE,
  STORED_ENROLLMENT_PREFIX,
  storedRecord,
  storeRaw,
  storeRecord,
} from './stored-enrollment-fixture.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const FIRST_ID = '7a2f0c1e-1111-4111-8111-111111111111';
const SECOND_ID = '7a2f0c1e-2222-4222-8222-222222222222';
const THIRD_ID = '7a2f0c1e-3333-4333-8333-333333333333';
const SECOND_SESSION_ID = '33333333-3333-4333-8333-333333333333';
const STORED_KEY = `${STORED_ENROLLMENT_PREFIX}${USER_ID}`;

const NOTHING_STORED: StoredEnrollment = { templates: [], enrollment: null, facts: [], refreshed: false };

const MONDAY_FACT = sessionFact(factClock('monday').next(), weekDay(1, 'mon'), madcowDaySets('mon'));

function sessionRow(id: string, completedAt: string): LinkedSessionRow {
  return {
    id,
    completed_at: completedAt,
    program_position: { week: 1, day: 'mon' },
    sets: [
      {
        ref: 'mon-squat:0',
        exercise_id: MADCOW_EXERCISES.squat,
        weight_kg: 47.5,
        reps: 5,
        effort_input_type: null,
        effort_value: null,
        prescribed_weight_kg: 47.5,
        prescribed_reps: 5,
        prescribed_min_reps: null,
        prescribed_amrap: false,
      },
    ],
  };
}

const MONDAY_ROW = sessionRow('session-monday', '2026-10-05T07:00:00.000Z');
const WEDNESDAY_ROW = sessionRow('session-wednesday', '2026-10-07T07:00:00.000Z');

function factsRows(enrollment: EnrollmentRow, sessions: LinkedSessionRow[]): EnrollmentFactsRows {
  return { enrollment, events: [], sessions };
}

interface Harness {
  io: EnrollmentIo;
  storage: MemoryStorage;
  factsRequests: string[];
}

function harness(server: Partial<EnrollmentServer> & Pick<EnrollmentServer, 'enrollmentFacts'>): Harness {
  const storage = new MemoryStorage();
  const factsRequests: string[] = [];
  const io: EnrollmentIo = {
    device: storage,
    now: () => 1_000,
    server: {
      templates: async () => [MADCOW_TEMPLATE],
      activeEnrollment: async () => madcowEnrollmentRow({ id: FIRST_ID }),
      ...server,
      enrollmentFacts: (enrollmentId) => {
        factsRequests.push(enrollmentId);
        return server.enrollmentFacts(enrollmentId);
      },
    },
  };
  return { io, storage, factsRequests };
}

function factIds(stored: StoredEnrollment): string[] {
  return stored.facts.map((fact) => fact.id);
}

function readRaw(value: unknown): StoredEnrollment {
  const storage = new MemoryStorage();
  storeRaw(storage, USER_ID, value);
  return storedEnrollment(storage, USER_ID);
}

function withServerFacts(facts: unknown[]): Record<string, unknown> {
  const record = storedRecord(USER_ID, { enrollment: madcowEnrollmentRow(), serverFacts: [MONDAY_FACT] });
  return { ...record, facts: { ...(record.facts as object), serverFacts: facts } };
}

function programDraft(enrollmentId = FIRST_ID): WorkoutDraft {
  return startDraftFromPrescription(
    {
      enrollmentId,
      templateKey: 'madcow_5x5',
      programName: 'Madcow 5x5',
      dayName: 'W1 Day 1',
      position: weekDay(1, 'mon'),
      exercises: [],
    },
    new Map(),
    new Date('2026-10-05T06:00:00.000Z'),
  ).draft;
}

function mondayAndWednesday(): WorkoutDraft {
  const wednesday = {
    enrollmentId: FIRST_ID,
    templateKey: 'madcow_5x5',
    programName: 'Madcow 5x5',
    dayName: 'W1 Day 2',
    position: weekDay(1, 'wed'),
    exercises: [],
  };
  return withSecondDay(programDraft(), wednesday, new Map(), SECOND_SESSION_ID).draft;
}

const COMPLETED_AT = '2026-10-07T07:00:00.000Z';
const LINKED = { programLinked: true, completedAt: COMPLETED_AT };

function storedWithEnrollment(storage: Storage = new MemoryStorage()): Storage {
  storeRecord(storage, USER_ID, { enrollment: madcowEnrollmentRow({ id: FIRST_ID }), serverFacts: [MONDAY_FACT] });
  return storage;
}

describe('reading the stored Enrollment offline', () => {
  it('reads the templates, the enrollment and its facts an existing device stored', () => {
    const storage = storedWithEnrollment();
    expect(storedEnrollment(storage, USER_ID)).toEqual({
      templates: [MADCOW_TEMPLATE],
      enrollment: madcowEnrollmentRow({ id: FIRST_ID }),
      facts: [MONDAY_FACT],
      refreshed: false,
    });
  });

  it('keeps the owner of a template compiled from your own program', () => {
    const owned = { key: 'custom_program', version: 2, name: 'Mine', definition: MADCOW_5X5, owner_user_id: USER_ID };
    const storage = new MemoryStorage();
    storeRecord(storage, USER_ID, { templates: [owned] });
    expect(storedEnrollment(storage, USER_ID).templates).toEqual([owned]);
  });

  it('reads back that a refresh wrote the copy at least once', () => {
    const storage = new MemoryStorage();
    storeRecord(storage, USER_ID, { refreshed: true });
    expect(storedEnrollment(storage, USER_ID).refreshed).toBe(true);
  });

  it('lists the server facts, then the local appends the server has not sent yet', () => {
    const storage = new MemoryStorage();
    const local = sessionFact(factClock('local').next(), weekDay(1, 'wed'), madcowDaySets('wed'));
    storeRecord(storage, USER_ID, {
      enrollment: madcowEnrollmentRow({ id: FIRST_ID }),
      serverFacts: [MONDAY_FACT],
      localAppends: [
        { fact: MONDAY_FACT, appendedAt: 1 },
        { fact: local, appendedAt: 2 },
      ],
    });
    expect(factIds(storedEnrollment(storage, USER_ID))).toEqual([MONDAY_FACT.id, local.id]);
  });

  it('is empty when nothing is stored or storage is unavailable', () => {
    expect(storedEnrollment(new MemoryStorage(), USER_ID)).toEqual(NOTHING_STORED);
    expect(storedEnrollment(null, USER_ID)).toEqual(NOTHING_STORED);
  });

  it('is empty for text that is not JSON', () => {
    expect(readRaw('{not json')).toEqual(NOTHING_STORED);
  });

  it('is empty for another stored version', () => {
    expect(readRaw({ ...storedRecord(USER_ID, {}), v: 2 })).toEqual(NOTHING_STORED);
  });

  it("is empty when the stored record belongs to another user's id", () => {
    expect(readRaw(storedRecord(OTHER_USER_ID, { enrollment: madcowEnrollmentRow() }))).toEqual(NOTHING_STORED);
  });

  it('is empty when the enrollment fails the schema', () => {
    expect(readRaw(storedRecord(USER_ID, { enrollment: { ...madcowEnrollmentRow(), unit: 'stone' as 'kg' } }))).toEqual(
      NOTHING_STORED,
    );
  });

  it('is empty when reading storage throws', () => {
    const storage = new MemoryStorage();
    storage.getItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    expect(storedEnrollment(storage, USER_ID)).toEqual(NOTHING_STORED);
  });
});

describe('reading malformed stored facts', () => {
  it('is empty for a session fact whose sets are not a list', () => {
    expect(readRaw(withServerFacts([{ ...MONDAY_FACT, sets: 'oops' }]))).toEqual(NOTHING_STORED);
  });

  it('is empty for a session fact whose set has a text weight', () => {
    const [first, ...rest] = MONDAY_FACT.sets;
    const broken = { ...MONDAY_FACT, sets: [{ ...first, weightKg: 'heavy' }, ...rest] };
    expect(readRaw(withServerFacts([broken]))).toEqual(NOTHING_STORED);
  });

  it('is empty for a session fact with no position', () => {
    const { position, ...withoutPosition } = MONDAY_FACT;
    void position;
    expect(readRaw(withServerFacts([withoutPosition]))).toEqual(NOTHING_STORED);
  });

  it('is empty for a set_reference fact whose value is text', () => {
    const fact = { ...setReferenceFact(factClock('ref').next(), 'squat', 'top', 100), value: 'a lot' };
    expect(readRaw(withServerFacts([fact]))).toEqual(NOTHING_STORED);
  });

  it('is empty for a set_reference fact with an unknown reference var', () => {
    const fact = { ...setReferenceFact(factClock('ref').next(), 'squat', 'top', 100), var: 'vibes' };
    expect(readRaw(withServerFacts([fact]))).toEqual(NOTHING_STORED);
  });

  it('is empty for a skip_day or jump_to fact with no position', () => {
    const stamp = factClock('skip').next();
    expect(readRaw(withServerFacts([{ kind: 'skip_day', ...stamp }]))).toEqual(NOTHING_STORED);
    expect(readRaw(withServerFacts([{ kind: 'jump_to', ...stamp, position: 'next' }]))).toEqual(NOTHING_STORED);
  });

  it('is empty for a fact of an unknown kind', () => {
    expect(readRaw(withServerFacts([{ kind: 'teleport', ...factClock('x').next() }]))).toEqual(NOTHING_STORED);
  });

  it('is empty for a malformed local append', () => {
    const record = withServerFacts([MONDAY_FACT]);
    const facts = {
      ...(record.facts as object),
      localAppends: [{ fact: { ...MONDAY_FACT, sets: null }, appendedAt: 1 }],
    };
    expect(readRaw({ ...record, facts })).toEqual(NOTHING_STORED);
  });

  it('still reads well-formed session, set_reference, skip_day and jump_to facts', () => {
    const clock = factClock('ok');
    const facts = [
      MONDAY_FACT,
      setReferenceFact(clock.next(), 'squat', 'top', 100),
      { kind: 'skip_day', ...clock.next(), position: weekDay(1, 'wed') },
      { kind: 'jump_to', ...clock.next(), position: weekDay(2, 'mon') },
    ];
    expect(readRaw(withServerFacts(facts)).facts).toEqual(facts);
  });
});

describe('refreshing the Enrollment from the server', () => {
  it('stores the fetched templates, the active enrollment and its facts, and marks the copy refreshed', async () => {
    const { io, storage } = harness({
      enrollmentFacts: async () => factsRows(madcowEnrollmentRow({ id: FIRST_ID }), [MONDAY_ROW]),
    });
    const refreshed = await refreshEnrollment(io, USER_ID);
    expect(refreshed).toEqual(storedEnrollment(storage, USER_ID));
    expect(refreshed.templates).toEqual([MADCOW_TEMPLATE]);
    expect(refreshed.enrollment?.id).toBe(FIRST_ID);
    expect(factIds(refreshed)).toEqual(['session-monday']);
    expect(refreshed.refreshed).toBe(true);
  });

  it('marks the copy refreshed even when no enrollment is active', async () => {
    const { io, storage } = harness({
      activeEnrollment: async () => null,
      enrollmentFacts: async () => factsRows(madcowEnrollmentRow({ id: FIRST_ID }), []),
    });
    expect(storedEnrollment(storage, USER_ID).refreshed).toBe(false);
    await refreshEnrollment(io, USER_ID);
    expect(storedEnrollment(storage, USER_ID).refreshed).toBe(true);
  });

  it('clears the enrollment and its facts when it was ended on another device, without fetching facts', async () => {
    const { io, storage, factsRequests } = harness({
      activeEnrollment: async () => null,
      enrollmentFacts: async () => factsRows(madcowEnrollmentRow({ id: FIRST_ID }), [MONDAY_ROW]),
    });
    storedWithEnrollment(storage);
    const refreshed = await refreshEnrollment(io, USER_ID);
    expect(refreshed).toMatchObject({ enrollment: null, facts: [] });
    expect(storedEnrollment(storage, USER_ID)).toMatchObject({ enrollment: null, facts: [] });
    expect(factsRequests).toEqual([]);
  });

  it('keeps the stored copy when a fetch fails', async () => {
    const { io, storage } = harness({
      templates: async () => {
        throw new TypeError('Failed to fetch');
      },
      enrollmentFacts: async () => factsRows(madcowEnrollmentRow({ id: FIRST_ID }), [MONDAY_ROW]),
    });
    storedWithEnrollment(storage);
    const before = storage.getItem(STORED_KEY);
    await expect(refreshEnrollment(io, USER_ID)).rejects.toThrow('Failed to fetch');
    expect(storage.getItem(STORED_KEY)).toBe(before);
  });
});

describe('refreshing the facts of an Enrollment', () => {
  it('merges the fetched sessions into the stored facts', async () => {
    const { io } = harness({
      enrollmentFacts: async () => factsRows(madcowEnrollmentRow({ id: FIRST_ID }), [MONDAY_ROW]),
    });
    const refreshed = await refreshEnrollmentFacts(io, USER_ID, madcowEnrollmentRow({ id: FIRST_ID }));
    expect(refreshed.enrollment?.id).toBe(FIRST_ID);
    expect(factIds(refreshed)).toEqual(['session-monday']);
  });

  it('stores the new enrollment before fetching, so a fetch for a new enrollment id is merged, not discarded', async () => {
    let enrollmentDuringFetch: string | undefined;
    const { io, storage } = harness({
      enrollmentFacts: async () => {
        enrollmentDuringFetch = storedEnrollment(storage, USER_ID).enrollment?.id;
        return factsRows(madcowEnrollmentRow({ id: SECOND_ID }), [MONDAY_ROW]);
      },
    });
    storedWithEnrollment(storage);
    const refreshed = await refreshEnrollmentFacts(io, USER_ID, madcowEnrollmentRow({ id: SECOND_ID }));
    expect(enrollmentDuringFetch).toBe(SECOND_ID);
    expect(refreshed.enrollment?.id).toBe(SECOND_ID);
    expect(factIds(refreshed)).toEqual(['session-monday']);
  });

  it('keeps the facts of the same enrollment when the fetch fails', async () => {
    const { io, storage } = harness({
      enrollmentFacts: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    storedWithEnrollment(storage);
    await expect(
      refreshEnrollmentFacts(io, USER_ID, { ...madcowEnrollmentRow({ id: FIRST_ID }), unit: 'lb' }),
    ).rejects.toThrow();
    expect(storedEnrollment(storage, USER_ID)).toMatchObject({ enrollment: { unit: 'lb' }, facts: [MONDAY_FACT] });
  });

  it('drops the facts of the old enrollment when a new one starts and its fetch fails', async () => {
    const { io, storage } = harness({
      enrollmentFacts: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    storedWithEnrollment(storage);
    await expect(refreshEnrollmentFacts(io, USER_ID, madcowEnrollmentRow({ id: SECOND_ID }))).rejects.toThrow();
    expect(storedEnrollment(storage, USER_ID)).toMatchObject({ enrollment: { id: SECOND_ID }, facts: [] });
  });

  it('discards the merge when a session was deleted during the fetch, so the deleted session does not come back', async () => {
    const { io, storage } = harness({
      enrollmentFacts: async () => {
        forgetStoredSession(storage, USER_ID, 'session-monday');
        return factsRows(madcowEnrollmentRow({ id: FIRST_ID }), [MONDAY_ROW, WEDNESDAY_ROW]);
      },
    });
    storeRecord(storage, USER_ID, {
      enrollment: madcowEnrollmentRow({ id: FIRST_ID }),
      serverFacts: [
        { kind: 'session', id: 'session-monday', at: MONDAY_ROW.completed_at, position: weekDay(1, 'mon'), sets: [] },
      ],
    });
    const refreshed = await refreshEnrollmentFacts(io, USER_ID, madcowEnrollmentRow({ id: FIRST_ID }));
    expect(factIds(refreshed)).not.toContain('session-monday');
    expect(factIds(storedEnrollment(storage, USER_ID))).not.toContain('session-monday');
  });

  it('discards the merge when another enrollment started during the fetch', async () => {
    const { io, storage } = harness({
      enrollmentFacts: async () => {
        storeRecord(storage, USER_ID, { enrollment: madcowEnrollmentRow({ id: THIRD_ID }) });
        return factsRows(madcowEnrollmentRow({ id: FIRST_ID }), [MONDAY_ROW]);
      },
    });
    const refreshed = await refreshEnrollmentFacts(io, USER_ID, madcowEnrollmentRow({ id: FIRST_ID }));
    expect(refreshed.enrollment?.id).toBe(THIRD_ID);
    expect(factIds(refreshed)).toEqual([]);
  });
});

describe('storing the templates', () => {
  it('replaces the templates and keeps the enrollment and its facts', () => {
    const storage = storedWithEnrollment();
    const renamed = { ...MADCOW_TEMPLATE, name: 'Madcow' };
    storeTemplates(storage, USER_ID, [renamed]);
    expect(storedEnrollment(storage, USER_ID)).toMatchObject({
      templates: [renamed],
      enrollment: { id: FIRST_ID },
      facts: [MONDAY_FACT],
    });
  });
});

describe('forgetting the stored Enrollment', () => {
  it('clears the enrollment and its facts but keeps the templates', () => {
    const storage = storedWithEnrollment();
    forgetStoredEnrollment(storage, USER_ID);
    expect(storedEnrollment(storage, USER_ID)).toMatchObject({
      templates: [MADCOW_TEMPLATE],
      enrollment: null,
      facts: [],
    });
  });

  it('erases the whole stored copy of one user', () => {
    const storage = storedWithEnrollment();
    storeRecord(storage, OTHER_USER_ID, { enrollment: madcowEnrollmentRow() });
    eraseStoredEnrollment(storage, USER_ID);
    expect(storage.getItem(STORED_KEY)).toBeNull();
    expect(storedEnrollment(storage, OTHER_USER_ID).enrollment).not.toBeNull();
  });
});

describe('recording a finished workout', () => {
  it('appends a fact for the synced program Session', () => {
    const storage = storedWithEnrollment();
    const draft = programDraft();
    recordFinishedWorkout(storage, USER_ID, draft, LINKED);
    expect(factIds(storedEnrollment(storage, USER_ID))).toEqual([MONDAY_FACT.id, draft.sessionId]);
  });

  it('appends one fact for each Day of a two-Day Draft', () => {
    const storage = storedWithEnrollment();
    const draft = mondayAndWednesday();
    recordFinishedWorkout(storage, USER_ID, draft, {
      ...LINKED,
      days: [
        { sessionId: draft.sessionId, ...LINKED },
        { sessionId: SECOND_SESSION_ID, ...LINKED },
      ],
    });
    expect(storedEnrollment(storage, USER_ID).facts.slice(1)).toMatchObject([
      { id: draft.sessionId, position: weekDay(1, 'mon') },
      { id: SECOND_SESSION_ID, position: weekDay(1, 'wed') },
    ]);
  });

  it('appends a fact only for the Day the server stored', () => {
    const storage = storedWithEnrollment();
    recordFinishedWorkout(storage, USER_ID, mondayAndWednesday(), {
      ...LINKED,
      days: [{ sessionId: SECOND_SESSION_ID, ...LINKED }],
    });
    expect(factIds(storedEnrollment(storage, USER_ID))).toEqual([MONDAY_FACT.id, SECOND_SESSION_ID]);
  });

  it('changes nothing for a Draft that is not linked to a program', () => {
    const storage = storedWithEnrollment();
    const before = storage.getItem(STORED_KEY);
    recordFinishedWorkout(storage, USER_ID, { ...programDraft(), program: null }, LINKED);
    expect(storage.getItem(STORED_KEY)).toBe(before);
  });

  it('changes nothing for a reply without programLinked or completedAt', () => {
    const storage = storedWithEnrollment();
    const before = storage.getItem(STORED_KEY);
    recordFinishedWorkout(storage, USER_ID, programDraft(), {});
    expect(storage.getItem(STORED_KEY)).toBe(before);
  });

  it('changes nothing when no enrollment is stored', () => {
    const storage = new MemoryStorage();
    storeRecord(storage, USER_ID, {});
    recordFinishedWorkout(storage, USER_ID, programDraft(), LINKED);
    expect(storedEnrollment(storage, USER_ID).facts).toEqual([]);
  });
});

describe('forgetting a deleted Session', () => {
  it('drops its fact, so a fetch started before the delete cannot bring it back', () => {
    const storage = storedWithEnrollment();
    forgetStoredSession(storage, USER_ID, MONDAY_FACT.id);
    expect(storedEnrollment(storage, USER_ID).facts).toEqual([]);
    expect(
      (JSON.parse(storage.getItem(STORED_KEY) as string) as { facts: { generation: number } }).facts.generation,
    ).toBe(1);
  });
});

describe('watching the stored Enrollment', () => {
  it('tells watchers the changed copy after each write, and stops after unwatching', async () => {
    const { io, storage } = harness({
      enrollmentFacts: async () => factsRows(madcowEnrollmentRow({ id: FIRST_ID }), [MONDAY_ROW]),
    });
    const seen: [string, StoredEnrollment][] = [];
    const unwatch = watchStoredEnrollment((userId, stored) => seen.push([userId, stored]));
    await refreshEnrollment(io, USER_ID);
    forgetStoredEnrollment(storage, USER_ID);
    unwatch();
    forgetStoredEnrollment(storage, USER_ID);
    expect(seen.map(([userId, stored]) => [userId, stored.enrollment?.id ?? null])).toEqual([
      [USER_ID, FIRST_ID],
      [USER_ID, null],
    ]);
  });
});
