import { describe, expect, it } from 'vitest';
import type { Collection, RepMaxSlotView } from '../../web/src/lib/collection/collection-data.ts';
import type { LiftExercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import { sbdTotalFor } from '../../web/src/lib/stats/sbd-total-rules.ts';

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

const EXERCISES = [
  lift('squat-id', 'back_squat'),
  lift('bench-id', 'barbell_bench_press'),
  lift('dead-id', 'deadlift'),
  lift('pause-id', 'pause_squat'),
  lift('sumo-id', 'sumo_deadlift'),
  lift('custom-id', null),
];

function single(loadKg: number, achievedAt: string): (RepMaxSlotView | null)[] {
  return [{ loadKg, exact: true, achievedAt }, null, null, null, null, null, null, null, null, null];
}

function collectionWith(
  e1rmKgById: Record<string, number>,
  singlesById: Record<string, [number, string]> = {},
): Collection {
  return {
    exercises: EXERCISES,
    data: {
      repMaxesByExercise: new Map(Object.entries(singlesById).map(([id, [kg, at]]) => [id, single(kg, at)])),
      maxRepsByExercise: new Map(),
      strengthByExercise: new Map(
        Object.entries(e1rmKgById).map(([id, e1rmKg]) => [id, { e1rmKg, repsCapacity: null }]),
      ),
      pinnedExerciseIds: [],
      nextPinPosition: 0,
      cardioRecords: [],
    },
  };
}

const FULL_E1RM = { 'squat-id': 200, 'bench-id': 140, 'dead-id': 240 };
const FULL_SINGLES: Record<string, [number, string]> = {
  'squat-id': [190, '2026-09-10T10:00:00Z'],
  'bench-id': [130, '2026-08-01T10:00:00Z'],
  'dead-id': [230, '2026-10-05T10:00:00Z'],
};

describe('sbdTotalFor', () => {
  it('adds the current e1RMs for the estimated total and the best singles for the best total, dated by the oldest single', () => {
    expect(sbdTotalFor(collectionWith(FULL_E1RM, FULL_SINGLES))).toEqual({
      kind: 'ready',
      estimatedKg: 580,
      bestKg: 550,
      bestAchievedAt: '2026-08-01T10:00:00Z',
      lifts: [
        { key: 'back_squat', name: 'Squat', currentKg: 200, bestKg: 190 },
        { key: 'barbell_bench_press', name: 'Bench', currentKg: 140, bestKg: 130 },
        { key: 'deadlift', name: 'Deadlift', currentKg: 240, bestKg: 230 },
      ],
    });
  });

  it('dates the best total by the oldest known date and by nothing when no date is known', () => {
    const undated = (loadKg: number): (RepMaxSlotView | null)[] => [
      { loadKg, exact: true, achievedAt: null },
      ...Array<null>(9).fill(null),
    ];
    const collection = collectionWith(FULL_E1RM, FULL_SINGLES);
    collection.data.repMaxesByExercise.set('squat-id', undated(190));
    expect(sbdTotalFor(collection)).toMatchObject({ bestKg: 550, bestAchievedAt: '2026-08-01T10:00:00Z' });
    collection.data.repMaxesByExercise.set('bench-id', undated(130));
    collection.data.repMaxesByExercise.set('dead-id', undated(230));
    expect(sbdTotalFor(collection)).toMatchObject({ bestKg: 550, bestAchievedAt: null });
  });

  it('names the lifts without a current e1RM and gives no total', () => {
    expect(sbdTotalFor(collectionWith({ 'squat-id': 200, 'bench-id': 140 }, FULL_SINGLES))).toEqual({
      kind: 'missing-lifts',
      text: 'Log a deadlift to see your SBD total.',
    });
  });

  it('keeps the current total when a best single is missing and leaves the best total empty', () => {
    const card = sbdTotalFor(collectionWith(FULL_E1RM, { 'squat-id': FULL_SINGLES['squat-id'] }));
    expect(card).toEqual({
      kind: 'ready',
      estimatedKg: 580,
      bestKg: null,
      bestAchievedAt: null,
      lifts: [
        { key: 'back_squat', name: 'Squat', currentKg: 200, bestKg: 190 },
        { key: 'barbell_bench_press', name: 'Bench', currentKg: 140, bestKg: null },
        { key: 'deadlift', name: 'Deadlift', currentKg: 240, bestKg: null },
      ],
    });
  });

  it('ignores pause squats, sumo deadlifts and custom exercises', () => {
    const card = sbdTotalFor(collectionWith({ 'pause-id': 250, 'sumo-id': 300, 'custom-id': 150, 'bench-id': 140 }));
    expect(card).toEqual({ kind: 'missing-lifts', text: 'Log a squat and a deadlift to see your SBD total.' });
  });
});
