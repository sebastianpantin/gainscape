import { describe, expect, it } from 'vitest';
import {
  firstSetFromLastSession,
  lastTimeText,
  recentSessionsByExercise,
} from '../../web/src/lib/last-session-rules.ts';

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

  it('collapses repeated sets into sets × reps at a weight', () => {
    const sets = [
      { weightKg: 80, reps: 5 },
      { weightKg: 80, reps: 5 },
      { weightKg: 80, reps: 5 },
    ];
    expect(lastTimeText(sets, 'external', 'kg')).toBe('Last: 3×5 @ 80 kg');
  });

  it('lists changes in weight or reps in the order they were lifted', () => {
    const sets = [
      { weightKg: 70, reps: 6 },
      { weightKg: 72.5, reps: 5 },
      { weightKg: 72.5, reps: 5 },
      { weightKg: 72.5, reps: 4 },
    ];
    expect(lastTimeText(sets, 'external', 'kg')).toBe('Last: 1×6 @ 70 kg, 2×5 @ 72.5 kg, 1×4 @ 72.5 kg');
  });

  it('shows the weight in the preferred unit', () => {
    expect(lastTimeText([{ weightKg: 100, reps: 5 }], 'external', 'lb')).toBe('Last: 1×5 @ 220.5 lb');
  });

  it('leaves out the weight for bodyweight exercises and marks added load', () => {
    const sets = [
      { weightKg: 0, reps: 12 },
      { weightKg: 0, reps: 10 },
    ];
    expect(lastTimeText(sets, 'bodyweight', 'kg')).toBe('Last: 1×12, 1×10');
    expect(lastTimeText(sets, 'bodyweight_plus', 'kg')).toBe('Last: 1×12, 1×10');
    expect(lastTimeText([{ weightKg: 10, reps: 8 }], 'bodyweight_plus', 'kg')).toBe('Last: 1×8 @ +10 kg');
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
