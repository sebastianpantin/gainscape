import { afterAll, describe, expect, it } from 'vitest';
import { isPositionInSchedule, type ProgramDefinition } from '@domain/index.ts';
import { FIVE_THREE_ONE } from '../domain/program-fixtures/five_three_one.ts';
import { GZCLP } from '../domain/program-fixtures/gzclp.ts';
import { MADCOW_5X5 } from '../domain/program-fixtures/madcow_5x5.ts';
import { db } from './local-stack.ts';

afterAll(async () => {
  await db.end();
});

const CANDIDATE_POSITIONS: unknown[] = [
  { cycle: 1, week: 1, day: 'squat' },
  { cycle: 130, week: 4, day: 'press' },
  { cycle: 131, week: 1, day: 'squat' },
  { cycle: 0, week: 1, day: 'squat' },
  { cycle: 1, week: 0, day: 'squat' },
  { cycle: 1, week: 5, day: 'squat' },
  { cycle: 1.5, week: 1, day: 'squat' },
  { cycle: '1', week: 1, day: 'squat' },
  { cycle: 1, week: 1, day: 'mon' },
  { cycle: 1, week: 1, day: 7 },
  { cycle: 1, week: 1, day: 'squat', note: 'extra' },
  { cycle: 1, week: 1, day: 'squat', index: 0 },
  { cycle: 1, week: 1 },
  { week: 1, day: 'mon' },
  { week: 520, day: 'fri' },
  { week: 521, day: 'mon' },
  { week: 1, day: 'sun' },
  { week: true, day: 'mon' },
  { week: null, day: 'mon' },
  { week: 1, day: 'mon', extra: null },
  { week: 1, day: 'mon', cycle: 1 },
  { week: 1, day: 'squat' },
  { day: 'mon' },
  { index: 0 },
  { index: 2079 },
  { index: 2080 },
  { index: -1 },
  { index: 1.5 },
  { index: '0' },
  { index: 0, extra: 'x' },
  { index: 0, week: 1 },
  {},
  null,
  'squat',
  3,
  [],
  [0],
];

async function serverAccepts(definition: ProgramDefinition, position: unknown): Promise<boolean> {
  const [row] = await db`
    select private.is_valid_program_position(
      ${db.json(JSON.parse(JSON.stringify(definition.schedule)))},
      coalesce(${db.json(JSON.parse(JSON.stringify(position)))}, 'null'::jsonb)
    ) as accepted`;
  return row.accepted;
}

describe('is_valid_program_position gives the same verdict as isPositionInSchedule', () => {
  it.each([
    ['5/3/1 cycle', FIVE_THREE_ONE],
    ['Madcow weekly', MADCOW_5X5],
    ['GZCLP rotation', GZCLP],
  ])('for every candidate position on the %s schedule', async (_name, definition) => {
    const verdicts = await Promise.all(
      CANDIDATE_POSITIONS.map(async (position) => ({
        position,
        domain: isPositionInSchedule(definition, position),
        server: await serverAccepts(definition, position),
      })),
    );
    expect(verdicts.filter((verdict) => verdict.domain !== verdict.server)).toEqual([]);
    expect(verdicts.some((verdict) => verdict.server)).toBe(true);
    expect(verdicts.some((verdict) => !verdict.server)).toBe(true);
  });
});
