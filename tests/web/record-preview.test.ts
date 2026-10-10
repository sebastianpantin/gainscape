import { describe, expect, it } from 'vitest';
import { type ExerciseStrength } from '@domain/index.ts';
import type { LoadType } from '../../web/src/lib/catalog-rules.ts';
import { type RecordBaseline } from '../../web/src/lib/session-baseline-rules.ts';
import type {
  CardioDraftExercise,
  DraftSet,
  HoldDraftExercise,
  HoldDraftSet,
  LiftDraftExercise,
} from '../../web/src/offline/draft-format.ts';
import {
  becomesRecord,
  previewRecords,
  recordChipLabel,
  recordChipText,
  recordForSet,
} from '../../web/src/features/workout/record-preview.ts';

const NO_RECORD_BASELINE: RecordBaseline = Object.freeze({ repMaxKg: {}, maxReps: {} });

let setCounter = 0;

function draftSet(weightKg: number, reps: number, done = true): DraftSet {
  setCounter += 1;
  return { id: `set-${setCounter}`, weightKg, reps, effort: null, done, isWarmup: false };
}

function exercise(exerciseId: string, sets: DraftSet[], loadType: LoadType = 'external'): LiftDraftExercise {
  return {
    clientId: `card-${exerciseId}`,
    exerciseId,
    name: exerciseId,
    modality: 'lift',
    loadType,
    target: null,
    sets,
  };
}

function trained(...exerciseIds: string[]): Record<string, ExerciseStrength> {
  return Object.fromEntries(
    exerciseIds.map((id) => [id, { windowMax: 100, fallbackMax: null, hasPriorSession: true }]),
  );
}

function repMaxes(exerciseId: string, loadsByReps: Record<number, number>): RecordBaseline {
  const slots = Array.from({ length: 10 }, (_, index) => {
    const atLeastReps = Object.entries(loadsByReps).filter(([reps]) => Number(reps) >= index + 1);
    return atLeastReps.length === 0 ? null : Math.max(...atLeastReps.map(([, loadKg]) => loadKg));
  });
  return { repMaxKg: { [exerciseId]: slots }, maxReps: {} };
}

describe('previewRecords', () => {
  it('predicts a new rep max when a done set beats the slot for its reps', () => {
    const records = previewRecords(
      [exercise('bench', [draftSet(102.5, 5)])],
      trained('bench'),
      repMaxes('bench', { 5: 100 }),
    );
    expect(records).toEqual([[{ kind: 'rep_max', reps: 5, loadKg: 102.5, previousLoadKg: 100 }]]);
  });

  it('does not count a tie or a gain below the minimum record gain', () => {
    const baseline = repMaxes('bench', { 5: 100 });
    const tied = previewRecords([exercise('bench', [draftSet(100, 5)])], trained('bench'), baseline);
    const tiny = previewRecords([exercise('bench', [draftSet(100.5, 5)])], trained('bench'), baseline);
    expect(tied).toEqual([[null]]);
    expect(tiny).toEqual([[null]]);
  });

  it('names the highest rep slot a set improves', () => {
    const records = previewRecords(
      [exercise('bench', [draftSet(90, 8)])],
      trained('bench'),
      repMaxes('bench', { 5: 100, 6: 95, 7: 88, 8: 85 }),
    );
    expect(records[0][0]).toMatchObject({ kind: 'rep_max', reps: 8 });
  });

  it('ignores warm-ups, planned sets and invalid sets', () => {
    const warmup = { ...draftSet(200, 5), isWarmup: true };
    const planned = draftSet(200, 5, false);
    const noReps = draftSet(200, 0);
    const records = previewRecords(
      [exercise('bench', [warmup, planned, noReps])],
      trained('bench'),
      repMaxes('bench', { 5: 100 }),
    );
    expect(records).toEqual([[null, null, null]]);
  });

  it('predicts no record for an exercise without a prior session or before strength has loaded', () => {
    const sets = [exercise('bench', [draftSet(200, 5)])];
    expect(previewRecords(sets, trained(), NO_RECORD_BASELINE)).toEqual([[null]]);
    expect(previewRecords(sets, null, NO_RECORD_BASELINE)).toEqual([[null]]);
  });

  it('predicts nothing before the records have loaded', () => {
    expect(previewRecords([exercise('bench', [draftSet(200, 5)])], trained('bench'), null)).toEqual([[null]]);
  });

  it('fills an empty slot of a trained exercise', () => {
    const records = previewRecords([exercise('bench', [draftSet(60, 3)])], trained('bench'), NO_RECORD_BASELINE);
    expect(records[0][0]).toEqual({ kind: 'rep_max', reps: 3, loadKg: 60, previousLoadKg: null });
  });

  it('lets an earlier set in the session raise the bar for a later one', () => {
    const records = previewRecords(
      [exercise('bench', [draftSet(105, 5), draftSet(105, 5), draftSet(110, 5)])],
      trained('bench'),
      repMaxes('bench', { 5: 100 }),
    );
    expect(records[0].map((record) => record?.kind ?? null)).toEqual(['rep_max', null, 'rep_max']);
  });

  it('predicts a reps record for a bodyweight exercise only when it beats the most reps', () => {
    const baseline: RecordBaseline = { repMaxKg: {}, maxReps: { pullup: 12 } };
    const records = previewRecords(
      [exercise('pullup', [draftSet(0, 12), draftSet(0, 13)], 'bodyweight')],
      trained('pullup'),
      baseline,
    );
    expect(records).toEqual([[null, { kind: 'bodyweight_reps', reps: 13, previousReps: 12 }]]);
  });

  it('tracks rep maxes of added weight for a weighted bodyweight exercise', () => {
    const records = previewRecords(
      [exercise('dip', [draftSet(20, 5)], 'bodyweight_plus')],
      trained('dip'),
      repMaxes('dip', { 5: 15 }),
    );
    expect(records[0][0]).toEqual({ kind: 'rep_max', reps: 5, loadKg: 20, previousLoadKg: 15 });
  });

  it('keeps a cardio exercise in place without records', () => {
    const cardio: CardioDraftExercise = {
      clientId: 'card-run',
      exerciseId: 'run',
      name: 'Run',
      modality: 'cardio',
      activity: { paceUnit: 'per_km', referencePaceSPerKm: null, maxEffort: 'max', tracksDistance: true, shares: [] },
      sets: [
        { id: 'bout-1', kind: 'cardio', durationS: 600, distanceM: 2000, interval: null, effort: null, done: true },
      ],
    };
    const records = previewRecords(
      [cardio, exercise('bench', [draftSet(110, 5)])],
      trained('bench'),
      repMaxes('bench', { 5: 100 }),
    );
    expect(records[0]).toEqual([null]);
    expect(records[1][0]).toMatchObject({ kind: 'rep_max', reps: 5 });
  });
});

describe('recordForSet', () => {
  it('finds the predicted record of a set by id', () => {
    const set = draftSet(110, 5);
    const exercises = [exercise('bench', [draftSet(60, 5, false), set])];
    const records = previewRecords(exercises, trained('bench'), repMaxes('bench', { 5: 100 }));
    expect(recordForSet(records, exercises, set.id)).toMatchObject({ kind: 'rep_max', reps: 5 });
    expect(recordForSet(records, exercises, 'missing')).toBeNull();
  });
});

describe('becomesRecord', () => {
  it('is true only when a change turns a set into a predicted record', () => {
    const planned = draftSet(110, 5, false);
    const before = [exercise('bench', [planned])];
    const after = [exercise('bench', [{ ...planned, done: true }])];
    const strength = trained('bench');
    const baseline = repMaxes('bench', { 5: 100 });
    const recordsOf = (exercises: LiftDraftExercise[]) => previewRecords(exercises, strength, baseline);
    expect(becomesRecord(recordsOf(before), before, after, planned.id, strength, baseline)).toBe(true);
    expect(becomesRecord(recordsOf(after), after, after, planned.id, strength, baseline)).toBe(false);
    expect(becomesRecord(recordsOf(after), after, before, planned.id, strength, baseline)).toBe(false);
  });
});

describe('recordChipText', () => {
  it('names the rep max or the reps record', () => {
    expect(recordChipText({ kind: 'rep_max', reps: 5, loadKg: 100, previousLoadKg: 95 })).toBe('New 5RM!');
    expect(recordChipText({ kind: 'bodyweight_reps', reps: 13, previousReps: 12 })).toBe('Most reps!');
  });

  it('spells the record out for screen readers', () => {
    expect(recordChipLabel({ kind: 'rep_max', reps: 5, loadKg: 100, previousLoadKg: 95 })).toBe(
      'Predicted new 5 rep max',
    );
    expect(recordChipLabel({ kind: 'bodyweight_reps', reps: 13, previousReps: 12 })).toBe('Predicted most reps: 13');
  });
});

function holdSet(weightKg: number, measured: { durationS: number } | { distanceM: number }, done = true): HoldDraftSet {
  setCounter += 1;
  return {
    id: `hold-${setCounter}`,
    kind: 'hold',
    weightKg,
    durationS: 'durationS' in measured ? measured.durationS : null,
    distanceM: 'distanceM' in measured ? measured.distanceM : null,
    effort: null,
    done,
  };
}

function holdExercise(
  exerciseId: string,
  measure: HoldDraftExercise['measure'],
  loadType: LoadType,
  sets: HoldDraftSet[],
): HoldDraftExercise {
  return { clientId: `card-${exerciseId}`, exerciseId, name: exerciseId, modality: 'hold', measure, loadType, sets };
}

function holdBaseline(exerciseId: string, best: { duration?: number; distance?: number }): RecordBaseline {
  return { repMaxKg: {}, maxReps: {}, cardioBest: { [exerciseId]: best } };
}

describe('previewRecords for holds', () => {
  it('predicts the longest hold and the farthest carry once the load reaches the 20 kg floor', () => {
    const pinch = previewRecords(
      [holdExercise('pinch', 'time', 'external', [holdSet(20, { durationS: 45 })])],
      null,
      holdBaseline('pinch', { duration: 30 }),
    );
    expect(pinch).toEqual([[{ kind: 'hold', gain: { kind: 'duration', value: 45, previous: 30 } }]]);
    const carry = previewRecords(
      [holdExercise('carry', 'distance', 'external', [holdSet(24, { distanceM: 60 })])],
      null,
      holdBaseline('carry', { distance: 40 }),
    );
    expect(carry).toEqual([[{ kind: 'hold', gain: { kind: 'distance', value: 60, previous: 40 } }]]);
  });

  it('predicts no record for an external-load hold under the floor', () => {
    const records = previewRecords(
      [holdExercise('pinch', 'time', 'external', [holdSet(15, { durationS: 90 })])],
      null,
      holdBaseline('pinch', { duration: 30 }),
    );
    expect(records).toEqual([[null]]);
  });

  it('counts a bodyweight hang at any added load', () => {
    const records = previewRecords(
      [holdExercise('hang', 'time', 'bodyweight', [holdSet(0, { durationS: 31 })])],
      null,
      holdBaseline('hang', { duration: 30 }),
    );
    expect(records[0][0]).toEqual({ kind: 'hold', gain: { kind: 'duration', value: 31, previous: 30 } });
  });

  it('needs a gain of at least 1 s or 1 m', () => {
    const hang = previewRecords(
      [holdExercise('hang', 'time', 'bodyweight', [holdSet(0, { durationS: 30 })])],
      null,
      holdBaseline('hang', { duration: 30 }),
    );
    const carry = previewRecords(
      [
        holdExercise('carry', 'distance', 'external', [
          holdSet(24, { distanceM: 40.5 }),
          holdSet(24, { distanceM: 41 }),
        ]),
      ],
      null,
      holdBaseline('carry', { distance: 40 }),
    );
    expect(hang).toEqual([[null]]);
    expect(carry[0].map((record) => record?.kind ?? null)).toEqual([null, 'hold']);
  });

  it('predicts no record for a first hold, a planned hold or before the records have loaded', () => {
    const first = [holdExercise('hang', 'time', 'bodyweight', [holdSet(0, { durationS: 60 })])];
    expect(previewRecords(first, null, NO_RECORD_BASELINE)).toEqual([[null]]);
    expect(previewRecords(first, null, null)).toEqual([[null]]);
    const planned = [holdExercise('hang', 'time', 'bodyweight', [holdSet(0, { durationS: 60 }, false)])];
    expect(previewRecords(planned, null, holdBaseline('hang', { duration: 30 }))).toEqual([[null]]);
  });

  it('lets an earlier hold raise the bar for a later one', () => {
    const records = previewRecords(
      [holdExercise('hang', 'time', 'bodyweight', [holdSet(0, { durationS: 40 }), holdSet(0, { durationS: 40 })])],
      null,
      holdBaseline('hang', { duration: 30 }),
    );
    expect(records[0].map((record) => record?.kind ?? null)).toEqual(['hold', null]);
  });

  it('names a hold and a carry record on the chip', () => {
    const longest = { kind: 'hold' as const, gain: { kind: 'duration' as const, value: 45, previous: 30 } };
    const farthest = { kind: 'hold' as const, gain: { kind: 'distance' as const, value: 40, previous: 30 } };
    expect([recordChipText(longest), recordChipLabel(longest)]).toEqual([
      'Longest hold!',
      'Predicted longest hold: 45 s',
    ]);
    expect([recordChipText(farthest), recordChipLabel(farthest)]).toEqual([
      'Farthest carry!',
      'Predicted farthest carry: 40 m',
    ]);
  });
});
