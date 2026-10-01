import { describe, expect, it } from 'vitest';
import {
  ageFrom,
  bioProblem,
  birthYearProblem,
  heightProblem,
  initialsFor,
  latestBirthYear,
  trainingSinceProblem,
} from '../../web/src/lib/profile-rules.ts';

const now = new Date('2026-09-30T12:00:00Z');

describe('profile validation', () => {
  it('accepts blanks for optional fields', () => {
    expect(bioProblem('')).toBeNull();
    expect(heightProblem('')).toBeNull();
    expect(birthYearProblem('', now)).toBeNull();
    expect(trainingSinceProblem('', now)).toBeNull();
  });

  it('bounds height to 100–250 cm', () => {
    expect(heightProblem('99')).not.toBeNull();
    expect(heightProblem('181.5')).toBeNull();
    expect(heightProblem('251')).not.toBeNull();
  });

  it('requires people to be at least 13', () => {
    expect(latestBirthYear(now)).toBe(2013);
    expect(birthYearProblem('2013', now)).toBeNull();
    expect(birthYearProblem('2014', now)).not.toBeNull();
    expect(birthYearProblem('1899', now)).not.toBeNull();
    expect(birthYearProblem('1990.5', now)).not.toBeNull();
  });

  it('does not allow training to start in the future', () => {
    expect(trainingSinceProblem('2026', now)).toBeNull();
    expect(trainingSinceProblem('2027', now)).not.toBeNull();
    expect(trainingSinceProblem('1949', now)).not.toBeNull();
  });

  it('matches the database rules for bios', () => {
    expect(bioProblem('x'.repeat(80))).toBeNull();
    expect(bioProblem('x'.repeat(81))).not.toBeNull();
    expect(bioProblem('two\nlines')).not.toBeNull();
  });

  it('derives age from birth year and initials from the display name', () => {
    expect(ageFrom(1990, now)).toBe(36);
    expect(ageFrom(null, now)).toBeNull();
    expect(initialsFor('Iron Otter', 'iron_otter')).toBe('IO');
    expect(initialsFor('Mira', 'mira_lifts')).toBe('MI');
    expect(initialsFor('  ', 'dan_rows')).toBe('DA');
  });
});
