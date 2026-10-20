import { type ProgramDefinition } from '@domain/index.ts';
import { type ProgramTemplateRow } from '../../web/src/lib/programs/program-enroll-rules.ts';

const OWNER_ID = '00000000-0000-4000-8000-000000000100';
export const PROGRAM_ID = '00000000-0000-4000-8000-000000000200';
export const SQUAT_ID = '00000000-0000-4000-8000-000000000001';
export const BENCH_ID = '00000000-0000-4000-8000-000000000002';
export const ROW_ID = '00000000-0000-4000-8000-000000000003';

function liftKeyOf(exerciseId: string): string {
  return `x_${exerciseId.replaceAll('-', '')}`;
}

export const CUSTOM_KEY = `custom_${PROGRAM_ID.replaceAll('-', '')}`;
export const SQUAT_LIFT = liftKeyOf(SQUAT_ID);
export const BENCH_LIFT = liftKeyOf(BENCH_ID);
export const ROW_LIFT = liftKeyOf(ROW_ID);

export const CUSTOM_FIVE_BY_FIVE: ProgramDefinition = {
  key: CUSTOM_KEY,
  version: 1,
  name: 'My 5x5',
  source: [],
  lifts: [
    { key: SQUAT_LIFT, name: 'Back Squat', barbell: true },
    { key: BENCH_LIFT, name: 'Barbell Bench Press', barbell: true },
  ],
  inputs: [{ lifts: [SQUAT_LIFT], kinds: ['workingWeight'] }],
  referenceVars: ['workingWeight'],
  initial: [{ kind: 'copy', var: 'workingWeight', from: 'workingWeight' }],
  options: [],
  schedule: {
    kind: 'rotation',
    days: [
      {
        key: 'd0',
        name: 'Day 1',
        slots: [
          {
            id: 'd0_0',
            lift: SQUAT_LIFT,
            role: 'main',
            scheme: { kind: 'repeat', count: 5, reps: 5, load: { kind: 'pct', pct: 1, of: 'workingWeight' } },
          },
          {
            id: 'd0_1',
            lift: BENCH_LIFT,
            role: 'main',
            scheme: { kind: 'repeat', count: 3, reps: 8, load: { kind: 'lastLogged' } },
          },
        ],
      },
    ],
  },
  progression: [
    {
      lift: SQUAT_LIFT,
      var: 'workingWeight',
      trigger: 'afterSession',
      judgedSlots: ['d0_0'],
      onMet: [{ kind: 'increment', by: { kg: 2.5, lb: 5 } }],
      onMiss: [{ kind: 'hold' }],
    },
  ],
} as ProgramDefinition;

export function customTemplateRow(definition: ProgramDefinition = CUSTOM_FIVE_BY_FIVE): ProgramTemplateRow {
  return {
    key: definition.key,
    version: definition.version,
    name: definition.name,
    definition,
    owner_user_id: OWNER_ID,
  };
}
