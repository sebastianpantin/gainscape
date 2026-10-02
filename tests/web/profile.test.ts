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
    expect(heightProblem('99')).toBe('Height must be between 100 and 250 cm.');
    expect(heightProblem('181.5')).toBeNull();
    expect(heightProblem('251')).toBe('Height must be between 100 and 250 cm.');
  });

  it('requires people to be at least 13', () => {
    expect(latestBirthYear(now)).toBe(2013);
    expect(birthYearProblem('2013', now)).toBeNull();
    expect(birthYearProblem('2014', now)).toBe('Birth year must be between 1900 and 2013.');
    expect(birthYearProblem('1899', now)).toBe('Birth year must be between 1900 and 2013.');
    expect(birthYearProblem('1990.5', now)).toBe('Enter a year like 1990.');
  });

  it('does not allow training to start in the future', () => {
    expect(trainingSinceProblem('2026', now)).toBeNull();
    expect(trainingSinceProblem('2027', now)).toBe('Training since must be between 1950 and 2026.');
    expect(trainingSinceProblem('1949', now)).toBe('Training since must be between 1950 and 2026.');
    expect(trainingSinceProblem('2019.5', now)).toBe('Enter a year like 2019.');
  });

  it('limits bios to 80 characters on one line without control characters', () => {
    expect(bioProblem('x'.repeat(80))).toBeNull();
    expect(bioProblem('x'.repeat(81))).toBe('Bio can be at most 80 characters.');
    expect(bioProblem('two\nlines')).toBe("Bio can't contain line breaks or control characters.");
  });

  it('derives age from birth year and initials from the display name', () => {
    expect(ageFrom(1990, now)).toBe(36);
    expect(ageFrom(null, now)).toBeNull();
    expect(initialsFor('Iron Otter', 'iron_otter')).toBe('IO');
    expect(initialsFor('Mira', 'mira_lifts')).toBe('MI');
    expect(initialsFor('  ', 'dan_rows')).toBe('DA');
  });
});
