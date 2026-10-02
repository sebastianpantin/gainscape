import { describe, expect, it } from 'vitest';
import {
  adjustRest,
  DEFAULT_REST_S,
  parseRestState,
  REST_OVER_SHOWN_S,
  REST_STEP_S,
  restClock,
  restView,
  startRest,
  startsRest,
} from '../../web/src/lib/rest-timer-rules.ts';
import { readRestState, saveRestState } from '../../web/src/lib/rest-timer-store.ts';
import { MemoryStorage } from './memory-storage.ts';

const now = Date.UTC(2026, 9, 2, 18, 0, 0);
const seconds = (count: number) => count * 1000;
const setId = 'set-1';
const hard = { type: 'level', level: 'hard' } as const;
const nearFailure = { type: 'level', level: 'near_failure' } as const;

describe('rest timer', () => {
  it('starts a rest that ends after the chosen seconds', () => {
    expect(startRest(now, 90, setId)).toEqual({ endsAt: now + seconds(90), setId });
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
    expect(adjustRest(timer, REST_STEP_S, now + seconds(30))).toEqual({ endsAt: now + seconds(105), setId });
    expect(adjustRest(timer, -REST_STEP_S, now + seconds(30))).toEqual({ endsAt: now + seconds(75), setId });
  });

  it('ends the rest instead of going below zero', () => {
    const timer = startRest(now, 90, setId);
    expect(adjustRest(timer, -REST_STEP_S, now + seconds(80))).toEqual({ endsAt: now + seconds(80), setId });
  });

  it('restarts an over rest from now when time is added', () => {
    const timer = startRest(now, 60, setId);
    expect(adjustRest(timer, REST_STEP_S, now + seconds(100))).toEqual({ endsAt: now + seconds(115), setId });
  });

  it('treats a stored rest further away than ten minutes as idle', () => {
    expect(restView({ endsAt: now + seconds(600), setId }, now)).toEqual({ kind: 'resting', remainingS: 600 });
    expect(restView({ endsAt: now + seconds(600) + 1, setId }, now)).toEqual({ kind: 'idle' });
  });

  it('never runs longer than ten minutes from now', () => {
    const timer = startRest(now, 600, setId);
    expect(adjustRest(timer, REST_STEP_S, now)).toEqual({ endsAt: now + seconds(600), setId });
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

  it('keeps the rest the same set already started when it is rated', () => {
    const logged = { id: setId, done: true, effort: null };
    const adjusted = adjustRest(startRest(now, 90, setId), REST_STEP_S, now);
    expect(startsRest(logged, { effort: hard, done: true }, adjusted)).toBe(false);
  });
});

describe('stored rest state', () => {
  it('defaults to a 90 second rest and no running timer', () => {
    expect(DEFAULT_REST_S).toBe(90);
    expect(parseRestState(null)).toEqual({ restS: DEFAULT_REST_S, timer: null });
    expect(parseRestState('not json')).toEqual({ restS: DEFAULT_REST_S, timer: null });
    expect(parseRestState('[]')).toEqual({ restS: DEFAULT_REST_S, timer: null });
  });

  it('reads the chosen rest, including off, and a running timer', () => {
    expect(parseRestState(JSON.stringify({ restS: 180, timer: { endsAt: now, setId } }))).toEqual({
      restS: 180,
      timer: { endsAt: now, setId },
    });
    expect(parseRestState(JSON.stringify({ restS: 180, timer: { endsAt: now } }))).toEqual({
      restS: 180,
      timer: { endsAt: now, setId: null },
    });
    expect(parseRestState(JSON.stringify({ restS: 0, timer: null }))).toEqual({ restS: 0, timer: null });
  });

  it('falls back field by field on values it does not offer', () => {
    expect(parseRestState(JSON.stringify({ restS: 45, timer: { endsAt: 'soon' } }))).toEqual({
      restS: DEFAULT_REST_S,
      timer: null,
    });
    expect(parseRestState(JSON.stringify({ restS: 120, timer: { endsAt: null } }))).toEqual({
      restS: 120,
      timer: null,
    });
  });
});

describe('rest state on this device', () => {
  const userId = '11111111-1111-4111-8111-111111111111';

  it('saves and reads the rest state of one user', () => {
    const storage = new MemoryStorage();
    saveRestState(storage, userId, { restS: 120, timer: { endsAt: now, setId } });
    expect(readRestState(storage, userId)).toEqual({ restS: 120, timer: { endsAt: now, setId } });
    expect(readRestState(storage, '22222222-2222-4222-8222-222222222222')).toEqual({
      restS: DEFAULT_REST_S,
      timer: null,
    });
  });

  it('reads defaults and saves nothing without storage', () => {
    expect(readRestState(null, userId)).toEqual({ restS: DEFAULT_REST_S, timer: null });
    expect(() => saveRestState(null, userId, { restS: 60, timer: null })).not.toThrow();
  });

  it('keeps working when storage throws', () => {
    const broken = new MemoryStorage();
    broken.getItem = () => {
      throw new Error('blocked');
    };
    broken.setItem = () => {
      throw new Error('blocked');
    };
    expect(() => saveRestState(broken, userId, { restS: 60, timer: null })).not.toThrow();
    expect(readRestState(broken, userId)).toEqual({ restS: DEFAULT_REST_S, timer: null });
  });
});
