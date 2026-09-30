import { afterAll, describe, expect, it } from 'vitest';
import { SIM_EXERCISE_SHARES } from '../../scripts/balance/catalog.ts';
import { db } from './local-stack.ts';

afterAll(async () => {
  await db.end();
});

describe('balance sim catalog', () => {
  it('uses the same skill shares as the seeded built-in exercises', async () => {
    const rows = await db`
      select e.key as exercise, s.key as skill, es.share_bp
      from public.exercise_skills es
      join public.exercises e on e.id = es.exercise_id
      join public.skills s on s.id = es.skill_id
      where e.key = any(${Object.keys(SIM_EXERCISE_SHARES)})`;
    const seeded: Record<string, Record<string, number>> = {};
    for (const row of rows) seeded[row.exercise] = { ...seeded[row.exercise], [row.skill]: row.share_bp };
    expect(seeded).toEqual(SIM_EXERCISE_SHARES);
  });
});
