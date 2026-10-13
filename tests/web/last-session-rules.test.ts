import { describe, expect, it } from 'vitest';
import {
  firstSetFromLastSession,
  lastTimeText,
  recentSessionsByExercise,
} from '../../web/src/lib/history/last-session-rules.ts';

describe('last session sets', () => {
  it('groups the rows by exercise and session, newest session first, keeping set order', () => {
    const grouped = recentSessionsByExercise([
      { exercise_id: 'bench', session_rank: 1, weight_kg: '70', reps: 6, logged_rir: '3.0' },
      { exercise_id: 'bench', session_rank: 1, weight_kg: '72.5', reps: 5, logged_rir: null },
      { exercise_id: 'bench', session_rank: 2, weight_kg: '67.5', reps: 6, logged_rir: 2 },
      { exercise_id: 'squat', session_rank: 1, weight_kg: '120', reps: 5, logged_rir: '1.5' },
    ]);
    expect([...grouped]).toEqual([
      [
        'bench',
        [
          [
            { weightKg: 70, reps: 6, loggedRir: 3 },
            { weightKg: 72.5, reps: 5, loggedRir: null },
          ],
          [{ weightKg: 67.5, reps: 6, loggedRir: 2 }],
        ],
      ],
      ['squat', [[{ weightKg: 120, reps: 5, loggedRir: 1.5 }]]],
    ]);
  });

  it('sums up last session as its set count and top set', () => {
    const sets = [
      { weightKg: 80, reps: 5 },
      { weightKg: 80, reps: 5 },
      { weightKg: 80, reps: 5 },
    ];
    expect(lastTimeText(sets, 'external', 'kg')).toBe('Last: 3 sets, top 80 kg × 5');
  });

  it('takes the heaviest set as the top set, then the one with most reps', () => {
    const sets = [
      { weightKg: 70, reps: 6 },
      { weightKg: 72.5, reps: 5 },
      { weightKg: 72.5, reps: 5 },
      { weightKg: 72.5, reps: 4 },
    ];
    expect(lastTimeText(sets, 'external', 'kg')).toBe('Last: 4 sets, top 72.5 kg × 5');
  });

  it('shows the weight in the preferred unit', () => {
    expect(lastTimeText([{ weightKg: 100, reps: 5 }], 'external', 'lb')).toBe('Last: 1 set, top 220.5 lb × 5');
  });

  it('leaves out the weight for bodyweight exercises and marks added load', () => {
    const sets = [
      { weightKg: 0, reps: 12 },
      { weightKg: 0, reps: 10 },
    ];
    expect(lastTimeText(sets, 'bodyweight', 'kg')).toBe('Last: 2 sets, top 12 reps');
    expect(lastTimeText(sets, 'bodyweight_plus', 'kg')).toBe('Last: 2 sets, top 12 reps');
    expect(lastTimeText([{ weightKg: 10, reps: 8 }], 'bodyweight_plus', 'kg')).toBe('Last: 1 set, top +10 kg × 8');
    expect(lastTimeText([{ weightKg: 0, reps: 1 }], 'bodyweight', 'kg')).toBe('Last: 1 set, top 1 rep');
  });

  it('has no text before the exercise was ever logged', () => {
    expect(lastTimeText(undefined, 'external', 'kg')).toBeNull();
    expect(lastTimeText([], 'external', 'kg')).toBeNull();
  });

  it('starts a new exercise from the first set of last session', () => {
    const sets = [
      { weightKg: 70, reps: 6 },
      { weightKg: 72.5, reps: 5 },
    ];
    expect(firstSetFromLastSession(sets, 'external')).toEqual({ weightKg: 70, reps: 6 });
    expect(firstSetFromLastSession(sets, 'bodyweight')).toEqual({ weightKg: 0, reps: 6 });
    expect(firstSetFromLastSession(undefined, 'external')).toBeUndefined();
  });
});
