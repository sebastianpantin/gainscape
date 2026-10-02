import {
  DEFAULT_ROUNDING,
  type FactSet,
  type ProgramDefinition,
  type ProgramEnrollment,
  type WeeklyPosition,
} from '@domain/index.ts';
import { setAsPrescribed } from './facts.ts';

export const LINEAR_AFTER_SESSION: ProgramDefinition = {
  key: 'synthetic_linear_after_session',
  version: 1,
  name: 'Synthetic after-session linear progression',
  source: ['synthetic test fixture'],
  lifts: [{ key: 'squat', name: 'Squat', category: 'lower' }],
  inputs: [{ lifts: ['squat'], kinds: ['tm'] }],
  referenceVars: ['tm'],
  initial: [{ kind: 'copy', var: 'tm', from: 'tm' }],
  options: [],
  schedule: {
    kind: 'weekly',
    days: [
      {
        key: 'a',
        name: 'Day A',
        slots: [
          {
            id: 'a-squat',
            lift: 'squat',
            role: 'main',
            scheme: { kind: 'repeat', count: 3, reps: 5, load: { kind: 'pct', pct: 1, of: 'tm' } },
          },
        ],
      },
      {
        key: 'b',
        name: 'Day B',
        slots: [
          {
            id: 'b-squat',
            lift: 'squat',
            role: 'main',
            scheme: { kind: 'repeat', count: 3, reps: 5, load: { kind: 'pct', pct: 1, of: 'tm' } },
          },
        ],
      },
    ],
  },
  progression: [
    {
      lift: 'squat',
      var: 'tm',
      trigger: 'afterSession',
      judgedSlots: ['a-squat', 'b-squat'],
      onMet: [{ kind: 'increment', by: { kg: 2.5, lb: 5 } }],
      onMiss: [{ kind: 'hold' }],
    },
  ],
};

export function linearEnrollment(squatTm = 100): ProgramEnrollment {
  return {
    id: 'enrollment-linear',
    unit: 'kg',
    options: {},
    bindings: { squat: 'squat' },
    inputs: { squat: { tm: squatTm } },
    rounding: DEFAULT_ROUNDING.kg,
  };
}

export function linearDay(week: number, day: 'a' | 'b'): WeeklyPosition {
  return { week, day };
}

export function linearSquatSets(day: 'a' | 'b', lastSetReps = 5): FactSet[] {
  return [0, 1, 2].map((index) =>
    setAsPrescribed(
      'squat',
      `${day}-squat:${index}`,
      { weightKg: 100, reps: 5 },
      index === 2 ? lastSetReps : undefined,
    ),
  );
}
