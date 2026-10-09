import { describe, expect, it } from 'vitest';
import { implausibleTiming } from '@domain/index.ts';
import { HOUR_MS } from './fixtures.ts';

const now = Date.parse('2026-09-30T12:00:00.000Z');
const MINUTE_MS = 60 * 1000;
const at = (offsetMs: number) => new Date(now + offsetMs).toISOString();

describe('implausibleTiming', () => {
  it('accepts a session that ends after it starts, within 12 hours, not in the future', () => {
    expect(implausibleTiming(at(-HOUR_MS), at(0), now)).toBeNull();
  });

  it('accepts a zero-length session and one of exactly 12 hours', () => {
    expect(implausibleTiming(at(-HOUR_MS), at(-HOUR_MS), now)).toBeNull();
    expect(implausibleTiming(at(-12 * HOUR_MS), at(0), now)).toBeNull();
  });

  it('rejects a session that ends before it starts', () => {
    expect(implausibleTiming(at(-HOUR_MS), at(-HOUR_MS - 1), now)).toBe('ends_before_start');
  });

  it('rejects a session longer than 12 hours', () => {
    expect(implausibleTiming(at(-12 * HOUR_MS - 1), at(0), now)).toBe('session_too_long');
  });

  it('allows 5 minutes of clock skew and rejects anything later', () => {
    expect(implausibleTiming(at(0), at(5 * MINUTE_MS), now)).toBeNull();
    expect(implausibleTiming(at(0), at(5 * MINUTE_MS + 1), now)).toBe('session_in_future');
    expect(implausibleTiming(at(5 * MINUTE_MS + 1), at(5 * MINUTE_MS + 1), now)).toBe('session_in_future');
  });

  it('reports a backwards session before a long or future one', () => {
    expect(implausibleTiming(at(HOUR_MS), at(HOUR_MS - 1), now)).toBe('ends_before_start');
    expect(implausibleTiming(at(-HOUR_MS), at(12 * HOUR_MS), now)).toBe('session_too_long');
  });

  it('rejects a session that starts before 1970', () => {
    expect(implausibleTiming('1969-12-31T23:30:00.000Z', '1970-01-01T00:10:00.000Z', now)).toBe('session_too_old');
    expect(implausibleTiming('0000-01-01T00:00:00.000Z', '0000-01-01T00:30:00.000Z', now)).toBe('session_too_old');
    expect(implausibleTiming('1970-01-01T00:00:00.000Z', '1970-01-01T00:30:00.000Z', now)).toBeNull();
  });
});
