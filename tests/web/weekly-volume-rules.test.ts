import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BODY_SKILLS } from '../../web/src/lib/progress/recovery-rules.ts';
import {
  type VolumeExercise,
  type VolumeSet,
  volumeAmountText,
  volumeBand,
  volumeBarFraction,
  volumeSetsLabel,
  volumeSetsText,
  VOLUME_BAND_TEXT,
  VOLUME_TARGET,
  weeklySetsByMuscle,
  weekStartIn,
} from '../../web/src/lib/progress/weekly-volume-rules.ts';

const WEEK_START = '2026-10-12';

function share(skillKey: string, shareBasisPoints: number) {
  return { skillKey, skillName: skillKey, shareBasisPoints };
}

const EXERCISES = new Map<string, VolumeExercise>([
  [
    'bench',
    { name: 'Barbell Bench Press', skillShares: [share('chest', 7000), share('shoulders', 2000), share('arms', 1000)] },
  ],
  ['fly', { name: 'Cable Fly', skillShares: [share('chest', 10_000)] }],
  ['run', { name: 'Running', skillShares: [share('endurance', 10_000)] }],
]);

function sets(count: number, exerciseId: string, localDate = WEEK_START): VolumeSet[] {
  return Array.from({ length: count }, () => ({ exerciseId, localDate }));
}

describe('weeklySetsByMuscle', () => {
  it('splits one bench set into 0.7 chest, 0.2 shoulders and 0.1 arms', () => {
    const volume = weeklySetsByMuscle(sets(1, 'bench'), EXERCISES, WEEK_START);
    expect(volume.chest.sets).toBe(0.7);
    expect(volume.shoulders.sets).toBe(0.2);
    expect(volume.arms.sets).toBe(0.1);
    expect(volume.legs.sets).toBe(0);
  });

  it('counts sets from the week start on and leaves out the Sunday before', () => {
    const volume = weeklySetsByMuscle(
      [...sets(2, 'fly', '2026-10-11'), ...sets(3, 'fly', WEEK_START)],
      EXERCISES,
      WEEK_START,
    );
    expect(volume.chest.sets).toBe(3);
  });

  it('ignores sets of exercises missing from the list and of exercises that train no muscle', () => {
    const volume = weeklySetsByMuscle([...sets(4, 'gone'), ...sets(4, 'run')], EXERCISES, WEEK_START);
    expect(BODY_SKILLS.map((skill) => volume[skill].sets)).toEqual(Array(BODY_SKILLS.length).fill(0));
    expect(volume).not.toHaveProperty('endurance');
  });

  it('lists the contributing exercises with their fractional sets, most first', () => {
    const volume = weeklySetsByMuscle([...sets(10, 'bench'), ...sets(3, 'fly')], EXERCISES, WEEK_START);
    expect(volume.chest).toEqual({
      sets: 10,
      band: 'within',
      contributions: [
        { exerciseId: 'bench', name: 'Barbell Bench Press', sets: 7 },
        { exerciseId: 'fly', name: 'Cable Fly', sets: 3 },
      ],
    });
    expect(volume.legs.contributions).toEqual([]);
  });

  it('keeps every set of a muscle: the total over muscles is the body-skill share of every set', () => {
    const exerciseIds = [...EXERCISES.keys(), 'gone'];
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...exerciseIds), { maxLength: 60 }), (ids) => {
        const volume = weeklySetsByMuscle(
          ids.map((exerciseId) => ({ exerciseId, localDate: WEEK_START })),
          EXERCISES,
          WEEK_START,
        );
        const expected = ids
          .flatMap((id) => EXERCISES.get(id)?.skillShares ?? [])
          .filter((skillShare) => (BODY_SKILLS as readonly string[]).includes(skillShare.skillKey))
          .reduce((total, skillShare) => total + skillShare.shareBasisPoints / 10_000, 0);
        const total = BODY_SKILLS.reduce((sum, skill) => sum + volume[skill].sets, 0);
        expect(total).toBeCloseTo(expected, 9);
      }),
    );
  });

  it('never lowers a muscle when a set is added', () => {
    const exerciseIds = [...EXERCISES.keys()];
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...exerciseIds), { maxLength: 40 }),
        fc.constantFrom(...exerciseIds),
        (ids, added) => {
          const before = weeklySetsByMuscle(
            ids.map((exerciseId) => ({ exerciseId, localDate: WEEK_START })),
            EXERCISES,
            WEEK_START,
          );
          const after = weeklySetsByMuscle(
            [...ids, added].map((exerciseId) => ({ exerciseId, localDate: WEEK_START })),
            EXERCISES,
            WEEK_START,
          );
          for (const skill of BODY_SKILLS) expect(after[skill].sets).toBeGreaterThanOrEqual(before[skill].sets);
        },
      ),
    );
  });
});

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

describe('volumeBand', () => {
  it('is below under 10 sets, within from 10 to 20 inclusive and above over 20', () => {
    expect(VOLUME_TARGET).toEqual({ min: 10, max: 20 });
    expect(volumeBand(9.9)).toBe('below');
    expect(volumeBand(10)).toBe('within');
    expect(volumeBand(20)).toBe('within');
    expect(volumeBand(20.1)).toBe('above');
  });
});

describe('volumeAmountText', () => {
  it('shows progress toward the target below it and the plain count from the target on', () => {
    expect(volumeAmountText(0)).toBe('0 of 10 sets');
    expect(volumeAmountText(2.7)).toBe('2.7 of 10 sets');
    expect(volumeAmountText(9.9)).toBe('9.9 of 10 sets');
    expect(volumeAmountText(10)).toBe('10 sets');
    expect(volumeAmountText(22.5)).toBe('22.5 sets');
  });
});

describe('VOLUME_BAND_TEXT', () => {
  it('names the band only once the target is reached, so a fresh week reads as progress', () => {
    expect(VOLUME_BAND_TEXT).toEqual({ below: null, within: 'within target', above: 'above target' });
  });
});

describe('volumeBarFraction', () => {
  it('scales the bar to 25 sets, so the 10 to 20 band sits at 40% to 80%, and caps it there', () => {
    expect(volumeBarFraction(0)).toBe(0);
    expect(volumeBarFraction(VOLUME_TARGET.min)).toBe(0.4);
    expect(volumeBarFraction(VOLUME_TARGET.max)).toBe(0.8);
    expect(volumeBarFraction(40)).toBe(1);
  });
});

describe('volumeSetsText', () => {
  it('shows one decimal and drops a trailing .0', () => {
    expect(volumeSetsText(12.5)).toBe('12.5');
    expect(volumeSetsText(3)).toBe('3');
    expect(volumeSetsText(0.7000000000000001)).toBe('0.7');
    expect(volumeSetsText(2.96)).toBe('3');
  });
});

describe('volumeSetsLabel', () => {
  it('says set for exactly one and sets otherwise', () => {
    expect(volumeSetsLabel(1)).toBe('1 set');
    expect(volumeSetsLabel(0.7)).toBe('0.7 sets');
    expect(volumeSetsLabel(0)).toBe('0 sets');
  });
});
