import { describe, expect, it } from 'vitest';
import { activeWorkoutBar, elapsedClock } from '../../web/src/lib/active-workout-bar-rules.ts';
import { startRest } from '../../web/src/lib/rest-timer-rules.ts';

const startedAt = '2026-10-12T10:00:00.000Z';
const started = Date.parse(startedAt);
const seconds = (count: number) => count * 1000;
const openDraft = { startedAt, finishedAt: null };
const finishedDraft = { startedAt, finishedAt: '2026-10-12T10:40:00.000Z' };

describe('elapsedClock', () => {
  it('shows minutes and seconds under an hour', () => {
    expect(elapsedClock(0)).toBe('0:00');
    expect(elapsedClock(seconds(750))).toBe('12:30');
    expect(elapsedClock(seconds(3599))).toBe('59:59');
  });

  it('adds hours from the first hour on', () => {
    expect(elapsedClock(seconds(3600))).toBe('1:00:00');
    expect(elapsedClock(seconds(3600 + 125))).toBe('1:02:05');
  });

  it('counts whole seconds and never goes below zero', () => {
    expect(elapsedClock(999)).toBe('0:00');
    expect(elapsedClock(-seconds(30))).toBe('0:00');
  });
});

describe('activeWorkoutBar', () => {
  const now = started + seconds(750);

  it('stays hidden without a draft', () => {
    expect(activeWorkoutBar({ pathname: '/skills', draft: null, restTimer: null, now })).toBeNull();
  });

  it('stays hidden on the workout and reveal screens', () => {
    expect(activeWorkoutBar({ pathname: '/', draft: openDraft, restTimer: null, now })).toBeNull();
    expect(activeWorkoutBar({ pathname: '/reveal', draft: openDraft, restTimer: null, now })).toBeNull();
  });

  it('shows the elapsed time of an open workout on every other screen', () => {
    for (const pathname of ['/skills', '/collection/history/abc', '/profile/settings', '/friends'])
      expect(activeWorkoutBar({ pathname, draft: openDraft, restTimer: null, now })).toEqual({
        kind: 'in-progress',
        elapsed: '12:30',
        rest: null,
        name: 'Back to workout, 12:30 elapsed',
      });
  });

  it('counts the rest down while it runs', () => {
    const restTimer = startRest(now - seconds(45), 90, 'set-1');
    expect(activeWorkoutBar({ pathname: '/skills', draft: openDraft, restTimer, now })).toEqual({
      kind: 'in-progress',
      elapsed: '12:30',
      rest: 'Rest 0:45',
      name: 'Back to workout, 12:30 elapsed, rest 0:45 left',
    });
  });

  it('counts up once the rest is over, until the rest timer drops it', () => {
    const restTimer = startRest(now - seconds(102), 90, 'set-1');
    expect(activeWorkoutBar({ pathname: '/skills', draft: openDraft, restTimer, now })).toMatchObject({
      rest: 'Rest over +0:12',
      name: 'Back to workout, 12:30 elapsed, rest over 0:12 ago',
    });
    const longOver = startRest(now - seconds(90 + 301), 90, 'set-1');
    expect(activeWorkoutBar({ pathname: '/skills', draft: openDraft, restTimer: longOver, now })).toMatchObject({
      rest: null,
    });
  });

  it('asks to go back when a finished workout is not saved yet', () => {
    const restTimer = startRest(now - seconds(10), 90, 'set-1');
    expect(activeWorkoutBar({ pathname: '/skills', draft: finishedDraft, restTimer, now })).toEqual({
      kind: 'unsaved',
      name: 'Back to workout, not saved yet',
    });
    expect(activeWorkoutBar({ pathname: '/', draft: finishedDraft, restTimer, now })).toBeNull();
  });
});
