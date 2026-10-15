import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadCatalogData } from '../../scripts/catalog/load.ts';
import { type SubstituteCandidate, similarExercises } from '../../web/src/lib/exercises/substitute-rules.ts';

function lift(name: string, shares: Record<string, number>, archived = false): SubstituteCandidate {
  return {
    id: name,
    name,
    archived,
    skillShares: Object.entries(shares).map(([skillKey, shareBasisPoints]) => ({ skillKey, shareBasisPoints })),
  };
}

function suggestedNames(original: SubstituteCandidate, candidates: SubstituteCandidate[], limit = 6): string[] {
  return similarExercises(original, candidates, limit).map((exercise) => exercise.name);
}

function catalogLifts(): SubstituteCandidate[] {
  return loadCatalogData()
    .exercises.filter((exercise) => exercise.modality === 'lift' && exercise.measure === 'reps')
    .map((exercise) => ({
      id: exercise.key,
      name: exercise.name,
      archived: false,
      skillShares: exercise.shares.map((share) => ({ skillKey: share.skill, shareBasisPoints: share.shareBp })),
    }));
}

function catalogSuggestions(name: string): string[] {
  const lifts = catalogLifts();
  const original = lifts.find((exercise) => exercise.name === name);
  if (!original) throw new Error(`${name} is not a catalog lift`);
  return suggestedNames(original, lifts);
}

const backSquat = lift('Back Squat', { legs: 9000, core: 1000 });

describe('similarExercises', () => {
  it('suggests only exercises whose largest share is a top skill of the original', () => {
    const benchPress = lift('Bench Press', { chest: 7000, shoulders: 2000, arms: 1000 });
    const legPress = lift('Leg Press', { legs: 10000 });
    const plank = lift('Plank Row', { core: 6000, legs: 4000 });
    expect(suggestedNames(backSquat, [benchPress, legPress, plank])).toEqual(['Leg Press']);
  });

  it('never suggests the original exercise or an archived one', () => {
    const archivedSquat = lift('Old Squat', { legs: 9000, core: 1000 }, true);
    expect(suggestedNames(backSquat, [backSquat, archivedSquat])).toEqual([]);
  });

  it('puts exercises that share a movement word with the original first, ignoring equipment words', () => {
    const hipThrust = lift('Hip Thrust', { legs: 9000, core: 1000 });
    const gobletSquat = lift('Goblet Squat', { legs: 8000, core: 2000 });
    const barbellLunge = lift('Barbell Lunge', { legs: 9000, core: 1000 });
    expect(
      suggestedNames(lift('Barbell Squat', { legs: 9000, core: 1000 }), [hipThrust, barbellLunge, gobletSquat]),
    ).toEqual(['Goblet Squat', 'Barbell Lunge', 'Hip Thrust']);
  });

  it('ranks by overlap of skill shares within each group, then by name', () => {
    const frontSquat = lift('Front Squat', { legs: 8500, core: 1500 });
    const boxSquat = lift('Box Squat', { legs: 9000, core: 1000 });
    const zercherSquat = lift('Zercher Squat', { legs: 7000, back: 2000, core: 1000 });
    const beltSquat = lift('Belt Squat', { legs: 10000 });
    expect(suggestedNames(backSquat, [zercherSquat, frontSquat, boxSquat, beltSquat])).toEqual([
      'Box Squat',
      'Front Squat',
      'Belt Squat',
      'Zercher Squat',
    ]);
  });

  it('treats every skill tied for the largest share as a top skill, whatever order the shares come in', () => {
    const lunge = lift('Split Lunge', { core: 5000, legs: 5000 });
    const reversedLunge = lift('Walking Lunge', { legs: 5000, core: 5000 });
    const plank = lift('Plank', { core: 10000 });
    expect(suggestedNames(lunge, [plank, reversedLunge, backSquat])).toEqual(['Walking Lunge', 'Back Squat', 'Plank']);
  });

  it('does not treat setup words such as leg or seated as a shared movement', () => {
    const legPress = lift('Leg Press', { legs: 10000 });
    const seatedLegCurl = lift('Seated Leg Curl', { legs: 10000 });
    const hackPress = lift('Hack Press', { legs: 9000, core: 1000 });
    expect(suggestedNames(legPress, [seatedLegCurl, hackPress])).toEqual(['Hack Press', 'Seated Leg Curl']);
  });

  it('suggests nothing for an exercise without skill shares', () => {
    expect(suggestedNames(lift('Mystery Lift', {}), [backSquat])).toEqual([]);
  });

  it('suggests the plain variations of the main catalog lifts first', () => {
    expect(catalogSuggestions('Back Squat')).toEqual(expect.arrayContaining(['Box Squat', 'Goblet Squat']));
    expect(catalogSuggestions('Back Squat')).not.toContain('Hip Thrust');
    expect(catalogSuggestions('Barbell Bench Press')).toEqual(
      expect.arrayContaining(['Dumbbell Bench Press', 'Machine Chest Press']),
    );
    expect(catalogSuggestions('Barbell Row')).toEqual(expect.arrayContaining(['Pendlay Row', 'Dumbbell Row']));
    expect(catalogSuggestions('Barbell Curl')).toEqual(expect.arrayContaining(['Dumbbell Curl', 'Cable Curl']));
    expect(catalogSuggestions('Barbell Curl')).not.toContain('Cable Triceps Pushdown');
    expect(catalogSuggestions('Deadlift')[0]).toBe('Deficit Deadlift');
  });

  it('never returns more than the limit, the original, a duplicate or an exercise without a shared top skill', () => {
    const lifts = catalogLifts();
    fc.assert(
      fc.property(fc.constantFrom(...lifts), fc.integer({ min: 0, max: 10 }), (original, limit) => {
        const suggested = similarExercises(original, lifts, limit);
        const topSkills = (exercise: SubstituteCandidate) => {
          const largest = Math.max(...exercise.skillShares.map((share) => share.shareBasisPoints));
          return exercise.skillShares
            .filter((share) => share.shareBasisPoints === largest)
            .map((share) => share.skillKey);
        };
        expect(suggested.length).toBeLessThanOrEqual(limit);
        expect(new Set(suggested.map((exercise) => exercise.id)).size).toBe(suggested.length);
        expect(suggested.map((exercise) => exercise.id)).not.toContain(original.id);
        for (const exercise of suggested)
          expect(topSkills(exercise).some((skill) => topSkills(original).includes(skill))).toBe(true);
      }),
    );
  });
});
