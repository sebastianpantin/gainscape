import { describe, expect, it } from 'vitest';
import type { Exercise, LiftExercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import type { SessionProgress } from '../../web/src/lib/progress/exercise-progress-rules.ts';
import { dotsScore } from '../../web/src/lib/stats/dots-rules.ts';
import {
  dotsHistory,
  dotsHistorySeries,
  nextLevelText,
  powerliftingLiftIds,
  STRENGTH_LEVELS,
  strengthLevel,
  strengthLevelMarker,
  strengthMeterLabel,
} from '../../web/src/lib/stats/strength-level-rules.ts';

function session(localDate: string, e1rmKg: number | null, startedAt = `${localDate}T08:00:00Z`): SessionProgress {
  return {
    sessionId: `${localDate}-${startedAt}`,
    startedAt,
    localDate,
    e1rmKg,
    topSetKg: 100,
    topSetReps: 5,
    mostReps: 5,
    programDriven: false,
  };
}

function lift(id: string, key: string | null): LiftExercise {
  return {
    id,
    key,
    name: id,
    equipment: 'barbell',
    modality: 'lift',
    loadType: 'external',
    custom: key === null,
    archived: false,
    skillShares: [],
  };
}

describe('STRENGTH_LEVELS', () => {
  it('lists the five bands from Beginner to Elite with their lowest DOTS score', () => {
    expect(STRENGTH_LEVELS).toEqual([
      { name: 'Beginner', fromScore: 0 },
      { name: 'Novice', fromScore: 200 },
      { name: 'Intermediate', fromScore: 275 },
      { name: 'Advanced', fromScore: 350 },
      { name: 'Elite', fromScore: 425 },
    ]);
  });
});

describe('strengthLevel', () => {
  it('names the band the score falls in and the points still needed for the next one', () => {
    expect(strengthLevel(150)).toEqual({ name: 'Beginner', next: { name: 'Novice', pointsNeeded: 50 } });
    expect(strengthLevel(292.47)).toEqual({ name: 'Intermediate', next: { name: 'Advanced', pointsNeeded: 57.53 } });
  });

  it('starts a band at its lowest score exactly', () => {
    expect(strengthLevel(199.99).name).toBe('Beginner');
    expect(strengthLevel(200).name).toBe('Novice');
    expect(strengthLevel(275).name).toBe('Intermediate');
    expect(strengthLevel(350).name).toBe('Advanced');
    expect(strengthLevel(425).name).toBe('Elite');
  });

  it('has no next level at Elite', () => {
    expect(strengthLevel(612)).toEqual({ name: 'Elite', next: null });
  });

  it('treats a score below zero as Beginner', () => {
    expect(strengthLevel(-5).name).toBe('Beginner');
  });
});

describe('nextLevelText', () => {
  it('names the points to the next level with two decimals', () => {
    expect(nextLevelText(strengthLevel(292.47))).toBe('57.53 points to Advanced');
    expect(nextLevelText(strengthLevel(150))).toBe('50.00 points to Novice');
  });

  it('says Elite is the top level', () => {
    expect(nextLevelText(strengthLevel(430))).toBe('Elite is the top level.');
  });
});

describe('strengthMeterLabel', () => {
  it('names the level and the score with two decimals', () => {
    expect(strengthMeterLabel(292.47)).toBe('Strength level Intermediate, DOTS 292.47');
    expect(strengthMeterLabel(200)).toBe('Strength level Novice, DOTS 200.00');
  });
});

describe('strengthLevelMarker', () => {
  it('places each band start at the left edge of its equal fifth of the bar', () => {
    expect(strengthLevelMarker(0)).toBe(0);
    expect(strengthLevelMarker(200)).toBeCloseTo(0.2);
    expect(strengthLevelMarker(275)).toBeCloseTo(0.4);
    expect(strengthLevelMarker(350)).toBeCloseTo(0.6);
    expect(strengthLevelMarker(425)).toBeCloseTo(0.8);
  });

  it('interpolates inside the band of the score', () => {
    expect(strengthLevelMarker(100)).toBeCloseTo(0.1);
    expect(strengthLevelMarker(312.5)).toBeCloseTo(0.5);
    expect(strengthLevelMarker(462.5)).toBeCloseTo(0.9);
  });

  it('clamps below zero and from 500 up', () => {
    expect(strengthLevelMarker(-20)).toBe(0);
    expect(strengthLevelMarker(500)).toBe(1);
    expect(strengthLevelMarker(640)).toBe(1);
  });
});

describe('powerliftingLiftIds', () => {
  it('returns the exercise ids of squat, bench press and deadlift in that order', () => {
    const exercises: Exercise[] = [
      lift('id-deadlift', 'deadlift'),
      lift('id-row', 'barbell_row'),
      lift('id-squat', 'back_squat'),
      lift('id-custom', null),
      lift('id-bench', 'barbell_bench_press'),
    ];
    expect(powerliftingLiftIds(exercises)).toEqual(['id-squat', 'id-bench', 'id-deadlift']);
  });

  it('is null when one of the three is not in the list', () => {
    expect(powerliftingLiftIds([lift('id-squat', 'back_squat'), lift('id-bench', 'barbell_bench_press')])).toBeNull();
  });
});

describe('dotsHistory', () => {
  const bodyweights = [
    { day: '2026-10-01', bodyweightKg: 80 },
    { day: '2026-10-10', bodyweightKg: 82 },
  ];

  it('totals the three lifts on each day any of them was trained, with the bodyweight in effect that day', () => {
    const sessions = new Map([
      ['squat', [session('2026-10-02', 140), session('2026-10-12', 145)]],
      ['bench', [session('2026-10-03', 100)]],
      ['deadlift', [session('2026-10-04', 180)]],
    ]);
    expect(dotsHistory(sessions, bodyweights, 56)).toEqual([
      { day: '2026-10-04', totalKg: 420, bodyweightKg: 80 },
      { day: '2026-10-12', totalKg: 425, bodyweightKg: 82 },
    ]);
  });

  it('skips days before every lift has an e1RM or before the first bodyweight', () => {
    const sessions = new Map([
      ['squat', [session('2026-09-20', 140), session('2026-10-05', 141)]],
      ['bench', [session('2026-09-21', 100)]],
      ['deadlift', [session('2026-09-22', 180)]],
    ]);
    expect(dotsHistory(sessions, bodyweights, 56)).toEqual([{ day: '2026-10-05', totalKg: 421, bodyweightKg: 80 }]);
  });

  it('keeps the best e1RM within the window ending that day, including its first day', () => {
    const sessions = new Map([
      ['squat', [session('2026-10-02', 150), session('2026-10-09', 140), session('2026-10-16', 140)]],
      ['bench', [session('2026-10-02', 100)]],
      ['deadlift', [session('2026-10-02', 180)]],
    ]);
    expect(dotsHistory(sessions, bodyweights, 7)).toEqual([
      { day: '2026-10-02', totalKg: 430, bodyweightKg: 80 },
      { day: '2026-10-09', totalKg: 430, bodyweightKg: 80 },
      { day: '2026-10-16', totalKg: 420, bodyweightKg: 82 },
    ]);
  });

  it('falls back to the most recent earlier e1RM of a lift not trained within the window', () => {
    const sessions = new Map([
      ['squat', [session('2026-10-02', 150), session('2026-10-03', 140)]],
      ['bench', [session('2026-10-02', 100)]],
      ['deadlift', [session('2026-10-02', 180), session('2026-12-20', 190)]],
    ]);
    expect(dotsHistory(sessions, bodyweights, 7).at(-1)).toEqual({
      day: '2026-12-20',
      totalKg: 430,
      bodyweightKg: 82,
    });
  });

  it('takes the later session of the most recent day as the fallback', () => {
    const sessions = new Map([
      [
        'squat',
        [session('2026-10-02', 150, '2026-10-02T18:00:00Z'), session('2026-10-02', 140, '2026-10-02T08:00:00Z')],
      ],
      ['bench', [session('2026-10-02', 100)]],
      ['deadlift', [session('2026-10-02', 180), session('2026-12-20', 190)]],
    ]);
    expect(dotsHistory(sessions, bodyweights, 7).at(-1)?.totalKg).toBe(440);
  });

  it('ignores sessions without an e1RM', () => {
    const sessions = new Map([
      ['squat', [session('2026-10-02', 140), session('2026-10-06', null)]],
      ['bench', [session('2026-10-02', 100)]],
      ['deadlift', [session('2026-10-02', 180)]],
    ]);
    expect(dotsHistory(sessions, bodyweights, 56)).toEqual([{ day: '2026-10-02', totalKg: 420, bodyweightKg: 80 }]);
  });

  it('is empty without a bodyweight', () => {
    const sessions = new Map([
      ['squat', [session('2026-10-02', 140)]],
      ['bench', [session('2026-10-02', 100)]],
      ['deadlift', [session('2026-10-02', 180)]],
    ]);
    expect(dotsHistory(sessions, [], 56)).toEqual([]);
  });
});

describe('dotsHistorySeries', () => {
  it('plots the DOTS score for the sex at UTC midnight of each day', () => {
    const points = [{ day: '2026-10-04', totalKg: 420, bodyweightKg: 80 }];
    expect(dotsHistorySeries(points, 'female')).toEqual([
      {
        name: 'DOTS',
        points: [{ x: Date.parse('2026-10-04T00:00:00Z'), y: dotsScore(420, 80, 'female') }],
      },
    ]);
  });
});
