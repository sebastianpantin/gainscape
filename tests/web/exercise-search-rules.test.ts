import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadCatalogData } from '../../scripts/catalog/load.ts';
import { exerciseSearchMatches, hiddenMatchesText } from '../../web/src/lib/exercises/exercise-search-rules.ts';

const PICKER_LIMIT = 12;

function named(...names: string[]): { name: string }[] {
  return names.map((name) => ({ name }));
}

function matchedNames(exercises: { name: string }[], query: string, limit = 8): string[] {
  return exerciseSearchMatches(exercises, query, limit).shown.map((exercise) => exercise.name);
}

describe('exerciseSearchMatches', () => {
  it('returns nothing for a blank query', () => {
    expect(exerciseSearchMatches(named('Deadlift'), '   ', 8)).toEqual({ shown: [], hiddenCount: 0 });
  });

  it('puts an exact name first, then names that start with the query, then other word starts, then inner matches', () => {
    expect(matchedNames(named('Barbell Curl', 'Recurl Press', 'Curl', 'Curl Machine', 'Cable Curl'), 'curl')).toEqual([
      'Curl',
      'Curl Machine',
      'Cable Curl',
      'Barbell Curl',
      'Recurl Press',
    ]);
  });

  it('ranks shorter names first within a tier so the plain lift beats its variants', () => {
    expect(
      matchedNames(
        named('Smith Machine Bench Press', 'Barbell Bench Press', 'Wide-grip Bench Press', 'Bench Dip'),
        'bench',
      ),
    ).toEqual(['Bench Dip', 'Barbell Bench Press', 'Wide-grip Bench Press', 'Smith Machine Bench Press']);
  });

  it('matches every word of the query in any order', () => {
    expect(matchedNames(named('Incline Dumbbell Curl', 'Dumbbell Curl', 'Incline Push-up'), 'curl incline')).toEqual([
      'Incline Dumbbell Curl',
    ]);
  });

  it('ignores case and surrounding spaces', () => {
    expect(matchedNames(named('Back Squat'), '  BACK squat ')).toEqual(['Back Squat']);
  });

  it('treats hyphens as word breaks and finds names typed without them', () => {
    const names = named('Weighted Push-up', 'Push-up', 'T-bar Row', 'Pull-up');
    expect(matchedNames(names, 'push-up')).toEqual(['Push-up', 'Weighted Push-up']);
    expect(matchedNames(names, 'pushup')).toEqual(['Push-up', 'Weighted Push-up']);
    expect(matchedNames(names, 't bar')).toEqual(['T-bar Row']);
    expect(matchedNames(names, 'pullup')).toEqual(['Pull-up']);
  });

  it('matches a name typed without its word breaks only from the start of a word', () => {
    const names = named('Ay J', 'Bench Row');
    expect(matchedNames(names, 'yj')).toEqual([]);
    expect(matchedNames(names, 'hr')).toEqual([]);
    expect(matchedNames(names, 'aYj')).toEqual(['Ay J']);
    expect(matchedNames(names, 'benchrow')).toEqual(['Bench Row']);
    expect(matchedNames(names, 'chrow')).toEqual([]);
  });

  it('ignores straight and curly apostrophes and accents', () => {
    const names = named("Farmer's Walk", 'Smal bänkpress');
    expect(matchedNames(names, 'farmers')).toEqual(["Farmer's Walk"]);
    expect(matchedNames(names, 'farmer’s')).toEqual(["Farmer's Walk"]);
    expect(matchedNames(names, 'bankpress')).toEqual(['Smal bänkpress']);
    expect(matchedNames(names, 'bänk')).toEqual(['Smal bänkpress']);
  });

  it('counts the matches it leaves out', () => {
    expect(exerciseSearchMatches(named('A Curl', 'B Curl', 'C Curl'), 'curl', 2).hiddenCount).toBe(1);
  });

  it('keeps the specific lift a user types in view when many names share a word', () => {
    const curls = named(
      'Cable Curl',
      'Drag Curl',
      'EZ-bar Curl',
      'Hammer Curl',
      'Reverse Curl',
      'Zottman Curl',
      'Barbell Curl',
      'Preacher Curl',
      'Concentration Curl',
      'Dumbbell Curl',
    );
    expect(matchedNames(curls, 'dumbbell curl')).toEqual(['Dumbbell Curl']);
  });

  it('shows the staple lifts for one-word searches over the real catalog', () => {
    const exercises = loadCatalogData().exercises;
    const shown = (query: string) => matchedNames(exercises, query, PICKER_LIMIT);
    expect(shown('curl')).toEqual(expect.arrayContaining(['Barbell Curl', 'Dumbbell Curl', 'Hammer Curl']));
    expect(shown('bench')).toEqual(expect.arrayContaining(['Barbell Bench Press', 'Dumbbell Bench Press']));
    expect(shown('squat')).toEqual(expect.arrayContaining(['Back Squat', 'Front Squat']));
    expect(shown('row')).toEqual(expect.arrayContaining(['Barbell Row', 'Dumbbell Row']));
    expect(shown('deadlift')[0]).toBe('Deadlift');
  });

  it('never returns more than the limit and only names containing every query word once word breaks are ignored', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[A-Za-z][A-Za-z ]{0,20}$/), { maxLength: 30 }),
        fc.stringMatching(/^[a-z]{1,3}( [a-z]{1,3})?$/),
        fc.integer({ min: 1, max: 10 }),
        (names, query, limit) => {
          const result = exerciseSearchMatches(named(...names), query, limit);
          expect(result.shown.length).toBeLessThanOrEqual(limit);
          expect(result.shown.length + result.hiddenCount).toBeLessThanOrEqual(names.length);
          for (const { name } of result.shown) {
            const nameWithoutBreaks = name.toLowerCase().replaceAll(' ', '');
            for (const word of query.split(' ')) expect(nameWithoutBreaks).toContain(word);
          }
        },
      ),
    );
  });
});

describe('hiddenMatchesText', () => {
  it('names one hidden match in the singular and more in the plural', () => {
    expect(hiddenMatchesText(1)).toBe('1 more match. Keep typing to narrow the list.');
    expect(hiddenMatchesText(4)).toBe('4 more matches. Keep typing to narrow the list.');
  });
});
