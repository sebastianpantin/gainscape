import { describe, expect, it } from 'vitest';
import {
  ageFrom,
  bodyweightInUnitProblem,
  bodyweightRangeInUnit,
  feetAndInchesProblem,
  heightInCm,
  initialHeight,
  nudgedBodyweightKg,
  optionalNumber,
  previousValues,
  sameHeightInput,
  saveProblemText,
  bioProblem,
  birthYearProblem,
  cooldownStartFor,
  formatDay,
  heightProblem,
  initialsFor,
  latestBirthYear,
  nextTimezoneChangeAt,
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

describe('time zone cooldown', () => {
  it('allows a change when the time zone was never changed or the 7 days are over', () => {
    expect(nextTimezoneChangeAt({ timezoneChangedAt: null }, now)).toBeNull();
    expect(nextTimezoneChangeAt({ timezoneChangedAt: '2026-09-23T12:00:00.000Z' }, now)).toBeNull();
  });

  it('gives the next allowed change 7 days after the last one', () => {
    expect(nextTimezoneChangeAt({ timezoneChangedAt: '2026-09-27T08:00:00.000Z' }, now)?.toISOString()).toBe(
      '2026-10-04T08:00:00.000Z',
    );
  });

  it('works back from the next allowed change to when the cooldown started', () => {
    expect(cooldownStartFor('2026-10-04T08:00:00.000Z')).toBe('2026-09-27T08:00:00.000Z');
  });

  it('shows a day with weekday, day and month', () => {
    expect(formatDay(new Date('2026-10-01T12:00:00Z'))).toBe('Thu 1 Oct');
  });
});

describe('edit profile inputs', () => {
  it('reads an optional number, treating blank input as none', () => {
    expect(optionalNumber('')).toBeNull();
    expect(optionalNumber('  ')).toBeNull();
    expect(optionalNumber('72.5')).toBe(72.5);
    expect(optionalNumber('abc')).toBeNaN();
  });

  it('gives the bodyweight range in whole units of the chosen unit', () => {
    expect(bodyweightRangeInUnit('kg')).toEqual({ lowest: 20, highest: 400 });
    expect(bodyweightRangeInUnit('lb')).toEqual({ lowest: 45, highest: 881 });
  });

  it('checks a typed bodyweight in the chosen unit', () => {
    expect(bodyweightInUnitProblem('', 'kg')).toBeNull();
    expect(bodyweightInUnitProblem('80', 'kg')).toBeNull();
    expect(bodyweightInUnitProblem('19', 'kg')).toBe('Bodyweight must be between 20 and 400 kg.');
    expect(bodyweightInUnitProblem('heavy', 'kg')).toBe('Bodyweight must be between 20 and 400 kg.');
    expect(bodyweightInUnitProblem('45', 'lb')).toBeNull();
    expect(bodyweightInUnitProblem('44', 'lb')).toBe('Bodyweight must be between 45 and 881 lb.');
  });

  it('nudges bodyweight by one step of the chosen unit and keeps it in range', () => {
    expect(nudgedBodyweightKg(80, 1, 'kg')).toBe(80.1);
    expect(nudgedBodyweightKg(80, -1, 'lb')).toBe(79.92);
    expect(nudgedBodyweightKg(20, -1, 'kg')).toBe(20);
    expect(nudgedBodyweightKg(400, 1, 'kg')).toBe(400);
  });

  it('starts the height fields from the stored centimetres', () => {
    expect(initialHeight(null)).toEqual({ cm: '', feet: '', inches: '' });
    expect(initialHeight(180)).toEqual({ cm: '180', feet: '5', inches: '11' });
  });

  it('reads the height in centimetres from either set of fields', () => {
    expect(heightInCm({ cm: '180', feet: '', inches: '' }, 'kg')).toBe(180);
    expect(heightInCm({ cm: '', feet: '5', inches: '11' }, 'kg')).toBeNull();
    expect(heightInCm({ cm: '', feet: '5', inches: '11' }, 'lb')).toBe(180.3);
    expect(heightInCm({ cm: '', feet: '6', inches: '' }, 'lb')).toBe(182.9);
    expect(heightInCm({ cm: '180', feet: ' ', inches: '' }, 'lb')).toBeNull();
  });

  it('compares only the height fields of the chosen unit', () => {
    const typed = { cm: '180', feet: '5', inches: '11' };
    expect(sameHeightInput(typed, { ...typed, feet: '6' }, 'kg')).toBe(true);
    expect(sameHeightInput(typed, { ...typed, cm: '181' }, 'kg')).toBe(false);
    expect(sameHeightInput(typed, { ...typed, cm: '181' }, 'lb')).toBe(true);
    expect(sameHeightInput(typed, { ...typed, inches: '10' }, 'lb')).toBe(false);
  });

  it('wants whole feet and 0–11 inches', () => {
    const height = (feet: string, inches: string) => ({ cm: '', feet, inches });
    expect(feetAndInchesProblem(height('5', '12'), 'kg')).toBeNull();
    expect(feetAndInchesProblem(height('', ''), 'lb')).toBeNull();
    expect(feetAndInchesProblem(height('5', '11'), 'lb')).toBeNull();
    expect(feetAndInchesProblem(height('6', ''), 'lb')).toBeNull();
    for (const [feet, inches] of [
      ['5', '12'],
      ['5.5', '0'],
      ['-1', '0'],
      ['5', '-1'],
    ])
      expect(feetAndInchesProblem(height(feet, inches), 'lb')).toBe('Enter whole feet and 0–11 inches.');
  });

  it('explains save failures, mapping the database rules to plain text', () => {
    expect(saveProblemText(new Error('training_since_in_future'))).toBe("Training since can't be in the future.");
    expect(saveProblemText({ message: 'birth_year_too_recent', code: 'P0001' })).toBe(
      'You need to be at least 13 to use Gainscape.',
    );
    expect(saveProblemText(new Error('Too many changes in a short time.'))).toBe('Too many changes in a short time.');
    expect(saveProblemText({ message: 'permission denied' })).toBe('permission denied');
    expect(saveProblemText(new Error(''))).toBe('Could not save your profile.');
    expect(saveProblemText({})).toBe('Could not save your profile.');
    expect(saveProblemText('offline')).toBe('Could not save your profile.');
  });
});

describe('previousValues', () => {
  it('picks the current values of the changed fields only', () => {
    const profile = { unitPref: 'kg', effortInputMode: 'rir', showWeights: true } as Parameters<
      typeof previousValues
    >[0];
    expect(previousValues(profile, { unitPref: 'lb' })).toEqual({ unitPref: 'kg' });
    expect(previousValues(profile, { showWeights: false, effortInputMode: 'rpe' })).toEqual({
      showWeights: true,
      effortInputMode: 'rir',
    });
  });
});
