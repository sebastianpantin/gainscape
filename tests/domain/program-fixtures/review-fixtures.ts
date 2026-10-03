import {
  DEFAULT_ROUNDING,
  type FactSet,
  type ProgramDefinition,
  type ProgramEnrollment,
  type SlotDecl,
} from '@domain/index.ts';
import { setAsPrescribed } from './facts.ts';
import { LINEAR_AFTER_SESSION } from './linear_after_session.ts';

function pctSlot(id: string, lift: string, of: 'tm' | 'top', count = 3): SlotDecl {
  return {
    id,
    lift,
    role: 'main',
    scheme: { kind: 'repeat', count, reps: 5, load: { kind: 'pct', pct: 1, of } },
  };
}

export function metSets(slotId: string, exerciseId: string, count = 3, lastSetReps = 5): FactSet[] {
  return Array.from({ length: count }, (_, index) =>
    setAsPrescribed(
      exerciseId,
      `${slotId}:${index}`,
      { weightKg: 100, reps: 5 },
      index === count - 1 ? lastSetReps : undefined,
    ),
  );
}

export function kgEnrollment(
  id: string,
  inputs: ProgramEnrollment['inputs'],
  bindings: ProgramEnrollment['bindings'],
): ProgramEnrollment {
  return { id, unit: 'kg', options: {}, bindings, inputs, rounding: DEFAULT_ROUNDING.kg };
}

export const TWO_RULES_ONE_LIFT: ProgramDefinition = {
  key: 'synthetic_two_rules_one_lift',
  version: 1,
  name: 'Synthetic weekly rule on A, after-session rule on B',
  source: ['synthetic test fixture'],
  lifts: [{ key: 'squat', name: 'Squat', category: 'lower' }],
  inputs: [{ lifts: ['squat'], kinds: ['tm'] }],
  referenceVars: ['tm'],
  initial: [{ kind: 'copy', var: 'tm', from: 'tm' }],
  options: [],
  schedule: {
    kind: 'weekly',
    days: [
      { key: 'a', name: 'Day A', slots: [pctSlot('a-squat', 'squat', 'tm')] },
      { key: 'b', name: 'Day B', slots: [pctSlot('b-squat', 'squat', 'tm')] },
    ],
  },
  progression: [
    {
      lift: 'squat',
      var: 'tm',
      trigger: 'endOfWeek',
      judgedSlots: ['a-squat'],
      onMet: [{ kind: 'increment', by: { kg: 5, lb: 10 } }],
      onMiss: [{ kind: 'hold' }],
    },
    {
      lift: 'squat',
      var: 'tm',
      trigger: 'afterSession',
      judgedSlots: ['b-squat'],
      onMet: [{ kind: 'increment', by: { kg: 2.5, lb: 5 } }],
      onMiss: [{ kind: 'hold' }],
    },
  ],
};

export const UNSUPPORTED_JUDGED_SCHEMES: ProgramDefinition = {
  key: 'synthetic_unsupported_judged_schemes',
  version: 1,
  name: 'Synthetic judged slots whose set scheme cannot be resolved',
  source: ['synthetic test fixture'],
  lifts: [
    { key: 'bench', name: 'Bench press', category: 'upper' },
    { key: 'squat', name: 'Squat', category: 'lower' },
  ],
  inputs: [{ lifts: ['bench', 'squat'], kinds: ['tm'] }],
  referenceVars: ['tm'],
  initial: [{ kind: 'copy', var: 'tm', from: 'tm' }],
  options: [],
  weekTables: {
    main: [
      {
        sets: [
          { pct: 0.7, reps: 5 },
          { pct: 0.8, reps: 5 },
          { pct: 0.9, reps: 5 },
        ],
      },
    ],
  },
  schedule: {
    kind: 'weekly',
    days: [
      {
        key: 'a',
        name: 'Day A',
        slots: [
          { id: 'a-bench', lift: 'bench', role: 'main', scheme: { kind: 'weekTable', table: 'main', of: 'tm' } },
          { id: 'a-squat', lift: 'squat', role: 'main', scheme: { kind: 'weekTable', table: 'main', of: 'tm' } },
        ],
      },
    ],
  },
  progression: [
    {
      lift: 'bench',
      var: 'tm',
      trigger: 'afterSession',
      judgedSlots: ['a-bench'],
      onMet: [{ kind: 'increment', by: { kg: 2.5, lb: 5 } }],
      onMiss: [{ kind: 'tmReset', pct: 0.1 }],
    },
    {
      lift: 'squat',
      var: 'tm',
      trigger: 'afterSession',
      judgedSlots: ['a-squat'],
      onMet: [{ kind: 'increment', by: { kg: 5, lb: 10 } }],
      onMiss: [{ kind: 'tmReset', pct: 0.1 }],
    },
  ],
};

export const LINEAR_DELOAD_AFTER_SESSION: ProgramDefinition = {
  ...structuredClone(LINEAR_AFTER_SESSION),
  key: 'synthetic_linear_deload_after_session',
  name: 'Synthetic after-session with a 10% deload on a miss',
  progression: [
    {
      ...structuredClone(LINEAR_AFTER_SESSION.progression[0]),
      onMiss: [{ kind: 'tmReset', pct: 0.1 }],
    },
  ],
};

export const WEEK_AND_CYCLE_RULES: ProgramDefinition = {
  key: 'synthetic_week_and_cycle_rules',
  version: 1,
  name: 'Synthetic two-week cycle, weekly bench, cycle squat',
  source: ['synthetic test fixture'],
  lifts: [
    { key: 'squat', name: 'Squat', category: 'lower' },
    { key: 'bench', name: 'Bench press', category: 'upper' },
  ],
  inputs: [
    { lifts: ['squat'], kinds: ['tm'] },
    { lifts: ['bench'], kinds: ['tm'] },
  ],
  referenceVars: ['tm', 'top'],
  initial: [
    { kind: 'copy', var: 'tm', from: 'tm' },
    { kind: 'copy', var: 'top', from: 'tm' },
  ],
  options: [],
  schedule: {
    kind: 'cycle',
    weeksPerCycle: 2,
    days: [
      { key: 'a', name: 'Day A', slots: [pctSlot('a-squat', 'squat', 'tm'), pctSlot('a-bench', 'bench', 'top')] },
      { key: 'b', name: 'Day B', slots: [pctSlot('b-squat', 'squat', 'tm')] },
    ],
  },
  progression: [
    {
      lift: 'squat',
      var: 'tm',
      trigger: 'endOfCycle',
      judgedSlots: ['a-squat', 'b-squat'],
      onMet: [{ kind: 'increment', by: { kg: 5, lb: 10 } }],
      onMiss: [{ kind: 'tmReset', pct: 0.1 }],
    },
    {
      lift: 'bench',
      var: 'top',
      trigger: 'endOfWeek',
      judgedSlots: ['a-bench'],
      onMet: [{ kind: 'increment', by: { kg: 2.5, lb: 5 } }],
      onMiss: [{ kind: 'hold' }],
    },
  ],
};
