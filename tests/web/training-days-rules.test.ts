import { describe, expect, it } from 'vitest';
import {
  type TrainingDayRow,
  trainingDaysRange,
  trainingSessionOf,
} from '../../web/src/lib/stats/training-days-rules.ts';

function row(overrides: Partial<TrainingDayRow> = {}): TrainingDayRow {
  return {
    local_date: '2026-10-02',
    history_only: false,
    xp_by_skill: { chest: 120, arms: 30 },
    pr_count: 2,
    drop_count: 1,
    volume_kg: '487.50',
    ...overrides,
  };
}

describe('trainingDaysRange', () => {
  it('reads the shown month and the month before it, so one load feeds the calendar and the compare', () => {
    expect(trainingDaysRange('2026-10')).toEqual({ fromDay: '2026-09-01', toDay: '2026-10-31' });
    expect(trainingDaysRange('2026-03')).toEqual({ fromDay: '2026-02-01', toDay: '2026-03-31' });
    expect(trainingDaysRange('2027-01')).toEqual({ fromDay: '2026-12-01', toDay: '2027-01-31' });
    expect(trainingDaysRange('2026-09')).toEqual({ fromDay: '2026-08-01', toDay: '2026-09-30' });
  });
});

describe('trainingSessionOf', () => {
  it('adds up the XP of every skill and reads the volume as a number', () => {
    expect(trainingSessionOf(row())).toEqual({
      localDate: '2026-10-02',
      xp: 150,
      prCount: 2,
      dropCount: 1,
      volumeKg: 487.5,
    });
  });

  it('counts no XP for a history-only workout but keeps its volume', () => {
    expect(trainingSessionOf(row({ history_only: true, volume_kg: 100 }))).toMatchObject({ xp: 0, volumeKg: 100 });
  });
});
