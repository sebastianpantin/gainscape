import { type EnrollmentRow } from '../../web/src/lib/programs/program-facts-rules.ts';
import { MADCOW_EXERCISES } from '../domain/program-fixtures/madcow_5x5.ts';

export function madcowEnrollmentRow(overrides: Partial<EnrollmentRow> = {}): EnrollmentRow {
  return {
    id: '7a2f0c1e-1111-4111-8111-111111111111',
    template_key: 'madcow_5x5',
    template_version: 1,
    unit: 'kg',
    options: { rampStep: 0.125 },
    lift_bindings: { ...MADCOW_EXERCISES },
    inputs: {
      squat: { fiveRm: 100 },
      bench: { fiveRm: 80 },
      row: { fiveRm: 70 },
      press: { fiveRm: 50 },
      deadlift: { fiveRm: 140 },
    },
    rounding: { increment: 2.5, mode: 'nearest', barWeight: 20 },
    started_at: '2026-10-04T18:00:00.000Z',
    ended_at: null,
    ...overrides,
  };
}
