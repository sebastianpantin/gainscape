import { describe, expect, it } from 'vitest';
import { SIM_EXERCISE_SHARES, SIM_SKILLS } from '../../scripts/balance/catalog.ts';
import { loadCatalogData } from '../../scripts/catalog/load.ts';

const catalog = loadCatalogData();

describe('balance sim catalog', () => {
  it('uses the same skill shares as the built-in exercises', () => {
    const catalogShares = Object.fromEntries(
      catalog.exercises
        .filter((exercise) => exercise.key in SIM_EXERCISE_SHARES)
        .map((exercise) => [
          exercise.key,
          Object.fromEntries(exercise.shares.map((share) => [share.skill, share.shareBp])),
        ]),
    );
    expect(catalogShares).toEqual(SIM_EXERCISE_SHARES);
  });

  it('uses the same skills, sort order and combat weights as the catalog', () => {
    expect(SIM_SKILLS.map(({ key, sortOrder, combatWeight }) => ({ key, sortOrder, combatWeight }))).toEqual(
      catalog.skills.map(({ key, sortOrder, combatWeight }) => ({ key, sortOrder, combatWeight })),
    );
  });
});
