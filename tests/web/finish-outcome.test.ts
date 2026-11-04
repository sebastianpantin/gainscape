import { type DropSummary, type PrescribedExercise, resolvePrescription } from '@domain/index.ts';
import { initialProgramState } from '@domain/program-state.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InvokeOutcome } from '../../web/src/lib/platform/function-client-rules.ts';
import { withSecondDay } from '../../web/src/offline/draft-days.ts';
import type { WorkoutDraft } from '../../web/src/offline/draft-format.ts';
import {
  type CatalogEntry,
  type PrescribedDayStart,
  startDraftFromPrescription,
} from '../../web/src/offline/draft-starts.ts';
import {
  completeFinishedDraft,
  type FinishIo,
  finishOutcomeCovers,
  finishOutcomeLoot,
  type FinishSummary,
  forgetFinishOutcomeCovering,
  forgetFinishOutcomeOf,
  recallFinishOutcome,
} from '../../web/src/offline/finish-outcome.ts';
import { type ItemsCache, readItemsCache, saveItemsCache } from '../../web/src/offline/items-cache.ts';
import { readProgramCache, saveProgramCache } from '../../web/src/offline/program-cache.ts';
import { emptyProgramFactsCache } from '../../web/src/offline/program-facts-cache.ts';
import { completeSessionPayload } from '../../web/src/offline/session-payload.ts';
import { MADCOW_5X5, madcowEnrollment, weekDay } from '../domain/program-fixtures/madcow_5x5.ts';
import { madcowEnrollmentRow } from './madcow-enrollment-fixture.ts';
import { MemoryStorage, throwingStorage } from './memory-storage.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_SESSION_ID = '33333333-3333-4333-8333-333333333333';
const ENROLLMENT_ID = madcowEnrollmentRow().id;
const STARTED_AT = new Date('2026-10-05T06:00:00.000Z');
const FINISHED_AT = '2026-10-05T07:00:00.000Z';
const COMPLETED_AT = '2026-10-05T07:00:01.000Z';
const LAST_SUMMARY_KEY = 'gainscape.last-summary';

const enrollment = { ...madcowEnrollment(), id: ENROLLMENT_ID };

function dayStart(day: 'mon' | 'wed', dayName: string): PrescribedDayStart {
  const exercises = resolvePrescription(
    MADCOW_5X5,
    enrollment,
    initialProgramState(MADCOW_5X5, enrollment),
    weekDay(1, day),
    {},
  ).filter((slot): slot is PrescribedExercise => slot.kind === 'exercise');
  return {
    enrollmentId: ENROLLMENT_ID,
    templateKey: 'madcow_5x5',
    programName: 'Madcow 5x5',
    dayName,
    position: weekDay(1, day),
    exercises,
  };
}

const MONDAY = dayStart('mon', 'W1 Day 1');
const WEDNESDAY = dayStart('wed', 'W1 Day 2');
const catalog = new Map<string, CatalogEntry>(
  [...MONDAY.exercises, ...WEDNESDAY.exercises].map((slot) => [
    slot.exerciseId,
    { name: slot.lift, loadType: 'external', archived: false },
  ]),
);

function monday(): WorkoutDraft {
  return { ...startDraftFromPrescription(MONDAY, catalog, STARTED_AT).draft, finishedAt: FINISHED_AT };
}

function mondayAndWednesday(): WorkoutDraft {
  const started = startDraftFromPrescription(MONDAY, catalog, STARTED_AT).draft;
  return { ...withSecondDay(started, WEDNESDAY, catalog, SECOND_SESSION_ID).draft, finishedAt: FINISHED_AT };
}

function drop(dropId: string): DropSummary {
  return { dropId, setId: `set-${dropId}`, itemId: 'item-1', itemKey: 'coin', quantity: 1, source: 'regular' };
}

function summaryOfDays(sessionIds: readonly string[], drops: DropSummary[] = []): FinishSummary {
  return {
    sessionId: sessionIds[0],
    xpBySkill: { legs: 100 },
    levelUps: [],
    prs: [],
    drops,
    programLinked: true,
    completedAt: COMPLETED_AT,
    days: sessionIds.map((sessionId) => ({ sessionId, programLinked: true, completedAt: COMPLETED_AT })),
  };
}

function oneDaySummary(sessionId: string): FinishSummary {
  return {
    sessionId,
    xpBySkill: { legs: 100 },
    levelUps: [],
    prs: [],
    drops: [],
    programLinked: true,
    completedAt: COMPLETED_AT,
  };
}

function fakeIo(reply: InvokeOutcome<FinishSummary>) {
  const device = new MemoryStorage();
  const tab = new MemoryStorage();
  saveProgramCache(device, USER_ID, {
    templates: [{ key: 'madcow_5x5', version: 1, name: 'Madcow 5x5', definition: MADCOW_5X5 }],
    enrollment: madcowEnrollmentRow(),
    facts: emptyProgramFactsCache(ENROLLMENT_ID),
  });
  const completeSession = vi.fn<FinishIo['completeSession']>(async () => reply);
  const io: FinishIo = { completeSession, device, tab };
  return { io, device, tab, completeSession };
}

function rememberedFacts(device: Storage): string[] | undefined {
  return readProgramCache(device, USER_ID).facts?.localAppends.map((append) => append.fact.id);
}

const httpError = (status: number, code: string, details?: unknown): InvokeOutcome<FinishSummary> => ({
  kind: 'http_error',
  status,
  code,
  details,
});

async function sentFrom(reply: InvokeOutcome<FinishSummary>) {
  const { io, tab, device } = fakeIo(reply);
  const outcome = await completeFinishedDraft(USER_ID, monday(), io);
  return { outcome, tab, device };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('completing a finished Draft', () => {
  it('sends the Draft as one complete-session request and names each Day of the reply', async () => {
    const draft = mondayAndWednesday();
    const { io, completeSession } = fakeIo({ kind: 'ok', data: summaryOfDays([draft.sessionId, SECOND_SESSION_ID]) });

    const outcome = await completeFinishedDraft(USER_ID, draft, io);

    expect(completeSession).toHaveBeenCalledExactlyOnceWith(completeSessionPayload(draft));
    expect(outcome.kind === 'synced' && outcome.summary.days?.map((day) => day.label)).toEqual([
      'W1 Day 1',
      'W1 Day 2',
    ]);
  });

  it('remembers one outcome that covers the Session of each Day', async () => {
    const draft = mondayAndWednesday();
    const { io, tab } = fakeIo({ kind: 'ok', data: summaryOfDays([draft.sessionId, SECOND_SESSION_ID]) });

    await completeFinishedDraft(USER_ID, draft, io);

    expect(recallFinishOutcome(USER_ID, tab)?.sessionIds).toEqual([draft.sessionId, SECOND_SESSION_ID]);
    expect(finishOutcomeCovers(USER_ID, draft.sessionId, tab)).toBe(true);
    expect(finishOutcomeCovers(USER_ID, SECOND_SESSION_ID, tab)).toBe(true);
    expect(finishOutcomeCovers(USER_ID, 'another-session', tab)).toBe(false);
    expect(finishOutcomeCovers(OTHER_USER_ID, SECOND_SESSION_ID, tab)).toBe(false);
  });

  it('remembers a Program fact for each Day, so the program moves on offline', async () => {
    const draft = mondayAndWednesday();
    const { io, device } = fakeIo({ kind: 'ok', data: summaryOfDays([draft.sessionId, SECOND_SESSION_ID]) });

    await completeFinishedDraft(USER_ID, draft, io);

    expect(rememberedFacts(device)).toEqual([draft.sessionId, SECOND_SESSION_ID]);
  });

  it('covers only the Day the server stored when a retry finds the other Day deleted', async () => {
    const draft = mondayAndWednesday();
    const { io, tab, device } = fakeIo({ kind: 'ok', data: summaryOfDays([SECOND_SESSION_ID]) });

    const outcome = await completeFinishedDraft(USER_ID, draft, io);

    expect(outcome.kind === 'synced' && outcome.summary.days?.map((day) => day.label)).toEqual(['W1 Day 2']);
    expect(recallFinishOutcome(USER_ID, tab)?.sessionIds).toEqual([SECOND_SESSION_ID]);
    expect(finishOutcomeCovers(USER_ID, draft.sessionId, tab)).toBe(false);
    expect(rememberedFacts(device)).toEqual([SECOND_SESSION_ID]);
  });

  it('covers the one Session of a one-Day Draft', async () => {
    const draft = monday();
    const { io, tab, device } = fakeIo({ kind: 'ok', data: oneDaySummary(draft.sessionId) });

    await completeFinishedDraft(USER_ID, draft, io);

    expect(recallFinishOutcome(USER_ID, tab)?.sessionIds).toEqual([draft.sessionId]);
    expect(rememberedFacts(device)).toEqual([draft.sessionId]);
  });

  it('remembers no Program fact from a reply without programLinked or completedAt', async () => {
    const draft = monday();
    const older = { ...oneDaySummary(draft.sessionId), programLinked: undefined, completedAt: undefined };
    const { io, device } = fakeIo({ kind: 'ok', data: older });

    await completeFinishedDraft(USER_ID, draft, io);

    expect(rememberedFacts(device)).toEqual([]);
  });

  it('hands the planned challenge on with the outcome and spends its scroll in the saved items', async () => {
    const plannedChallenge = {
      challengeId: 'challenge-dl',
      name: 'Deadlift and Pull-up',
      definition: { kind: 'volume' as const, metric: 'kg' as const, target: 10000, exerciseId: null, minPct: null },
      targetLoadsKg: {},
    };
    const draft = { ...monday(), challenge: plannedChallenge };
    const reply = {
      ...oneDaySummary(draft.sessionId),
      challenge: {
        challengeId: 'challenge-dl',
        key: 'dl',
        name: 'Deadlift and Pull-up',
        passed: true,
        targetLoadsKg: {},
      },
    };
    const { io, tab, device } = fakeIo({ kind: 'ok', data: reply });
    saveItemsCache(device, USER_ID, ITEMS_WITH_SCROLL);

    const outcome = await completeFinishedDraft(USER_ID, draft, io);

    expect(outcome).toEqual({ kind: 'synced', summary: { ...reply, plannedChallenge } });
    expect(recallFinishOutcome(USER_ID, tab)?.summary.plannedChallenge).toEqual(plannedChallenge);
    expect(readItemsCache(device, USER_ID)?.inventory[0].quantity).toBe(0);
  });

  it('keeps a history-only reply as a successful sync', async () => {
    const draft = monday();
    const historyOnly = { ...oneDaySummary(draft.sessionId), historyOnly: true as const };
    const { io } = fakeIo({ kind: 'ok', data: historyOnly });
    expect(await completeFinishedDraft(USER_ID, draft, io)).toEqual({ kind: 'synced', summary: historyOnly });
  });

  it('remembers nothing for a reply that did not sync', async () => {
    const { outcome, tab, device } = await sentFrom(httpError(410, 'session_deleted'));
    expect(outcome).toEqual({ kind: 'deleted' });
    expect(recallFinishOutcome(USER_ID, tab)).toBeNull();
    expect(rememberedFacts(device)).toEqual([]);
  });

  it('maps complete-session failures to finish outcomes', async () => {
    expect((await sentFrom(httpError(503, 'rebuild_required'))).outcome).toEqual({
      kind: 'retryable',
      reason: 'rebuild_required',
    });
    expect((await sentFrom(httpError(409, 'session_id_conflict'))).outcome).toEqual({
      kind: 'rejected',
      reason: 'session_id_conflict',
    });
    expect((await sentFrom({ kind: 'needs_sign_in' })).outcome).toEqual({ kind: 'needs_sign_in' });
    expect((await sentFrom({ kind: 'retryable', reason: 'offline' })).outcome).toEqual({
      kind: 'retryable',
      reason: 'offline',
    });
  });

  it('marks a server error as a server fault, but not the rebuild gate', async () => {
    expect((await sentFrom(httpError(500, 'internal_error'))).outcome).toEqual({
      kind: 'retryable',
      reason: 'internal_error',
      serverFault: true,
    });
    expect((await sentFrom(httpError(546, 'http_546'))).outcome).toEqual({
      kind: 'retryable',
      reason: 'http_546',
      serverFault: true,
    });
  });

  it('treats a rate limit as transient and waits for Retry-After', async () => {
    const details = { bucket: 'session_create_hour', retryAfterSeconds: 1200 };
    expect((await sentFrom(httpError(429, 'rate_limited', details))).outcome).toEqual({
      kind: 'retryable',
      reason: 'rate_limited',
      retryAfterMs: 1_200_000,
    });
    expect((await sentFrom(httpError(429, 'rate_limited'))).outcome).toEqual({
      kind: 'retryable',
      reason: 'rate_limited',
      retryAfterMs: undefined,
    });
  });

  it('retries a missing function, a timeout or a too-early request instead of rejecting the workout', async () => {
    for (const status of [404, 408, 425])
      expect((await sentFrom(httpError(status, `http_${status}`))).outcome).toEqual({
        kind: 'retryable',
        reason: `http_${status}`,
      });
  });

  it('still rejects the missing profile that complete-session reports as 404', async () => {
    expect((await sentFrom(httpError(404, 'profile_not_found'))).outcome).toEqual({
      kind: 'rejected',
      reason: 'profile_not_found',
    });
  });
});

describe('the loot of a Finish outcome', () => {
  function rememberedTwoDays(drops: DropSummary[] = []) {
    const tab = new MemoryStorage();
    tab.setItem(
      LAST_SUMMARY_KEY,
      JSON.stringify({ userId: USER_ID, summary: summaryOfDays(['session-a', 'session-b'], drops) }),
    );
    return tab;
  }

  it('gathers the loot of every Session the outcome covers and remembers it', async () => {
    const tab = rememberedTwoDays([drop('stale')]);
    const dropsBySession = new Map([
      ['session-a', [drop('a1')]],
      ['session-b', [drop('b1'), drop('b2')]],
    ]);
    const fetchDrops = vi.fn(async (sessionId: string) => dropsBySession.get(sessionId) ?? null);

    const loot = await finishOutcomeLoot(fetchDrops, USER_ID, ['session-a', 'session-b'], tab);

    expect(loot).toEqual([drop('a1'), drop('b1'), drop('b2')]);
    expect(fetchDrops.mock.calls.map(([sessionId]) => sessionId)).toEqual(['session-a', 'session-b']);
    expect(recallFinishOutcome(USER_ID, tab)?.summary.drops).toEqual([drop('a1'), drop('b1'), drop('b2')]);
  });

  it('gives no loot and keeps the remembered drops when a covered Session is gone', async () => {
    const tab = rememberedTwoDays([drop('kept')]);
    const loot = await finishOutcomeLoot(
      async (sessionId) => (sessionId === 'session-a' ? [drop('a1')] : null),
      USER_ID,
      ['session-a', 'session-b'],
      tab,
    );
    expect(loot).toBeNull();
    expect(recallFinishOutcome(USER_ID, tab)?.summary.drops).toEqual([drop('kept')]);
  });

  it('leaves a remembered outcome of another workout alone', async () => {
    const tab = rememberedTwoDays([drop('kept')]);
    const loot = await finishOutcomeLoot(async () => [drop('c1')], USER_ID, ['session-c'], tab);
    expect(loot).toEqual([drop('c1')]);
    expect(recallFinishOutcome(USER_ID, tab)?.summary.drops).toEqual([drop('kept')]);
  });
});

describe('the remembered Finish outcome', () => {
  function remembering(summary: FinishSummary, userId = USER_ID): MemoryStorage {
    const tab = new MemoryStorage();
    tab.setItem(LAST_SUMMARY_KEY, JSON.stringify({ userId, summary }));
    return tab;
  }

  it('reads a summary an earlier build remembered, before Days were labelled', () => {
    const summary = summaryOfDays(['session-a', 'session-b']);
    expect(recallFinishOutcome(USER_ID, remembering(summary))).toEqual({
      summary,
      sessionIds: ['session-a', 'session-b'],
    });
  });

  it('is forgotten when either Day of it is listed, and only then', () => {
    for (const listed of ['session-a', 'session-b']) {
      const tab = remembering(summaryOfDays(['session-a', 'session-b']));
      forgetFinishOutcomeCovering(['session-c'], tab);
      expect(recallFinishOutcome(USER_ID, tab)).not.toBeNull();
      forgetFinishOutcomeCovering(['session-c', listed], tab);
      expect(recallFinishOutcome(USER_ID, tab)).toBeNull();
    }
  });

  it('is forgotten for a listed Session whichever account remembered it', () => {
    const tab = remembering(oneDaySummary('session-a'), OTHER_USER_ID);
    forgetFinishOutcomeCovering(['session-a'], tab);
    expect(recallFinishOutcome(OTHER_USER_ID, tab)).toBeNull();
  });

  it('is recalled for its own account only', () => {
    const tab = remembering(oneDaySummary('session-a'));
    expect(recallFinishOutcome(OTHER_USER_ID, tab)).toBeNull();
    expect(recallFinishOutcome(USER_ID, tab)?.sessionIds).toEqual(['session-a']);
  });

  it('is forgotten on sign-out of its own account only', () => {
    const tab = remembering(oneDaySummary('session-a'));
    forgetFinishOutcomeOf(tab, OTHER_USER_ID);
    expect(recallFinishOutcome(USER_ID, tab)).not.toBeNull();
    forgetFinishOutcomeOf(tab, USER_ID);
    expect(recallFinishOutcome(USER_ID, tab)).toBeNull();
  });

  it('recalls nothing from an entry saved before summaries named their account', () => {
    const tab = new MemoryStorage();
    tab.setItem(LAST_SUMMARY_KEY, JSON.stringify(oneDaySummary('session-a')));
    expect(recallFinishOutcome(USER_ID, tab)).toBeNull();
  });

  it('recalls a malformed planned challenge as null', () => {
    const tab = remembering({ ...oneDaySummary('session-a'), plannedChallenge: { name: 7 } as never });
    expect(recallFinishOutcome(USER_ID, tab)?.summary.plannedChallenge).toBeNull();
  });

  it('recalls nothing when nothing was remembered or the entry is not JSON', () => {
    const tab = new MemoryStorage();
    expect(recallFinishOutcome(USER_ID, tab)).toBeNull();
    tab.setItem(LAST_SUMMARY_KEY, '{broken');
    expect(recallFinishOutcome(USER_ID, tab)).toBeNull();
  });

  it('reads the tab storage when none is given', () => {
    vi.stubGlobal('sessionStorage', remembering(oneDaySummary('session-a')));
    expect(finishOutcomeCovers(USER_ID, 'session-a')).toBe(true);
    forgetFinishOutcomeCovering(['session-a']);
    expect(recallFinishOutcome(USER_ID)).toBeNull();
  });

  it('degrades silently when tab storage throws', async () => {
    const tab = throwingStorage('getItem', 'setItem', 'removeItem');
    const draft = monday();
    const { io } = fakeIo({ kind: 'ok', data: oneDaySummary(draft.sessionId) });
    expect((await completeFinishedDraft(USER_ID, draft, { ...io, tab })).kind).toBe('synced');
    expect(recallFinishOutcome(USER_ID, tab)).toBeNull();
    expect(() => forgetFinishOutcomeCovering(['session-a'], tab)).not.toThrow();
    expect(() => forgetFinishOutcomeOf(tab, USER_ID)).not.toThrow();
    expect(await finishOutcomeLoot(async () => [], USER_ID, ['session-a'], tab)).toEqual([]);
  });
});

const ITEMS_WITH_SCROLL: ItemsCache = {
  catalog: {
    items: [
      {
        id: 'scroll-1',
        key: 'scroll_deficit_deadlift',
        name: 'Scroll: Deadlift and Pull-up',
        kind: 'scroll',
        rarity: 'rare',
        tier: null,
        gearSlot: null,
        icon: 'scroll',
        description: 'A challenge.',
        grantsChallengeId: 'challenge-dl',
        sortOrder: 1,
      },
    ],
    recipes: [],
    challenges: [],
  },
  inventory: [{ itemId: 'scroll-1', quantity: 1, firstObtainedAt: '2026-10-01T10:00:00.000Z' }],
  strength: {},
  strengthAsOf: '2026-10-08T09:00:00.000Z',
  challengeExercises: [],
  dryRolls: 2,
};
