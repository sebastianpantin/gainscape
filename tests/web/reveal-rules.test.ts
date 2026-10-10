import { describe, expect, it } from 'vitest';
import type { CardioExercise, LiftExercise } from '../../web/src/lib/catalog-rules.ts';
import {
  challengeBonusText,
  challengeFailReason,
  challengeHeadline,
  challengeNotAppliedText,
  describeRecord,
  gearBonusText,
  unappliedChangesText,
} from '../../web/src/features/summary/reveal-rules.ts';

const base = { equipment: 'barbell', custom: false, archived: false, skillShares: [] };
const dip: LiftExercise = { ...base, id: 'dip', name: 'Weighted Dip', modality: 'lift', loadType: 'bodyweight_plus' };
const swim: CardioExercise = {
  ...base,
  id: 'swim',
  name: 'Swimming',
  modality: 'cardio',
  activity: { paceUnit: 'per_100m', referencePaceSPerKm: null, maxEffort: 'max', shares: [] },
};

const repMax = {
  exerciseId: 'dip',
  kind: 'rep_max' as const,
  setId: 'set-1',
  reps: 5,
  loadKg: 20,
  previousLoadKg: 15,
  previousReps: null,
};

describe('describeRecord', () => {
  it('shows a rep max with the load type of the exercise and the beaten load', () => {
    expect(describeRecord(repMax, dip, 'kg')).toEqual({
      headline: 'Weighted Dip: 5RM +20 kg',
      previous: '(was +15 kg)',
    });
  });

  it('marks a first rep max and falls back to an external load for an unknown exercise', () => {
    expect(describeRecord({ ...repMax, previousLoadKg: null }, undefined, 'kg')).toEqual({
      headline: 'Exercise: 5RM 20 kg',
      previous: '(first record)',
    });
  });

  it('shows a bodyweight reps record', () => {
    const record = { ...repMax, kind: 'bodyweight_reps' as const, reps: 12, loadKg: null, previousReps: 10 };
    expect(describeRecord(record, dip, 'kg')).toEqual({ headline: 'Weighted Dip: 12 reps', previous: '(was 10)' });
    expect(describeRecord({ ...record, previousReps: null }, dip, 'kg').previous).toBe('(first record)');
  });

  it('shows cardio gains in the distance unit of the activity', () => {
    const record = {
      kind: 'cardio' as const,
      exerciseId: 'swim',
      setId: 'bout-1',
      records: [{ kind: 'distance' as const, value: 1500, previous: 1000 }],
    };
    expect(describeRecord(record, swim, 'kg')).toEqual({ headline: 'Swimming:', previous: '1500 m (was 1000 m)' });
    expect(describeRecord(record, undefined, 'kg')).toEqual({ headline: 'Exercise:', previous: '1.5 km (was 1 km)' });
  });
});

describe('gearBonusText', () => {
  it('shows the gear bonus of a skill with grouped thousands', () => {
    expect(gearBonusText({ gearBonusBySkill: { core: 1234 } }, 'core')).toBe('Gear bonus +1,234 XP');
  });

  it('shows nothing for a skill without a bonus or a summary from before gear', () => {
    expect(gearBonusText({ gearBonusBySkill: { core: 12 } }, 'chest')).toBeNull();
    expect(gearBonusText({ gearBonusBySkill: { core: 0 } }, 'core')).toBeNull();
    expect(gearBonusText({}, 'core')).toBeNull();
  });
});

describe('challenge lines', () => {
  const DEADLIFT = 'deadlift-id';
  const PULL_UP = 'pull-up-id';
  const names: Record<string, string> = { [DEADLIFT]: 'Deadlift', [PULL_UP]: 'Pull-up' };
  const nameOf = (exerciseId: string) => names[exerciseId] ?? 'Exercise';
  const prescription = {
    kind: 'prescription' as const,
    groups: [
      {
        rounds: 5,
        exercises: [
          { exerciseId: DEADLIFT, reps: 5, pct: 70 },
          { exerciseId: PULL_UP, reps: 5, pct: null },
        ],
      },
    ],
  };
  const planned = {
    challengeId: 'challenge-dl',
    name: 'Deadlift and Pull-up',
    definition: prescription,
    targetLoadsKg: { [DEADLIFT]: 100, [PULL_UP]: null },
  };
  const tenTon = {
    challengeId: 'challenge-tt',
    name: 'Ten-Ton Day',
    definition: { kind: 'volume' as const, metric: 'kg' as const, target: 10000, exerciseId: null, minPct: null },
    targetLoadsKg: {},
  };

  function judged(passed: boolean, targetLoadsKg: Record<string, number | null> = { [DEADLIFT]: 97.5 }) {
    return {
      challenge: {
        challengeId: 'challenge-dl',
        key: 'deadlift_and_pull_up',
        name: 'Deadlift and Pull-up',
        passed,
        targetLoadsKg,
      },
    };
  }

  it('heads the reveal with the outcome of the challenge', () => {
    expect(challengeHeadline(judged(true))).toBe('Challenge complete: Deadlift and Pull-up');
    expect(challengeHeadline(judged(false))).toBe('Challenge failed: Deadlift and Pull-up');
    expect(challengeHeadline({ challenge: null })).toBeNull();
    expect(challengeHeadline({})).toBeNull();
  });

  it('shows the challenge bonus of a skill', () => {
    expect(challengeBonusText({ challengeBonusBySkill: { back: 1250 } }, 'back')).toBe('Challenge bonus +1,250 XP');
    expect(challengeBonusText({ challengeBonusBySkill: { back: 250 } }, 'arms')).toBeNull();
    expect(challengeBonusText({ challengeBonusBySkill: { back: 0 } }, 'back')).toBeNull();
    expect(challengeBonusText({}, 'back')).toBeNull();
  });

  it('explains a fail when the target rose above the planned load since the start', () => {
    expect(challengeFailReason(judged(false, { [DEADLIFT]: 105, [PULL_UP]: null }), planned, nameOf, 'kg')).toBe(
      'Target rose since you started: Deadlift 105 kg (planned 100 kg)',
    );
  });

  it('blames the logged sets of a prescription challenge when the target stayed within the plan', () => {
    expect(challengeFailReason(judged(false, { [DEADLIFT]: 97.5, [PULL_UP]: null }), planned, nameOf, 'kg')).toBe(
      'Not every prescribed set reached its reps and load',
    );
  });

  it('blames the volume of a volume challenge', () => {
    expect(challengeFailReason(judged(false, {}), tenTon, nameOf, 'kg')).toBe('Volume target not reached');
  });

  it('falls back to a plain reason without the planned challenge', () => {
    expect(challengeFailReason(judged(false), null, nameOf, 'kg')).toBe('Challenge target not reached');
  });

  it('gives no reason for a pass or a workout without a challenge', () => {
    expect(challengeFailReason(judged(true), planned, nameOf, 'kg')).toBeNull();
    expect(challengeFailReason({ challenge: null }, planned, nameOf, 'kg')).toBeNull();
  });

  it('tells the lifter a planned challenge was not applied, without guessing why the server skipped it', () => {
    expect(challengeNotAppliedText({ challenge: null }, planned)).toBe(
      "Challenge not applied: Deadlift and Pull-up couldn't be applied to this workout, so it was saved as a normal workout.",
    );
    expect(challengeNotAppliedText({}, planned)).toBe(
      "Challenge not applied: Deadlift and Pull-up couldn't be applied to this workout, so it was saved as a normal workout.",
    );
  });

  it('tells the lifter a planned challenge was not applied to a workout saved to history only', () => {
    expect(challengeNotAppliedText({ challenge: null, historyOnly: true }, planned)).toBe(
      'Challenge not applied: a workout older than 7 days is saved to history only. Your scroll was kept.',
    );
  });

  it('says nothing when the challenge was applied or none was planned', () => {
    expect(challengeNotAppliedText(judged(false), planned)).toBeNull();
    expect(challengeNotAppliedText(judged(true), planned)).toBeNull();
    expect(challengeNotAppliedText({ challenge: null }, null)).toBeNull();
  });
});

describe('unappliedChangesText', () => {
  it('tells the lifter that the copy on this device differs from the saved workout and was not applied', () => {
    expect(unappliedChangesText({ storedContentDiffers: true })).toBe(
      "This workout was already saved, and the saved version differs from this device's copy, so this copy was not applied. Check it in History.",
    );
  });

  it('does not send the lifter to History for a workout too old to edit', () => {
    expect(unappliedChangesText({ storedContentDiffers: true, historyOnly: true })).toBe(
      "This workout was already saved, and the saved version differs from this device's copy, so this copy was not applied.",
    );
  });

  it('says nothing when the server stored what was sent', () => {
    expect(unappliedChangesText({})).toBeNull();
  });
});
