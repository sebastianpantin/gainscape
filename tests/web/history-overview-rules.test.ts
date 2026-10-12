import { describe, expect, it } from 'vitest';
import {
  exerciseListText,
  type OverviewSet,
  recordBadgeText,
  sessionVolumeKg,
  topExerciseNames,
  volumeText,
} from '../../web/src/lib/history-overview-rules.ts';

function liftSet(exerciseName: string, position: number, loadKg = 100, reps = 5, isWarmup = false): OverviewSet {
  return { exerciseName, position, effectiveLoadKg: loadKg, reps, isWarmup };
}

function timedSet(exerciseName: string, position: number): OverviewSet {
  return { exerciseName, position, effectiveLoadKg: null, reps: null, isWarmup: false };
}

describe('topExerciseNames', () => {
  it('ranks exercises by working sets and breaks ties by which came first', () => {
    const sets = [
      liftSet('Squat', 0),
      liftSet('Bench press', 1),
      liftSet('Bench press', 2),
      liftSet('Row', 3),
      liftSet('Squat', 4),
      liftSet('Curl', 5),
    ];
    expect(topExerciseNames(sets, 3)).toEqual({ names: ['Squat', 'Bench press', 'Row'], moreCount: 1 });
  });

  it('does not count warm-up sets towards the ranking', () => {
    const sets = [
      liftSet('Deadlift', 0, 60, 5, true),
      liftSet('Deadlift', 1, 80, 5, true),
      liftSet('Deadlift', 2, 140, 5),
      liftSet('Pull-up', 3),
      liftSet('Pull-up', 4),
    ];
    expect(topExerciseNames(sets, 3)).toEqual({ names: ['Pull-up', 'Deadlift'], moreCount: 0 });
  });

  it('orders by position even when the sets arrive out of order', () => {
    expect(topExerciseNames([liftSet('Row', 3), liftSet('Squat', 0)], 3).names).toEqual(['Squat', 'Row']);
  });

  it('counts timed and distance sets as working sets', () => {
    expect(topExerciseNames([timedSet('Plank', 0), timedSet('Plank', 1), liftSet('Squat', 2)], 3).names).toEqual([
      'Plank',
      'Squat',
    ]);
  });

  it('is empty without sets', () => {
    expect(topExerciseNames([], 3)).toEqual({ names: [], moreCount: 0 });
  });
});

describe('exerciseListText', () => {
  it('joins the top three names and keeps how many more there are apart', () => {
    const sets = ['Squat', 'Bench press', 'Row', 'Curl', 'Dip'].map((name, index) => liftSet(name, index));
    expect(exerciseListText(sets)).toEqual({ names: 'Squat, Bench press, Row', more: '+2 more' });
  });

  it('lists every name with nothing more when there are three or fewer', () => {
    expect(exerciseListText([liftSet('Squat', 0), liftSet('Row', 1)])).toEqual({ names: 'Squat, Row', more: null });
  });

  it('is null without sets', () => {
    expect(exerciseListText([])).toBeNull();
  });
});

describe('sessionVolumeKg', () => {
  it('sums load times reps over working sets only', () => {
    const sets = [liftSet('Squat', 0, 60, 5, true), liftSet('Squat', 1, 100, 5), liftSet('Bench press', 2, 80.5, 8)];
    expect(sessionVolumeKg(sets)).toBe(1144);
  });

  it('ignores sets without a load or reps', () => {
    expect(sessionVolumeKg([timedSet('Plank', 0), liftSet('Squat', 1, 100, 3)])).toBe(300);
  });
});

describe('volumeText', () => {
  it('shows whole kilograms with thousands separators', () => {
    expect(volumeText(4250.4, 'kg')).toBe('4,250 kg volume');
  });

  it('converts to pounds for lb users', () => {
    expect(volumeText(1000, 'lb')).toBe('2,205 lb volume');
  });

  it('is null when nothing was lifted', () => {
    expect(volumeText(0, 'kg')).toBeNull();
  });
});

describe('recordBadgeText', () => {
  it('counts one record as a single PR', () => {
    expect(recordBadgeText(1)).toBe('1 PR');
  });

  it('pluralises several records', () => {
    expect(recordBadgeText(3)).toBe('3 PRs');
  });

  it('is null without records', () => {
    expect(recordBadgeText(0)).toBeNull();
  });
});
