import { describe, expect, it } from 'vitest';
import { boutPayload } from '../../web/src/offline/session-payload.ts';

const easy = { type: 'cardio', level: 'easy' } as const;

describe('boutPayload', () => {
  it('sends a steady bout with its duration', () => {
    expect(
      boutPayload({ id: 'bout-a', durationS: 1800, distanceM: 5000, interval: null, effort: easy }, 'run', 3),
    ).toEqual({
      kind: 'cardio',
      id: 'bout-a',
      exerciseId: 'run',
      position: 3,
      durationS: 1800,
      distanceM: 5000,
      interval: null,
      effort: easy,
    });
  });

  it('leaves the duration out of an interval bout', () => {
    const interval = { workS: 30, restS: 30, rounds: 10 };
    expect(boutPayload({ id: 'bout-b', durationS: 999, distanceM: null, interval, effort: null }, 'row', 0)).toEqual({
      kind: 'cardio',
      id: 'bout-b',
      exerciseId: 'row',
      position: 0,
      distanceM: null,
      interval,
      effort: null,
    });
  });
});
