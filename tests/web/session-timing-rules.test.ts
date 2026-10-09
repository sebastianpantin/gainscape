import { describe, expect, it } from 'vitest';
import { implausibleTiming } from '@domain/session-timing.ts';
import {
  finishedAtFor,
  formatSessionDuration,
  isSessionRpe,
  SESSION_RPE_VALUES,
  sessionRpeChoiceLabel,
  sessionRpeFromChoice,
  sessionTimingParts,
} from '../../web/src/lib/session-timing-rules.ts';

const start = '2026-10-05T10:00:00.000Z';

function minutesAfterStart(minutes: number): string {
  return new Date(Date.parse(start) + minutes * 60_000).toISOString();
}

describe('isSessionRpe', () => {
  it('accepts whole numbers from 1 to 10', () => {
    expect(SESSION_RPE_VALUES).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const value of SESSION_RPE_VALUES) expect(isSessionRpe(value)).toBe(true);
  });

  it.each([0, 11, 7.5, '7', null, undefined, Number.NaN])('rejects %j', (value) => {
    expect(isSessionRpe(value)).toBe(false);
  });
});

describe('sessionRpeChoiceLabel', () => {
  it('names the easiest and the hardest choice and shows the rest as numbers', () => {
    expect(SESSION_RPE_VALUES.map(sessionRpeChoiceLabel)).toEqual([
      '1 (very easy)',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10 (max effort)',
    ]);
  });
});

describe('sessionRpeFromChoice', () => {
  it('reads a picked RPE and treats the empty choice as not rated', () => {
    expect(sessionRpeFromChoice('7')).toBe(7);
    expect(sessionRpeFromChoice('')).toBeNull();
  });

  it.each(['0', '11', '7.5', 'hard'])('treats %j as not rated', (choice) => {
    expect(sessionRpeFromChoice(choice)).toBeNull();
  });
});

describe('formatSessionDuration', () => {
  it('shows minutes below an hour', () => {
    expect(formatSessionDuration(start, minutesAfterStart(52))).toBe('52 min');
  });

  it('rounds to the nearest minute', () => {
    expect(formatSessionDuration(start, minutesAfterStart(52.4))).toBe('52 min');
    expect(formatSessionDuration(start, minutesAfterStart(52.5))).toBe('53 min');
  });

  it('shows hours and minutes from an hour on', () => {
    expect(formatSessionDuration(start, minutesAfterStart(60))).toBe('1 h');
    expect(formatSessionDuration(start, minutesAfterStart(95))).toBe('1 h 35 min');
  });

  it('shows a workout shorter than a minute as under a minute', () => {
    expect(formatSessionDuration(start, start)).toBe('<1 min');
    expect(formatSessionDuration(start, minutesAfterStart(0.4))).toBe('<1 min');
  });

  it('has no duration when the finish is before the start or unreadable', () => {
    expect(formatSessionDuration(start, minutesAfterStart(-5))).toBeNull();
    expect(formatSessionDuration(start, 'soon')).toBeNull();
  });
});

describe('sessionTimingParts', () => {
  it('lists the duration and the session RPE', () => {
    expect(sessionTimingParts({ startedAt: start, endedAt: minutesAfterStart(45), sessionRpe: 7 })).toEqual([
      '45 min',
      'Session RPE 7',
    ]);
  });

  it('leaves the RPE out when the workout was not rated', () => {
    expect(sessionTimingParts({ startedAt: start, endedAt: minutesAfterStart(45), sessionRpe: null })).toEqual([
      '45 min',
    ]);
  });

  it('shows nothing for a summary remembered before timing was reported', () => {
    expect(sessionTimingParts({})).toEqual([]);
  });

  it('leaves out a duration whose finish is before its start or unreadable', () => {
    expect(sessionTimingParts({ startedAt: start, endedAt: minutesAfterStart(-5), sessionRpe: 4 })).toEqual([
      'Session RPE 4',
    ]);
    expect(sessionTimingParts({ startedAt: start, endedAt: 'soon' })).toEqual([]);
  });
});

describe('finishedAtFor', () => {
  it('finishes a workout now', () => {
    expect(finishedAtFor(start, new Date(minutesAfterStart(75)))).toBe(minutesAfterStart(75));
  });

  it('caps a workout left open overnight at the longest workout the server accepts', () => {
    expect(finishedAtFor(start, new Date(minutesAfterStart(20 * 60)))).toBe(minutesAfterStart(12 * 60));
  });

  it('never finishes before the start when the device clock went back', () => {
    expect(finishedAtFor(start, new Date(minutesAfterStart(-30)))).toBe(start);
  });

  it('passes the server timing check for a workout left open any length of time', () => {
    for (const minutes of [0, 75, 12 * 60, 20 * 60]) {
      const now = Date.parse(minutesAfterStart(minutes));
      expect(implausibleTiming(start, finishedAtFor(start, new Date(now)), now)).toBeNull();
    }
  });
});
