import { describe, expect, it } from 'vitest';
import { monthCompare, monthTotals } from '../../web/src/lib/stats/period-compare-rules.ts';
import { type TrainingSession } from '../../web/src/lib/stats/training-days-rules.ts';

function session(localDate: string, overrides: Partial<TrainingSession> = {}): TrainingSession {
  return { localDate, xp: 100, prCount: 0, dropCount: 0, volumeKg: 1000, ...overrides };
}

const SESSIONS = [
  session('2026-08-31', { xp: 9999, prCount: 9, volumeKg: 9999 }),
  session('2026-09-03', { xp: 200, prCount: 1, volumeKg: 2000 }),
  session('2026-10-01', { xp: 150, prCount: 2, volumeKg: 1500 }),
  session('2026-10-15', { xp: 250, prCount: 1, volumeKg: 3000.4 }),
  session('2026-10-31', { xp: 0, prCount: 0, volumeKg: 500 }),
  session('2026-11-01', { xp: 9999, prCount: 9, volumeKg: 9999 }),
];

describe('monthTotals', () => {
  it('adds up the workouts, volume, records and XP of one calendar month only', () => {
    expect(monthTotals('2026-10', SESSIONS)).toEqual({ workouts: 3, volumeKg: 5000.4, prs: 3, xp: 400 });
    expect(monthTotals('2026-09', SESSIONS)).toEqual({ workouts: 1, volumeKg: 2000, prs: 1, xp: 200 });
    expect(monthTotals('2026-07', SESSIONS)).toEqual({ workouts: 0, volumeKg: 0, prs: 0, xp: 0 });
  });
});

describe('monthCompare', () => {
  it('sets the shown month against the month before, with the change of each total', () => {
    expect(monthCompare('2026-10', SESSIONS, 'kg')).toEqual({
      currentTitle: 'October 2026',
      previousTitle: 'September 2026',
      rows: [
        { label: 'Workouts', current: '3', previous: '1', change: '+2' },
        { label: 'Volume', current: '5,000 kg', previous: '2,000 kg', change: '+3,000 kg' },
        { label: 'PRs', current: '3', previous: '1', change: '+2' },
        { label: 'XP', current: '400', previous: '200', change: '+200' },
      ],
    });
  });

  it('shows a drop with a minus sign and an equal total as no change', () => {
    const rows = monthCompare('2026-11', [session('2026-10-02', { xp: 300 }), session('2026-11-03')], 'kg').rows;
    expect(rows).toEqual([
      { label: 'Workouts', current: '1', previous: '1', change: 'No change' },
      { label: 'Volume', current: '1,000 kg', previous: '1,000 kg', change: 'No change' },
      { label: 'PRs', current: '0', previous: '0', change: 'No change' },
      { label: 'XP', current: '100', previous: '300', change: '−200' },
    ]);
  });

  it('shows the volume in pounds when the user prefers them', () => {
    const volume = monthCompare('2026-10', SESSIONS, 'lb').rows[1];
    expect(volume).toEqual({ label: 'Volume', current: '11,024 lb', previous: '4,409 lb', change: '+6,615 lb' });
  });
});
