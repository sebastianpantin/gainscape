import { describe, expect, it } from 'vitest';
import {
  adjustRest,
  COMPOUND_REST_S,
  DEFAULT_REST_S,
  parseRestState,
  rememberAdjustedRest,
  REST_OFF,
  REST_OVER_SHOWN_S,
  REST_STEP_S,
  restClock,
  restLengthFor,
  restView,
  withChosenRest,
  startRest,
  startsRest,
  stopsRestForWarmup,
} from '../../web/src/lib/rest-timer-rules.ts';
import { readRestState, saveRestState } from '../../web/src/lib/rest-timer-store.ts';
import { MemoryStorage } from './memory-storage.ts';

const now = Date.UTC(2026, 9, 2, 18, 0, 0);
const seconds = (count: number) => count * 1000;
const setId = 'set-1';
const benchId = 'bench';
const curlId = 'curl';
const hard = { type: 'level', level: 'hard' } as const;
const nearFailure = { type: 'level', level: 'near_failure' } as const;

describe('rest timer', () => {
  it('starts a rest that ends after the chosen seconds', () => {
    expect(startRest(now, 90, setId)).toEqual({ endsAt: now + seconds(90), setId, exerciseId: null, startedAt: now });
  });

  it('counts down whole seconds, rounding up', () => {
    const timer = startRest(now, 90, setId);
    expect(restView(timer, now)).toEqual({ kind: 'resting', remainingS: 90 });
    expect(restView(timer, now + 500)).toEqual({ kind: 'resting', remainingS: 90 });
    expect(restView(timer, now + seconds(89) + 1)).toEqual({ kind: 'resting', remainingS: 1 });
  });

  it('shows the rest as over for a while, then hides it', () => {
    const timer = startRest(now, 60, setId);
    expect(restView(timer, now + seconds(60))).toEqual({ kind: 'over' });
    expect(restView(timer, now + seconds(60 + REST_OVER_SHOWN_S) - 1)).toEqual({ kind: 'over' });
    expect(restView(timer, now + seconds(60 + REST_OVER_SHOWN_S))).toEqual({ kind: 'idle' });
    expect(restView(null, now)).toEqual({ kind: 'idle' });
  });

  it('adds and removes time from a running rest', () => {
    const timer = startRest(now, 90, setId);
    expect(adjustRest(timer, REST_STEP_S, now + seconds(30))).toEqual({
      endsAt: now + seconds(105),
      setId,
      exerciseId: null,
      startedAt: now,
    });
    expect(adjustRest(timer, -REST_STEP_S, now + seconds(30))).toEqual({
      endsAt: now + seconds(75),
      setId,
      exerciseId: null,
      startedAt: now,
    });
  });

  it('ends the rest instead of going below zero', () => {
    const timer = startRest(now, 90, setId);
    expect(adjustRest(timer, -REST_STEP_S, now + seconds(80))).toEqual({
      endsAt: now + seconds(80),
      setId,
      exerciseId: null,
      startedAt: now,
    });
  });

  it('restarts an over rest from now when time is added', () => {
    const timer = startRest(now, 60, setId);
    expect(adjustRest(timer, REST_STEP_S, now + seconds(100))).toEqual({
      endsAt: now + seconds(115),
      setId,
      exerciseId: null,
      startedAt: null,
    });
  });

  it('treats a stored rest further away than ten minutes as idle', () => {
    expect(restView({ ...startRest(now, 600, setId) }, now)).toEqual({ kind: 'resting', remainingS: 600 });
    expect(restView({ ...startRest(now, 600, setId), endsAt: now + seconds(600) + 1 }, now)).toEqual({ kind: 'idle' });
  });

  it('never runs longer than ten minutes from now', () => {
    const timer = startRest(now, 600, setId);
    expect(adjustRest(timer, REST_STEP_S, now)).toEqual({
      endsAt: now + seconds(600),
      setId,
      exerciseId: null,
      startedAt: now,
    });
  });

  it('formats the remaining time as minutes and seconds', () => {
    expect(restClock(90)).toBe('1:30');
    expect(restClock(60)).toBe('1:00');
    expect(restClock(5)).toBe('0:05');
    expect(restClock(600)).toBe('10:00');
  });

  it('starts when a set goes from not done to done', () => {
    const planned = { id: setId, done: false, effort: null };
    expect(startsRest(planned, { done: true }, null)).toBe(true);
    expect(startsRest(planned, { done: true }, startRest(now, 90, setId))).toBe(true);
    expect(startsRest({ ...planned, done: true }, { done: true }, null)).toBe(false);
    expect(startsRest({ ...planned, done: true }, { done: false }, null)).toBe(false);
    expect(startsRest(planned, {}, null)).toBe(false);
  });

  it('starts when a done set gets its first effort rating', () => {
    const logged = { id: setId, done: true, effort: null };
    expect(startsRest(logged, { effort: hard, done: true }, null)).toBe(true);
    expect(startsRest(logged, { effort: hard, done: true }, startRest(now, 90, 'set-0'))).toBe(true);
    expect(startsRest({ ...logged, effort: hard }, { effort: nearFailure, done: true }, null)).toBe(false);
    expect(startsRest({ ...logged, effort: hard }, { effort: null }, null)).toBe(false);
  });

  it('never starts for a warm-up set', () => {
    const warmup = { id: setId, done: false, effort: null, isWarmup: true };
    expect(startsRest(warmup, { done: true }, null)).toBe(false);
    expect(startsRest({ ...warmup, done: true }, { effort: hard, done: true }, null)).toBe(false);
    expect(startsRest({ ...warmup, isWarmup: false }, { done: true }, null)).toBe(true);
  });

  it('stops the rest a set started when that set becomes a warm-up', () => {
    const logged = { id: setId, isWarmup: false };
    expect(stopsRestForWarmup(logged, { isWarmup: true }, startRest(now, 90, setId))).toBe(true);
    expect(stopsRestForWarmup(logged, { isWarmup: true }, startRest(now, 90, 'set-0'))).toBe(false);
    expect(stopsRestForWarmup(logged, { isWarmup: true }, null)).toBe(false);
    expect(stopsRestForWarmup(logged, {}, startRest(now, 90, setId))).toBe(false);
    expect(stopsRestForWarmup({ ...logged, isWarmup: true }, { isWarmup: false }, startRest(now, 90, setId))).toBe(
      false,
    );
  });

  it('keeps the rest the same set already started when it is rated', () => {
    const logged = { id: setId, done: true, effort: null };
    const adjusted = adjustRest(startRest(now, 90, setId), REST_STEP_S, now);
    expect(startsRest(logged, { effort: hard, done: true }, adjusted)).toBe(false);
  });
});

describe('rest per exercise', () => {
  const settings = { restS: DEFAULT_REST_S, timer: null, byExercise: {} };

  it('rests compound lifts for at least three minutes and other lifts for the chosen rest', () => {
    expect(COMPOUND_REST_S).toBe(180);
    expect(restLengthFor(settings, benchId, true)).toBe(180);
    expect(restLengthFor(settings, curlId, false)).toBe(90);
    expect(restLengthFor({ ...settings, restS: 240 }, benchId, true)).toBe(240);
  });

  it('uses the rest remembered for an exercise over the defaults', () => {
    const remembered = { ...settings, byExercise: { [benchId]: 150, [curlId]: 45 } };
    expect(restLengthFor(remembered, benchId, true)).toBe(150);
    expect(restLengthFor(remembered, curlId, false)).toBe(45);
  });

  it('never rests when the rest timer is off, even with a remembered rest', () => {
    expect(restLengthFor({ ...settings, restS: REST_OFF, byExercise: { [benchId]: 150 } }, benchId, true)).toBe(
      REST_OFF,
    );
  });

  it('starts a rest that knows its exercise and start time', () => {
    expect(startRest(now, 180, setId, benchId)).toEqual({
      endsAt: now + seconds(180),
      setId,
      exerciseId: benchId,
      startedAt: now,
    });
  });

  it('remembers the length of an adjusted rest for its exercise', () => {
    const adjusted = adjustRest(startRest(now, 180, setId, benchId), REST_STEP_S, now + seconds(30));
    expect(rememberAdjustedRest(settings, adjusted).byExercise).toEqual({ [benchId]: 195 });
    const shortened = adjustRest(startRest(now, 90, setId, curlId), -REST_STEP_S, now + seconds(10));
    expect(rememberAdjustedRest(settings, shortened).byExercise).toEqual({ [curlId]: 75 });
  });

  it('remembers at least one step and at most ten minutes', () => {
    const endedEarly = adjustRest(startRest(now, 15, setId, curlId), -REST_STEP_S, now + seconds(2));
    expect(rememberAdjustedRest(settings, endedEarly).byExercise).toEqual({ [curlId]: REST_STEP_S });
    const longest = adjustRest(startRest(now, 600, setId, benchId), REST_STEP_S, now);
    expect(rememberAdjustedRest(settings, longest).byExercise).toEqual({ [benchId]: 600 });
  });

  it('remembers nothing once time is added to a rest that is already over', () => {
    const over = adjustRest(startRest(now, 90, setId, curlId), REST_STEP_S, now + seconds(330));
    expect(over.endsAt).toBe(now + seconds(345));
    expect(rememberAdjustedRest(settings, over)).toBe(settings);
    expect(rememberAdjustedRest(settings, adjustRest(over, REST_STEP_S, now + seconds(331)))).toBe(settings);
  });

  it('forgets the remembered rests when a rest is chosen in settings', () => {
    const remembered = { restS: 90, timer: startRest(now, 90, setId, curlId), byExercise: { [benchId]: 150 } };
    expect(withChosenRest(remembered, 120)).toEqual({ ...remembered, restS: 120, byExercise: {} });
  });

  it('remembers nothing for a rest without an exercise or start time', () => {
    expect(rememberAdjustedRest(settings, startRest(now, 90, setId))).toBe(settings);
    const parsed = parseRestState(JSON.stringify({ timer: { endsAt: now, setId, exerciseId: benchId } }));
    expect(parsed.timer && rememberAdjustedRest(settings, parsed.timer)).toBe(settings);
  });

  it('reads remembered rests and drops the ones it does not offer', () => {
    const stored = { restS: 90, timer: null, byExercise: { [benchId]: 195, [curlId]: 50, row: 900, press: 'long' } };
    expect(parseRestState(JSON.stringify(stored)).byExercise).toEqual({ [benchId]: 195 });
    expect(parseRestState(JSON.stringify({ restS: 90, byExercise: [] })).byExercise).toEqual({});
  });
});

describe('stored rest state', () => {
  it('defaults to a 90 second rest and no running timer', () => {
    expect(DEFAULT_REST_S).toBe(90);
    expect(parseRestState(null)).toEqual({ restS: DEFAULT_REST_S, timer: null, byExercise: {} });
    expect(parseRestState('not json')).toEqual({ restS: DEFAULT_REST_S, timer: null, byExercise: {} });
    expect(parseRestState('[]')).toEqual({ restS: DEFAULT_REST_S, timer: null, byExercise: {} });
  });

  it('reads the chosen rest, including off, and a running timer', () => {
    expect(parseRestState(JSON.stringify({ restS: 180, timer: { endsAt: now, setId } }))).toEqual({
      restS: 180,
      timer: { endsAt: now, setId, exerciseId: null, startedAt: null },
      byExercise: {},
    });
    expect(parseRestState(JSON.stringify({ restS: 180, timer: { endsAt: now } }))).toEqual({
      restS: 180,
      timer: { endsAt: now, setId: null, exerciseId: null, startedAt: null },
      byExercise: {},
    });
    expect(parseRestState(JSON.stringify({ restS: 0, timer: null }))).toEqual({
      restS: 0,
      timer: null,
      byExercise: {},
    });
  });

  it('falls back field by field on values it does not offer', () => {
    expect(parseRestState(JSON.stringify({ restS: 45, timer: { endsAt: 'soon' } }))).toEqual({
      restS: DEFAULT_REST_S,
      timer: null,
      byExercise: {},
    });
    expect(parseRestState(JSON.stringify({ restS: 120, timer: { endsAt: null } }))).toEqual({
      restS: 120,
      timer: null,
      byExercise: {},
    });
  });
});

describe('rest state on this device', () => {
  const userId = '11111111-1111-4111-8111-111111111111';

  it('saves and reads the rest state of one user', () => {
    const storage = new MemoryStorage();
    const state = { restS: 120, timer: startRest(now, 120, setId, benchId), byExercise: { [benchId]: 195 } };
    saveRestState(storage, userId, state);
    expect(readRestState(storage, userId)).toEqual(state);
    expect(readRestState(storage, '22222222-2222-4222-8222-222222222222')).toEqual({
      restS: DEFAULT_REST_S,
      timer: null,
      byExercise: {},
    });
  });

  it('reads defaults and saves nothing without storage', () => {
    expect(readRestState(null, userId)).toEqual({ restS: DEFAULT_REST_S, timer: null, byExercise: {} });
    expect(() => saveRestState(null, userId, { restS: 60, timer: null, byExercise: {} })).not.toThrow();
  });

  it('keeps working when storage throws', () => {
    const broken = new MemoryStorage();
    broken.getItem = () => {
      throw new Error('blocked');
    };
    broken.setItem = () => {
      throw new Error('blocked');
    };
    expect(() => saveRestState(broken, userId, { restS: 60, timer: null, byExercise: {} })).not.toThrow();
    expect(readRestState(broken, userId)).toEqual({ restS: DEFAULT_REST_S, timer: null, byExercise: {} });
  });
});
