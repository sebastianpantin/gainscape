import { describe, expect, it } from 'vitest';
import {
  parseSessionBaseline,
  recordBaselineFrom,
  type SessionBaseline,
} from '../../web/src/lib/session-baseline-rules.ts';
import { readSessionBaseline, saveSessionBaseline } from '../../web/src/lib/session-baseline-store.ts';
import { MemoryStorage } from './memory-storage.ts';

const baseline: SessionBaseline = {
  asOf: '2026-10-05T08:00:00.000Z',
  strength: { bench: { windowMax: 110, fallbackMax: null, hasPriorSession: true } },
  records: {
    repMaxKg: { bench: [120, null, null, null, 100, null, null, null, null, null] },
    maxReps: { pullup: 12 },
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
