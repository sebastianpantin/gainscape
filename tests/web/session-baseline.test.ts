import { describe, expect, it } from 'vitest';
import {
  parseSessionBaseline,
  recordBaselineFrom,
  type SessionBaseline,
  sessionBaselineAsOf,
} from '../../web/src/lib/session-baseline-rules.ts';
import { readSessionBaseline, saveSessionBaseline } from '../../web/src/lib/session-baseline-store.ts';
import { MemoryStorage } from './memory-storage.ts';

const baseline: SessionBaseline = {
  asOf: '2026-10-05T08:00:00.000Z',
  strength: { bench: { windowMax: 110, fallbackMax: null, hasPriorSession: true } },
  records: {
    repMaxKg: { bench: [120, null, null, null, 100, null, null, null, null, null] },
    maxReps: { pullup: 12 },
    cardioBest: { hang: { duration: 45 }, run: { distance: 5000, pace: 300 } },
  },
};

describe('recordBaselineFrom', () => {
  it('places each rep max load in the slot of its reps and keeps the most reps per exercise', () => {
    const records = recordBaselineFrom({
      repMaxes: [
        { exercise_id: 'bench', reps: 5, load_kg: '100' },
        { exercise_id: 'bench', reps: 1, load_kg: 120 },
      ],
      bodyweightRecords: [{ exercise_id: 'pullup', max_reps: 12 }],
      cardioRecords: [
        { exercise_id: 'hang', kind: 'duration', value: '45.0' },
        { exercise_id: 'run', kind: 'distance', value: 5000 },
        { exercise_id: 'run', kind: 'pace', value: 300 },
      ],
    });
    expect(records).toEqual(baseline.records);
  });
});

describe('parseSessionBaseline', () => {
  it('reads back a saved baseline, with or without records', () => {
    expect(parseSessionBaseline(JSON.stringify(baseline))).toEqual(baseline);
    const withoutRecords = { ...baseline, records: null };
    expect(parseSessionBaseline(JSON.stringify(withoutRecords))).toEqual(withoutRecords);
  });

  it('reads a baseline saved before hold records as one without them', () => {
    const saved = {
      ...baseline,
      records: { repMaxKg: baseline.records!.repMaxKg, maxReps: baseline.records!.maxReps },
    };
    expect(parseSessionBaseline(JSON.stringify(saved))).toEqual(saved);
  });

  it('rejects malformed best hold and cardio values', () => {
    const malformed = { ...baseline, records: { ...baseline.records, cardioBest: { hang: { duration: 'long' } } } };
    expect(parseSessionBaseline(JSON.stringify(malformed))).toBeNull();
  });

  it('rejects missing, malformed or partial baselines', () => {
    expect(parseSessionBaseline(null)).toBeNull();
    expect(parseSessionBaseline('not json')).toBeNull();
    expect(parseSessionBaseline(JSON.stringify({ ...baseline, asOf: 3 }))).toBeNull();
    expect(parseSessionBaseline(JSON.stringify({ ...baseline, strength: [] }))).toBeNull();
    expect(parseSessionBaseline(JSON.stringify({ ...baseline, records: { repMaxKg: {} } }))).toBeNull();
    expect(
      parseSessionBaseline(JSON.stringify({ ...baseline, records: { ...baseline.records, maxReps: { pullup: 'x' } } })),
    ).toBeNull();
    expect(
      parseSessionBaseline(
        JSON.stringify({ ...baseline, records: { ...baseline.records, repMaxKg: { bench: ['heavy'] } } }),
      ),
    ).toBeNull();
    expect(
      parseSessionBaseline(
        JSON.stringify({ ...baseline, records: { ...baseline.records, repMaxKg: { bench: [100] } } }),
      ),
    ).toBeNull();
    expect(
      parseSessionBaseline(
        JSON.stringify({
          ...baseline,
          strength: { bench: { windowMax: 'x', fallbackMax: null, hasPriorSession: true } },
        }),
      ),
    ).toBeNull();
  });
});

describe('stored session baseline', () => {
  it('round-trips through storage per user', () => {
    const storage = new MemoryStorage();
    saveSessionBaseline(storage, 'user-1', baseline);
    expect(readSessionBaseline(storage, 'user-1')).toEqual(baseline);
    expect(readSessionBaseline(storage, 'user-2')).toBeNull();
  });

  it('reads nothing without storage or when storage throws', () => {
    const throwing = new MemoryStorage();
    throwing.getItem = () => {
      throw new Error('blocked');
    };
    throwing.setItem = () => {
      throw new Error('blocked');
    };
    expect(readSessionBaseline(null, 'user-1')).toBeNull();
    expect(readSessionBaseline(throwing, 'user-1')).toBeNull();
    expect(() => saveSessionBaseline(throwing, 'user-1', baseline)).not.toThrow();
  });
});

describe('sessionBaselineAsOf', () => {
  const later = { ...baseline, asOf: '2026-10-06T08:00:00.000Z' };

  it('prefers the loaded baseline, else the saved one, when it is as of the draft start', () => {
    expect(sessionBaselineAsOf(baseline.asOf, baseline, { ...baseline, records: null })).toBe(baseline);
    expect(sessionBaselineAsOf(baseline.asOf, later, baseline)).toBe(baseline);
  });

  it('gives nothing for another start, a missing draft or no baseline', () => {
    expect(sessionBaselineAsOf(baseline.asOf, later, null)).toBeNull();
    expect(sessionBaselineAsOf(null, baseline, baseline)).toBeNull();
    expect(sessionBaselineAsOf(baseline.asOf, null, null)).toBeNull();
  });
});
