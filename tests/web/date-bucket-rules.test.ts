import { describe, expect, it } from 'vitest';
import {
  daysInMonth,
  monthKey,
  monthTitle,
  shiftMonth,
  weekKey,
  weekStartIn,
} from '../../web/src/lib/ui/date-bucket-rules.ts';

describe('weekStartIn', () => {
  it('is the Monday of the current week in the profile time zone', () => {
    expect(weekStartIn('UTC', Date.parse('2026-10-14T12:00:00Z'))).toBe('2026-10-12');
    expect(weekStartIn('UTC', Date.parse('2026-10-12T00:00:00Z'))).toBe('2026-10-12');
    expect(weekStartIn('UTC', Date.parse('2026-10-18T23:59:59Z'))).toBe('2026-10-12');
  });

  it('follows the time zone across midnight on Sunday', () => {
    const sundayEveningInNewYork = Date.parse('2026-10-19T02:00:00Z');
    expect(weekStartIn('America/New_York', sundayEveningInNewYork)).toBe('2026-10-12');
    expect(weekStartIn('Europe/Stockholm', sundayEveningInNewYork)).toBe('2026-10-19');
  });

  it('falls back to UTC for a time zone this device does not know', () => {
    const sundayEveningInNewYork = Date.parse('2026-10-19T02:00:00Z');
    expect(weekStartIn('Mars/Olympus_Mons', sundayEveningInNewYork)).toBe(weekStartIn('UTC', sundayEveningInNewYork));
  });

  it('crosses a month and a year boundary', () => {
    expect(weekStartIn('UTC', Date.parse('2026-11-01T10:00:00Z'))).toBe('2026-10-26');
    expect(weekStartIn('UTC', Date.parse('2027-01-02T10:00:00Z'))).toBe('2026-12-28');
  });
});

describe('weekKey', () => {
  it('is the Monday on or before a local date', () => {
    expect(weekKey('2026-10-12')).toBe('2026-10-12');
    expect(weekKey('2026-10-14')).toBe('2026-10-12');
    expect(weekKey('2026-10-18')).toBe('2026-10-12');
    expect(weekKey('2026-10-19')).toBe('2026-10-19');
  });

  it('crosses a month, a year and a leap day', () => {
    expect(weekKey('2026-11-01')).toBe('2026-10-26');
    expect(weekKey('2027-01-02')).toBe('2026-12-28');
    expect(weekKey('2028-03-01')).toBe('2028-02-28');
  });

  it('agrees with weekStartIn for the same day in UTC', () => {
    const now = Date.parse('2026-10-21T08:00:00Z');
    expect(weekKey('2026-10-21')).toBe(weekStartIn('UTC', now));
  });
});

describe('monthKey', () => {
  it('is the year and month of a local date', () => {
    expect(monthKey('2026-10-01')).toBe('2026-10');
    expect(monthKey('2026-10-31')).toBe('2026-10');
    expect(monthKey('2027-01-02')).toBe('2027-01');
  });
});

describe('shiftMonth', () => {
  it('steps back and forward across a year boundary', () => {
    expect(shiftMonth('2026-10', -1)).toBe('2026-09');
    expect(shiftMonth('2026-10', 1)).toBe('2026-11');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-10', 0)).toBe('2026-10');
  });
});

describe('daysInMonth', () => {
  it('counts the days of a month, leap February included', () => {
    expect(daysInMonth('2026-10')).toBe(31);
    expect(daysInMonth('2026-09')).toBe(30);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
  });
});

describe('monthTitle', () => {
  it('names the month and year', () => {
    expect(monthTitle('2026-10')).toBe('October 2026');
    expect(monthTitle('2027-01')).toBe('January 2027');
  });
});
