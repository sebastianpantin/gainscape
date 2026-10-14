import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  IMPROVEMENT_RATIO,
  plateauAdvice,
  plateauOf,
  type PlateauSession,
  STALE_DAYS,
  STALL_DAYS,
  STALL_SESSIONS,
} from '../../web/src/lib/progress/plateau-rules.ts';

const DAY_MS = 86_400_000;
const NOW = Date.parse('2026-10-14T12:00:00Z');

function daysAgo(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString();
}

function series(values: readonly (number | null)[], spanDays: number, endDaysAgo = 1): PlateauSession[] {
  const gap = values.length > 1 ? spanDays / (values.length - 1) : 0;
  return values.map((value, index) => ({
    startedAt: daysAgo(endDaysAgo + (values.length - 1 - index) * gap),
    value,
    programDriven: false,
  }));
}

const FLAT = [100, 100, 100, 100, 100];

describe('plateau constants', () => {
  it('calls a lift stalled after 4 sessions and 21 days without a 0.5% gain, trained within 28 days', () => {
    expect([STALL_SESSIONS, STALL_DAYS, STALE_DAYS, IMPROVEMENT_RATIO]).toEqual([4, 21, 28, 1.005]);
  });
});

describe('plateauOf', () => {
  it('flags 5 flat sessions over 28 days ending yesterday, 4 sessions since the last gain', () => {
    expect(plateauOf(series(FLAT, 28), NOW)).toEqual({ sinceStartedAt: daysAgo(29), sessionsSince: 4 });
  });

  it('waits 21 days: the same series over 14 days is not stalled yet', () => {
    expect(plateauOf(series(FLAT, 14), NOW)).toBeNull();
  });

  it('leaves alone a lift last trained more than 28 days ago', () => {
    expect(plateauOf(series(FLAT, 28, 30), NOW)).toBeNull();
  });

  it('leaves alone a lift whose latest session a program drove', () => {
    const sessions = series(FLAT, 28);
    sessions[sessions.length - 1] = { ...sessions[sessions.length - 1], programDriven: true };
    expect(plateauOf(sessions, NOW)).toBeNull();
  });

  it('only the latest session decides about the program: earlier program sessions still count', () => {
    const sessions = series(FLAT, 28).map((session, index) => ({ ...session, programDriven: index < 2 }));
    expect(plateauOf(sessions, NOW)).toEqual({ sinceStartedAt: daysAgo(29), sessionsSince: 4 });
  });

  it('restarts the count at a session 0.6% above the last gain', () => {
    expect(plateauOf(series([100, 100, 100.6, 100, 100], 28), NOW)).toBeNull();
  });

  it('does not count a 0.4% session as a gain', () => {
    expect(plateauOf(series([100, 100.4, 100.4, 100.4, 100.4], 28), NOW)).toEqual({
      sinceStartedAt: daysAgo(29),
      sessionsSince: 4,
    });
  });

  it('registers a slow grind of +0.4% a session as a gain on the second step', () => {
    expect(plateauOf(series([100, 100.4, 100.8, 100.8, 100.8, 100.8, 100.8], 36), NOW)).toEqual({
      sinceStartedAt: daysAgo(25),
      sessionsSince: 4,
    });
  });

  it('is never stalled with fewer than 5 sessions', () => {
    expect(plateauOf(series([100, 100, 100, 100], 28), NOW)).toBeNull();
    expect(plateauOf([], NOW)).toBeNull();
  });

  it('is not stalled when no session has a value', () => {
    expect(plateauOf(series([null, null, null, null, null], 28), NOW)).toBeNull();
  });

  it('counts sessions without a value toward the sessions since the last gain', () => {
    expect(plateauOf(series([100, null, null, 100, null], 28), NOW)).toEqual({
      sinceStartedAt: daysAgo(29),
      sessionsSince: 4,
    });
  });
});

describe('plateauOf properties', () => {
  const sessionsArbitrary = fc
    .uniqueArray(fc.integer({ min: 0, max: 60 * 24 }), { minLength: 1, maxLength: 20 })
    .chain((hoursBack) =>
      fc.tuple(
        fc.constant(hoursBack),
        fc.array(fc.option(fc.integer({ min: 20, max: 300 }), { nil: null }), {
          minLength: hoursBack.length,
          maxLength: hoursBack.length,
        }),
      ),
    )
    .map(([hoursBack, values]) =>
      hoursBack.map((hours, index) => ({
        startedAt: new Date(NOW - hours * 3_600_000 * 2).toISOString(),
        value: values[index],
        programDriven: false,
      })),
    );

  it('never flags a series that rises at least 0.5% every session', () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 15 }), fc.integer({ min: 21, max: 60 }), (count, span) => {
        const values = Array.from({ length: count }, (_, index) => 100 * 1.0051 ** index);
        expect(plateauOf(series(values, span), NOW)).toBeNull();
      }),
    );
  });

  it('does not depend on the order sessions arrive in', () => {
    fc.assert(
      fc.property(
        sessionsArbitrary,
        fc.infiniteStream(fc.double({ min: 0, max: 1, noNaN: true })),
        (sessions, keys) => {
          const shuffled = sessions
            .map((session) => ({ session, key: keys.next().value as number }))
            .sort((a, b) => a.key - b.key)
            .map(({ session }) => session);
          expect(plateauOf(shuffled, NOW)).toEqual(plateauOf(sessions, NOW));
        },
      ),
    );
  });

  it('does not depend on the scale of the values', () => {
    fc.assert(
      fc.property(sessionsArbitrary, fc.constantFrom(0.25, 0.5, 2, 4, 8), (sessions, factor) => {
        const scaled = sessions.map((session) => ({
          ...session,
          value: session.value === null ? null : session.value * factor,
        }));
        expect(plateauOf(scaled, NOW)).toEqual(plateauOf(sessions, NOW));
      }),
    );
  });

  it('clears once a newer session beats every earlier value by more than 0.5%', () => {
    fc.assert(
      fc.property(sessionsArbitrary, (sessions) => {
        const best = Math.max(1, ...sessions.flatMap((session) => (session.value === null ? [] : [session.value])));
        const beaten = [
          ...sessions,
          { startedAt: new Date(NOW).toISOString(), value: best * 1.01, programDriven: false },
        ];
        expect(plateauOf(beaten, NOW)).toBeNull();
      }),
    );
  });

  it('clears once the latest session is program-driven', () => {
    fc.assert(
      fc.property(sessionsArbitrary, (sessions) => {
        const latest = sessions.reduce((a, b) => (Date.parse(a.startedAt) >= Date.parse(b.startedAt) ? a : b));
        const marked = sessions.map((session) => (session === latest ? { ...session, programDriven: true } : session));
        expect(plateauOf(marked, NOW)).toBeNull();
      }),
    );
  });
});

describe('plateauAdvice', () => {
  it('suggests a deload week at about 90% of the recent top set, rounded to the load step', () => {
    const [deload] = plateauAdvice({ loadType: 'external', unit: 'kg', recentTopSetKg: 100, typicalReps: 5 });
    expect(deload).toContain('about 90 kg');
    const [roughDeload] = plateauAdvice({
      loadType: 'external',
      unit: 'kg',
      recentTopSetKg: 87.5,
      typicalReps: 5,
    });
    expect(roughDeload).toContain('about 80 kg');
  });

  it('rounds the deload in pounds to the 5 lb step', () => {
    const [deload] = plateauAdvice({
      loadType: 'external',
      unit: 'lb',
      recentTopSetKg: 102.06,
      typicalReps: 5,
    });
    expect(deload).toContain('about 205 lb');
  });

  it('writes a weighted bodyweight deload as added load', () => {
    const [deload] = plateauAdvice({
      loadType: 'bodyweight_plus',
      unit: 'kg',
      recentTopSetKg: 20,
      typicalReps: 6,
    });
    expect(deload).toContain('about +17.5 kg');
  });

  it('cuts reps rather than load for a bodyweight lift', () => {
    const [deload] = plateauAdvice({ loadType: 'bodyweight', unit: 'kg', recentTopSetKg: 0, typicalReps: 12 });
    expect(deload).toContain('cut about 10% of your reps for a week');
    expect(deload).not.toContain('kg');
  });

  it('moves low reps up to 8 to 10 and higher reps down to 4 to 6', () => {
    const input = { loadType: 'external' as const, unit: 'kg' as const, recentTopSetKg: 100 };
    expect(plateauAdvice({ ...input, typicalReps: 5 })[1]).toContain('sets of 8 to 10');
    expect(plateauAdvice({ ...input, typicalReps: 8 })[1]).toContain('sets of 4 to 6');
  });

  it('ends with a close variation for a few weeks', () => {
    const advice = plateauAdvice({ loadType: 'external', unit: 'kg', recentTopSetKg: 100, typicalReps: 5 });
    expect(advice).toHaveLength(3);
    expect(advice[2]).toContain('close variation for a few weeks');
  });
});
