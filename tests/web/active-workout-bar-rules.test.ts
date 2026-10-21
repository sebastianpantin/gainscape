import { describe, expect, it } from 'vitest';
import { activeWorkoutBar, elapsedClock, workoutClock } from '../../web/src/lib/workout/active-workout-bar-rules.ts';
import { startRest } from '../../web/src/lib/workout/rest-timer-rules.ts';
import { MAX_SESSION_DURATION_MS } from '@domain/session-timing.ts';

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

describe('workoutClock', () => {
  it('counts an open workout up to now, naming it in minutes', () => {
    expect(workoutClock(openDraft, started + seconds(23 * 60 + 41))).toEqual({
      text: '23:41',
      name: 'Elapsed 23 minutes',
      ticking: true,
    });
    expect(workoutClock(openDraft, started + seconds(65))).toMatchObject({ text: '1:05', name: 'Elapsed 1 minute' });
    expect(workoutClock(openDraft, started + seconds(20))).toMatchObject({ text: '0:20', name: 'Elapsed 0 minutes' });
  });

  it('switches to hours from the first hour on', () => {
    expect(workoutClock(openDraft, started + seconds(3600 + 125))).toMatchObject({
      text: '1:02:05',
      name: 'Elapsed 1 hour 2 minutes',
    });
    expect(workoutClock(openDraft, started + seconds(2 * 3600 + 30))).toMatchObject({
      text: '2:00:30',
      name: 'Elapsed 2 hours',
    });
  });

  it('never runs before the start or past the longest session', () => {
    expect(workoutClock(openDraft, started - seconds(30))).toMatchObject({ text: '0:00' });
    expect(workoutClock(openDraft, started + MAX_SESSION_DURATION_MS + seconds(600))).toMatchObject({
      text: '12:00:00',
      name: 'Elapsed 12 hours',
      ticking: true,
    });
  });

  it('freezes on the finished duration once the workout is finished', () => {
    expect(workoutClock(finishedDraft, started + seconds(3 * 3600))).toEqual({
      text: '40:00',
      name: 'Elapsed 40 minutes',
      ticking: false,
    });
  });
});
