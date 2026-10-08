import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type CardioExercise, type ExerciseSkill, type LiftExercise } from '../../web/src/lib/catalog-rules.ts';
import {
  exercisesTrainingSkill,
  pickerRowDetail,
  sharePercentText,
  skillShareRows,
} from '../../web/src/lib/skill-map-rules.ts';

function skill(skillKey: string, shareBasisPoints: number): ExerciseSkill {
  return { skillKey, skillName: skillKey[0].toUpperCase() + skillKey.slice(1), shareBasisPoints };
}

function lift(id: string, skillShares: ExerciseSkill[], overrides: Partial<LiftExercise> = {}): LiftExercise {
  return {
    id,
    name: id,
    equipment: 'barbell',
    modality: 'lift',
    loadType: 'external',
    custom: false,
    archived: false,
    skillShares,
    ...overrides,
  };
}

const bench = lift('Barbell Bench Press', [skill('chest', 7000), skill('shoulders', 2000), skill('arms', 1000)]);

const running: CardioExercise = {
  id: 'run',
  name: 'Running',
  equipment: 'bodyweight',
  modality: 'cardio',
  activity: { paceUnit: 'per_km', referencePaceSPerKm: 360, maxEffort: 'max', shares: [] },
  custom: false,
  archived: false,
  skillShares: [skill('endurance', 10_000)],
};

describe('sharePercentText', () => {
  it('shows a share as a percent, keeping fractions', () => {
    expect(sharePercentText(7000)).toBe('70%');
    expect(sharePercentText(3333)).toBe('33.33%');
    expect(sharePercentText(10_000)).toBe('100%');
  });
});

describe('pickerRowDetail', () => {
  it('lists the skills highest share first after the kind', () => {
    expect(pickerRowDetail(bench)).toEqual({ kind: 'barbell', skills: 'Chest · Shoulders · Arms' });
    expect(pickerRowDetail(running)).toEqual({ kind: 'cardio', skills: 'Endurance' });
  });

  it('shows no skills and no separator for an exercise without shares', () => {
    expect(pickerRowDetail(lift('Old', []))).toEqual({ kind: 'barbell', skills: null });
  });

  it('keeps the labels of an archived custom exercise in the kind', () => {
    const custom = lift('Mine', [skill('back', 10_000)], { equipment: 'cable', custom: true, archived: true });
    expect(pickerRowDetail(custom).kind).toBe('cable (custom) (archived)');
  });
});

describe('skillShareRows', () => {
  it('lists each skill with its percent in share order', () => {
    expect(skillShareRows(bench)).toEqual([
      { name: 'Chest', percent: '70%' },
      { name: 'Shoulders', percent: '20%' },
      { name: 'Arms', percent: '10%' },
    ]);
  });
});

describe('exercisesTrainingSkill', () => {
  it('lists the exercises with a share in the skill, highest share first, then by name', () => {
    const exercises = [
      bench,
      lift('Pec Deck', [skill('chest', 9000), skill('shoulders', 1000)]),
      lift('Cable Fly', [skill('chest', 9000), skill('shoulders', 1000)]),
      lift('Back Squat', [skill('legs', 9000), skill('core', 1000)]),
      lift('Landmine Press', [skill('shoulders', 6000), skill('chest', 4000)], { custom: true }),
      lift('Zero Chest', [skill('chest', 0), skill('back', 10_000)]),
      running,
    ];
    expect(exercisesTrainingSkill(exercises, 'chest')).toEqual([
      { id: 'Cable Fly', name: 'Cable Fly', percent: '90%' },
      { id: 'Pec Deck', name: 'Pec Deck', percent: '90%' },
      { id: 'Barbell Bench Press', name: 'Barbell Bench Press', percent: '70%' },
      { id: 'Landmine Press', name: 'Landmine Press', percent: '40%' },
    ]);
  });

  it('leaves out archived exercises', () => {
    const archived = lift('Landmine Press', [skill('chest', 4000), skill('shoulders', 6000)], { archived: true });
    expect(exercisesTrainingSkill([bench, archived], 'chest').map((entry) => entry.name)).toEqual([
      'Barbell Bench Press',
    ]);
  });

  it('returns nothing for a skill no exercise trains', () => {
    expect(exercisesTrainingSkill([bench, running], 'core')).toEqual([]);
  });

  it('never raises the share down the list and ignores the input order', () => {
    const exerciseArbitrary = fc.record({
      name: fc.stringMatching(/^[a-z]{1,6}$/),
      share: fc.integer({ min: 0, max: 10_000 }),
    });
    fc.assert(
      fc.property(fc.uniqueArray(exerciseArbitrary, { selector: (entry) => entry.name }), (entries) => {
        const exercises = entries.map(({ name, share }) => lift(name, [skill('chest', share)]));
        const listed = exercisesTrainingSkill(exercises, 'chest');
        const shares = listed.map((entry) => entries.find((candidate) => candidate.name === entry.name)!.share);
        expect(shares).toEqual([...shares].sort((a, b) => b - a));
        expect(exercisesTrainingSkill([...exercises].reverse(), 'chest')).toEqual(listed);
      }),
    );
  });
});
