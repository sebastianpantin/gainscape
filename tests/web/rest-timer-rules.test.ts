import { describe, expect, it } from 'vitest';
import {
  adjustRest,
  DEFAULT_REST_S,
  finishesSet,
  parseRestState,
  REST_OVER_SHOWN_S,
  REST_STEP_S,
  restClock,
  restView,
  startRest,
} from '../../web/src/lib/rest-timer-rules.ts';
import { readRestState, saveRestState } from '../../web/src/lib/rest-timer-store.ts';
import { MemoryStorage } from './memory-storage.ts';

const now = Date.UTC(2026, 9, 2, 18, 0, 0);
const seconds = (count: number) => count * 1000;
const hard = { type: 'level', level: 'hard' } as const;
const nearFailure = { type: 'level', level: 'near_failure' } as const;

describe('rest timer', () => {
  it('starts a rest that ends after the chosen seconds', () => {
    expect(startRest(now, 90)).toEqual({ endsAt: now + seconds(90) });
  });

  it('counts down whole seconds, rounding up', () => {
    const timer = startRest(now, 90);
    expect(restView(timer, now)).toEqual({ kind: 'resting', remainingS: 90 });
    expect(restView(timer, now + 500)).toEqual({ kind: 'resting', remainingS: 90 });
    expect(restView(timer, now + seconds(89) + 1)).toEqual({ kind: 'resting', remainingS: 1 });
  });

  it('shows the rest as over for a while, then hides it', () => {
    const timer = startRest(now, 60);
    expect(restView(timer, now + seconds(60))).toEqual({ kind: 'over' });
    expect(restView(timer, now + seconds(60 + REST_OVER_SHOWN_S) - 1)).toEqual({ kind: 'over' });
    expect(restView(timer, now + seconds(60 + REST_OVER_SHOWN_S))).toEqual({ kind: 'idle' });
    expect(restView(null, now)).toEqual({ kind: 'idle' });
  });

  it('adds and removes time from a running rest', () => {
    const timer = startRest(now, 90);
    expect(adjustRest(timer, REST_STEP_S, now + seconds(30))).toEqual({ endsAt: now + seconds(105) });
    expect(adjustRest(timer, -REST_STEP_S, now + seconds(30))).toEqual({ endsAt: now + seconds(75) });
  });

  it('ends the rest instead of going below zero', () => {
    const timer = startRest(now, 90);
    expect(adjustRest(timer, -REST_STEP_S, now + seconds(80))).toEqual({ endsAt: now + seconds(80) });
  });

  it('restarts an over rest from now when time is added', () => {
    const timer = startRest(now, 60);
    expect(adjustRest(timer, REST_STEP_S, now + seconds(100))).toEqual({ endsAt: now + seconds(115) });
  });

  it('treats a stored rest further away than ten minutes as idle', () => {
    expect(restView({ endsAt: now + seconds(600) }, now)).toEqual({ kind: 'resting', remainingS: 600 });
    expect(restView({ endsAt: now + seconds(600) + 1 }, now)).toEqual({ kind: 'idle' });
  });

  it('never runs longer than ten minutes from now', () => {
    const timer = startRest(now, 600);
    expect(adjustRest(timer, REST_STEP_S, now)).toEqual({ endsAt: now + seconds(600) });
  });

  it('formats the remaining time as minutes and seconds', () => {
    expect(restClock(90)).toBe('1:30');
    expect(restClock(60)).toBe('1:00');
    expect(restClock(5)).toBe('0:05');
    expect(restClock(600)).toBe('10:00');
  });

  it('starts when a set goes from not done to done', () => {
    expect(finishesSet({ done: false, effort: null }, { done: true })).toBe(true);
    expect(finishesSet({ done: true, effort: null }, { done: true })).toBe(false);
    expect(finishesSet({ done: true, effort: null }, { done: false })).toBe(false);
    expect(finishesSet({ done: false, effort: null }, {})).toBe(false);
  });

  it('starts when a done set gets its first effort rating', () => {
    expect(finishesSet({ done: true, effort: null }, { effort: hard, done: true })).toBe(true);
    expect(finishesSet({ done: true, effort: hard }, { effort: nearFailure, done: true })).toBe(false);
    expect(finishesSet({ done: true, effort: hard }, { effort: null })).toBe(false);
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
    expect(parseRestState(JSON.stringify({ restS: 180, timer: { endsAt: now } }))).toEqual({
      restS: 180,
      timer: { endsAt: now },
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
    saveRestState(storage, userId, { restS: 120, timer: { endsAt: now } });
    expect(readRestState(storage, userId)).toEqual({ restS: 120, timer: { endsAt: now } });
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
