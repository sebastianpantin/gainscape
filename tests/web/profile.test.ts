import { describe, expect, it } from 'vitest';
import {
  ageFrom,
  bodyweightRangeInUnit,
  cooldownStartFor,
  formatDay,
  initialHeight,
  initialsFor,
  latestBirthYear,
  nextTimezoneChangeAt,
  nudgedBodyweightKg,
  optionalNumber,
  parsedBio,
  parsedBirthYear,
  parsedBodyweightKg,
  parsedHeightCm,
  parsedTrainingSince,
  previousValues,
  sameHeightInput,
  saveProblemText,
} from '../../web/src/lib/profile/profile-rules.ts';

const now = new Date('2026-09-30T12:00:00Z');

const ok = <T>(value: T) => ({ kind: 'ok', value });
const problem = (text: string) => ({ kind: 'problem', problem: text });

describe('profile validation', () => {
  it('reads blanks of optional fields as none', () => {
    expect(parsedBio('')).toEqual(ok(null));
    expect(parsedHeightCm({ cm: '', feet: '', inches: '' }, 'kg')).toEqual(ok(null));
    expect(parsedBirthYear('', now)).toEqual(ok(null));
    expect(parsedTrainingSince(' ', now)).toEqual(ok(null));
  });

  it('bounds height to 100–250 cm', () => {
    const cm = (typed: string) => parsedHeightCm({ cm: typed, feet: '', inches: '' }, 'kg');
    expect(cm('99')).toEqual(problem('Height must be between 100 and 250 cm.'));
    expect(cm('181.5')).toEqual(ok(181.5));
    expect(cm('251')).toEqual(problem('Height must be between 100 and 250 cm.'));
  });

  it('requires people to be at least 13', () => {
    expect(latestBirthYear(now)).toBe(2013);
    expect(parsedBirthYear('2013', now)).toEqual(ok(2013));
    expect(parsedBirthYear('2014', now)).toEqual(problem('Birth year must be between 1900 and 2013.'));
    expect(parsedBirthYear('1899', now)).toEqual(problem('Birth year must be between 1900 and 2013.'));
    expect(parsedBirthYear('1990.5', now)).toEqual(problem('Enter a year like 1990.'));
  });

  it('does not allow training to start in the future', () => {
    expect(parsedTrainingSince('2026', now)).toEqual(ok(2026));
    expect(parsedTrainingSince('2027', now)).toEqual(problem('Training since must be between 1950 and 2026.'));
    expect(parsedTrainingSince('1949', now)).toEqual(problem('Training since must be between 1950 and 2026.'));
    expect(parsedTrainingSince('2019.5', now)).toEqual(problem('Enter a year like 2019.'));
  });

  it('limits bios to 80 characters on one line without control characters', () => {
    expect(parsedBio('x'.repeat(80))).toEqual(ok('x'.repeat(80)));
    expect(parsedBio('x'.repeat(81))).toEqual(problem('Bio can be at most 80 characters.'));
    expect(parsedBio('two\nlines')).toEqual(problem("Bio can't contain line breaks or control characters."));
  });

  it('checks the trimmed bio the save sends', () => {
    expect(parsedBio(` ${'x'.repeat(80)} `)).toEqual(ok('x'.repeat(80)));
    expect(parsedBio('lifts\n')).toEqual(ok('lifts'));
  });

  it('counts bio length in characters like the server, so an emoji is one character', () => {
    expect(parsedBio('\u{1F3CB}'.repeat(80)).kind).toBe('ok');
    expect(parsedBio('\u{1F3CB}'.repeat(81))).toEqual(problem('Bio can be at most 80 characters.'));
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
    expect(optionalNumber('5,5')).toBe(5.5);
  });

  it('validates the same text the save reads: a plus sign is refused, a comma height is read', () => {
    expect(parsedBirthYear('+1990', new Date('2026-11-02T12:00:00Z'))).toEqual(problem('Enter a year like 1990.'));
    expect(parsedHeightCm({ cm: '180,5', feet: '', inches: '' }, 'kg')).toEqual(ok(180.5));
    expect(optionalNumber('abc')).toBeNaN();
  });

  it('gives the bodyweight range in whole units of the chosen unit', () => {
    expect(bodyweightRangeInUnit('kg')).toEqual({ lowest: 20, highest: 400 });
    expect(bodyweightRangeInUnit('lb')).toEqual({ lowest: 45, highest: 881 });
  });

  it('reads a typed bodyweight in the chosen unit as kilograms', () => {
    const outOfKgRange = problem('Bodyweight must be between 20 and 400 kg.');
    expect(parsedBodyweightKg('', 'kg')).toEqual(ok(null));
    expect(parsedBodyweightKg(' ', 'kg')).toEqual(ok(null));
    expect(parsedBodyweightKg('80', 'kg')).toEqual(ok(80));
    expect(parsedBodyweightKg('19', 'kg')).toEqual(outOfKgRange);
    expect(parsedBodyweightKg('heavy', 'kg')).toEqual(outOfKgRange);
    expect(parsedBodyweightKg('45', 'lb').kind).toBe('ok');
    expect(parsedBodyweightKg('44', 'lb')).toEqual(problem('Bodyweight must be between 45 and 881 lb.'));
  });

  it('reads a comma as the decimal point of a bodyweight', () => {
    expect(parsedBodyweightKg('80,5', 'kg')).toEqual(ok(80.5));
    expect(parsedBodyweightKg('80,5,1', 'kg')).toEqual(problem('Bodyweight must be between 20 and 400 kg.'));
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
    expect(parsedHeightCm({ cm: '180', feet: '', inches: '' }, 'kg')).toEqual(ok(180));
    expect(parsedHeightCm({ cm: '', feet: '5', inches: '11' }, 'kg')).toEqual(ok(null));
    expect(parsedHeightCm({ cm: '', feet: '5', inches: '11' }, 'lb')).toEqual(ok(180.3));
    expect(parsedHeightCm({ cm: '', feet: '6', inches: '' }, 'lb')).toEqual(ok(182.9));
    expect(parsedHeightCm({ cm: '180', feet: ' ', inches: '' }, 'lb')).toEqual(ok(null));
    expect(parsedHeightCm({ cm: '', feet: '3', inches: '' }, 'lb')).toEqual(
      problem('Height must be between 100 and 250 cm.'),
    );
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
    expect(parsedHeightCm(height('5', '12'), 'kg')).toEqual(ok(null));
    expect(parsedHeightCm(height('5', '11'), 'lb').kind).toBe('ok');
    for (const [feet, inches] of [
      ['5', '12'],
      ['5.5', '0'],
      ['-1', '0'],
      ['5', '-1'],
    ])
      expect(parsedHeightCm(height(feet, inches), 'lb')).toEqual(problem('Enter whole feet and 0–11 inches.'));
  });

  it('reads feet and inches like every other number field', () => {
    const height = (feet: string, inches: string) => ({ cm: '', feet, inches });
    expect(parsedHeightCm(height('0x5', ''), 'lb')).toEqual(problem('Enter whole feet and 0–11 inches.'));
    expect(parsedHeightCm(height('6', '1e1'), 'lb')).toEqual(problem('Enter whole feet and 0–11 inches.'));
    expect(parsedHeightCm(height('5,0', '11'), 'lb')).toEqual(ok(180.3));
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
