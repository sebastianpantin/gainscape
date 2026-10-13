import { describe, expect, it } from 'vitest';
import { type EnrollmentRow } from '../../web/src/lib/programs/program-facts-rules.ts';
import {
  EMPTY_PROGRAM_CACHE,
  factsOutcomeOf,
  forgetDeletedProgramSession,
  type ProgramCache,
  programCacheKey,
  readProgramCache,
  rememberFinishedSession,
  saveProgramCache,
  withEnrollment,
} from '../../web/src/offline/program-cache.ts';
import { startDraftFromPrescription, type WorkoutDraft } from '../../web/src/offline/draft-format.ts';
import { emptyProgramFactsCache } from '../../web/src/offline/program-facts-cache.ts';
import { type SendOutcome } from '../../web/src/offline/finish-lock.ts';
import { factClock, sessionFact, setReferenceFact } from '../domain/program-fixtures/facts.ts';
import { MADCOW_5X5, madcowDaySets, MADCOW_EXERCISES, weekDay } from '../domain/program-fixtures/madcow_5x5.ts';
import { MemoryStorage } from './memory-storage.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const ENROLLMENT_ID = '7a2f0c1e-1111-4111-8111-111111111111';
const NEXT_ENROLLMENT_ID = '7a2f0c1e-2222-4222-8222-222222222222';

function enrollmentRow(id = ENROLLMENT_ID): EnrollmentRow {
  return {
    id,
    template_key: 'madcow_5x5',
    template_version: 1,
    unit: 'kg',
    options: { rampStep: 0.125 },
    lift_bindings: { ...MADCOW_EXERCISES },
    inputs: {
      squat: { fiveRm: 100 },
      bench: { fiveRm: 80 },
      row: { fiveRm: 70 },
      press: { fiveRm: 50 },
      deadlift: { fiveRm: 140 },
    },
    rounding: { increment: 2.5, mode: 'nearest', barWeight: 20 },
    started_at: '2026-10-04T18:00:00.000Z',
    ended_at: null,
  };
}

const MONDAY = sessionFact(factClock('monday').next(), weekDay(1, 'mon'), madcowDaySets('mon'));

function cacheWithFacts(): ProgramCache {
  return {
    templates: [{ key: 'madcow_5x5', version: 1, name: 'Madcow 5x5', definition: MADCOW_5X5 }],
    enrollment: enrollmentRow(),
    facts: { ...emptyProgramFactsCache(ENROLLMENT_ID), serverFacts: [MONDAY] },
  };
}

function storedRaw(storage: Storage, value: unknown): void {
  storage.setItem(programCacheKey(USER_ID), typeof value === 'string' ? value : JSON.stringify(value));
}

function savedRecord(cache: ProgramCache = cacheWithFacts()): Record<string, unknown> {
  const storage = new MemoryStorage();
  saveProgramCache(storage, USER_ID, cache);
  return JSON.parse(storage.getItem(programCacheKey(USER_ID)) as string);
}

function withServerFacts(facts: unknown[]): Record<string, unknown> {
  const record = savedRecord();
  return { ...record, facts: { ...(record.facts as object), serverFacts: facts } };
}

function readRecord(record: unknown): ProgramCache {
  const storage = new MemoryStorage();
  storedRaw(storage, record);
  return readProgramCache(storage, USER_ID);
}

function programDraft(enrollmentId = ENROLLMENT_ID): WorkoutDraft {
  const { draft } = startDraftFromPrescription(
    {
      enrollmentId,
      templateKey: 'madcow_5x5',
      programName: 'Madcow 5x5',
      dayName: 'W1 Day 2',
      position: weekDay(1, 'wed'),
      exercises: [],
    },
    new Map(),
    new Date('2026-10-07T06:00:00.000Z'),
  );
  return draft;
}

const SYNCED = { kind: 'synced', summary: { programLinked: true, completedAt: '2026-10-07T07:00:00.000Z' } } as const;

describe('reading the program cache', () => {
  it('reads back a saved cache for the same user', () => {
    const storage = new MemoryStorage();
    saveProgramCache(storage, USER_ID, cacheWithFacts());
    expect(readProgramCache(storage, USER_ID)).toEqual(cacheWithFacts());
  });

  it('keeps the owner of a template compiled from your own program', () => {
    const owned = { key: 'custom_program', version: 2, name: 'Mine', definition: MADCOW_5X5, owner_user_id: USER_ID };
    const storage = new MemoryStorage();
    saveProgramCache(storage, USER_ID, { ...EMPTY_PROGRAM_CACHE, templates: [owned] });
    expect(readProgramCache(storage, USER_ID).templates).toEqual([owned]);
  });

  it('reads back that the cache was refreshed at least once', () => {
    const storage = new MemoryStorage();
    saveProgramCache(storage, USER_ID, { ...EMPTY_PROGRAM_CACHE, refreshed: true });
    expect(readProgramCache(storage, USER_ID).refreshed).toBe(true);
  });

  it('gives the empty cache when nothing is stored', () => {
    expect(readProgramCache(new MemoryStorage(), USER_ID)).toEqual(EMPTY_PROGRAM_CACHE);
  });

  it('gives the empty cache for text that is not JSON', () => {
    expect(readRecord('{not json')).toEqual(EMPTY_PROGRAM_CACHE);
  });

  it('gives the empty cache for another cache version', () => {
    expect(readRecord({ ...savedRecord(), v: 2 })).toEqual(EMPTY_PROGRAM_CACHE);
  });

  it("gives the empty cache when the stored record belongs to another user's id", () => {
    expect(readRecord({ ...savedRecord(), userId: OTHER_USER_ID })).toEqual(EMPTY_PROGRAM_CACHE);
  });

  it('gives the empty cache when the enrollment fails the schema', () => {
    expect(readRecord({ ...savedRecord(), enrollment: { ...enrollmentRow(), unit: 'stone' } })).toEqual(
      EMPTY_PROGRAM_CACHE,
    );
  });

  it('gives the empty cache when reading storage throws', () => {
    const storage = new MemoryStorage();
    storage.getItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    expect(readProgramCache(storage, USER_ID)).toEqual(EMPTY_PROGRAM_CACHE);
  });
});

describe('reading malformed cached facts', () => {
  it('gives the empty cache for a session fact whose sets are not a list', () => {
    expect(readRecord(withServerFacts([{ ...MONDAY, sets: 'oops' }]))).toEqual(EMPTY_PROGRAM_CACHE);
  });

  it('gives the empty cache for a session fact whose set has a text weight', () => {
    const [first, ...rest] = MONDAY.sets;
    const broken = { ...MONDAY, sets: [{ ...first, weightKg: 'heavy' }, ...rest] };
    expect(readRecord(withServerFacts([broken]))).toEqual(EMPTY_PROGRAM_CACHE);
  });

  it('gives the empty cache for a session fact with no position', () => {
    const { position, ...withoutPosition } = MONDAY;
    void position;
    expect(readRecord(withServerFacts([withoutPosition]))).toEqual(EMPTY_PROGRAM_CACHE);
  });

  it('gives the empty cache for a set_reference fact whose value is text', () => {
    const fact = { ...setReferenceFact(factClock('ref').next(), 'squat', 'top', 100), value: 'a lot' };
    expect(readRecord(withServerFacts([fact]))).toEqual(EMPTY_PROGRAM_CACHE);
  });

  it('gives the empty cache for a set_reference fact with an unknown reference var', () => {
    const fact = { ...setReferenceFact(factClock('ref').next(), 'squat', 'top', 100), var: 'vibes' };
    expect(readRecord(withServerFacts([fact]))).toEqual(EMPTY_PROGRAM_CACHE);
  });

  it('gives the empty cache for a skip_day or jump_to fact with no position', () => {
    const stamp = factClock('skip').next();
    expect(readRecord(withServerFacts([{ kind: 'skip_day', ...stamp }]))).toEqual(EMPTY_PROGRAM_CACHE);
    expect(readRecord(withServerFacts([{ kind: 'jump_to', ...stamp, position: 'next' }]))).toEqual(EMPTY_PROGRAM_CACHE);
  });

  it('gives the empty cache for a fact of an unknown kind', () => {
    expect(readRecord(withServerFacts([{ kind: 'teleport', ...factClock('x').next() }]))).toEqual(EMPTY_PROGRAM_CACHE);
  });

  it('gives the empty cache for a malformed local append', () => {
    const record = savedRecord();
    const facts = { ...(record.facts as object), localAppends: [{ fact: { ...MONDAY, sets: null }, appendedAt: 1 }] };
    expect(readRecord({ ...record, facts })).toEqual(EMPTY_PROGRAM_CACHE);
  });

  it('still reads well-formed session, set_reference, skip_day and jump_to facts', () => {
    const clock = factClock('ok');
    const facts = [
      MONDAY,
      setReferenceFact(clock.next(), 'squat', 'top', 100),
      { kind: 'skip_day', ...clock.next(), position: weekDay(1, 'wed') },
      { kind: 'jump_to', ...clock.next(), position: weekDay(2, 'mon') },
    ];
    expect(readRecord(withServerFacts(facts)).facts?.serverFacts).toEqual(facts);
  });
});

describe('saving the program cache', () => {
  it('swallows a quota error', () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    expect(() => saveProgramCache(storage, USER_ID, cacheWithFacts())).not.toThrow();
  });
});

describe('changing the cached enrollment', () => {
  it('keeps the facts when the enrollment id stays the same', () => {
    const cache = cacheWithFacts();
    expect(withEnrollment(cache, { ...enrollmentRow(), unit: 'lb' }).facts).toBe(cache.facts);
  });

  it('resets the facts for a new enrollment id', () => {
    expect(withEnrollment(cacheWithFacts(), enrollmentRow(NEXT_ENROLLMENT_ID)).facts).toEqual(
      emptyProgramFactsCache(NEXT_ENROLLMENT_ID),
    );
  });

  it('clears the enrollment and the facts for no enrollment', () => {
    expect(withEnrollment(cacheWithFacts(), null)).toMatchObject({ enrollment: null, facts: null });
  });
});

describe('remembering a finished program session', () => {
  it('appends a synced program session to the cached facts', () => {
    const storage = new MemoryStorage();
    saveProgramCache(storage, USER_ID, cacheWithFacts());
    const draft = programDraft();
    rememberFinishedSession(storage, USER_ID, draft, SYNCED, 5);
    expect(readProgramCache(storage, USER_ID).facts?.localAppends.map((append) => append.fact.id)).toEqual([
      draft.sessionId,
    ]);
  });

  it('changes nothing for a draft that is not linked to a program', () => {
    const storage = new MemoryStorage();
    saveProgramCache(storage, USER_ID, cacheWithFacts());
    const before = storage.getItem(programCacheKey(USER_ID));
    rememberFinishedSession(storage, USER_ID, { ...programDraft(), program: null }, SYNCED, 5);
    expect(storage.getItem(programCacheKey(USER_ID))).toBe(before);
  });

  it('changes nothing when the cache holds no facts', () => {
    const storage = new MemoryStorage();
    saveProgramCache(storage, USER_ID, { ...cacheWithFacts(), facts: null });
    rememberFinishedSession(storage, USER_ID, programDraft(), SYNCED, 5);
    expect(readProgramCache(storage, USER_ID).facts).toBeNull();
  });
});

describe('forgetting a deleted program session', () => {
  it('drops the session and bumps the facts generation', () => {
    const storage = new MemoryStorage();
    saveProgramCache(storage, USER_ID, cacheWithFacts());
    forgetDeletedProgramSession(storage, USER_ID, MONDAY.id);
    const facts = readProgramCache(storage, USER_ID).facts;
    expect(facts?.serverFacts).toEqual([]);
    expect(facts?.generation).toBe(1);
  });
});

describe('the facts outcome of a finished sync', () => {
  const summary = { xpBySkill: {}, levelUps: [], prs: [], drops: [] };

  it('passes on programLinked and completedAt from a synced response', () => {
    const outcome = {
      kind: 'synced',
      summary: { ...summary, programLinked: true, completedAt: '2026-10-07T07:00:00.000Z' },
    } as unknown as SendOutcome;
    expect(factsOutcomeOf(outcome)).toEqual(SYNCED);
  });

  it('passes on an unlinked synced response as unlinked', () => {
    const outcome = {
      kind: 'synced',
      summary: { ...summary, programLinked: false, completedAt: '2026-10-07T07:00:00.000Z' },
    } as unknown as SendOutcome;
    expect(factsOutcomeOf(outcome)).toEqual({
      kind: 'synced',
      summary: { programLinked: false, completedAt: '2026-10-07T07:00:00.000Z' },
    });
  });

  it('gives nothing for a synced response from a function without programLinked or completedAt', () => {
    expect(factsOutcomeOf({ kind: 'synced', summary } as unknown as SendOutcome)).toBeNull();
    expect(
      factsOutcomeOf({ kind: 'synced', summary: { ...summary, programLinked: true } } as unknown as SendOutcome),
    ).toBeNull();
  });

  it('gives nothing for an outcome that did not sync', () => {
    expect(factsOutcomeOf({ kind: 'retryable', reason: 'network' })).toBeNull();
    expect(factsOutcomeOf({ kind: 'deleted' })).toBeNull();
  });
});
