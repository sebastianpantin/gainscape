import { DEFAULT_ROUNDING, type ProgramDefinition, type ProgramEnrollment } from '@domain/index.ts';

export const SLICE_1B_PRIMITIVES_BY_SLOT: Readonly<Record<string, string>> = {
  'advanced-rpe-top': 'rpeLoad',
  'advanced-backoff': 'pctOfSet',
  'advanced-cross-day': 'pctOfSlot',
  'advanced-add-on': 'cumulativeAddOn',
  'advanced-stages': 'stages',
};

export const FULL_PRIMITIVES: ProgramDefinition = {
  key: 'synthetic_full_primitives',
  version: 1,
  name: 'Synthetic definition using every primitive',
  source: ['synthetic test fixture'],
  lifts: [
    { key: 'squat', name: 'Squat', category: 'lower' },
    { key: 'bench', name: 'Bench press', category: 'upper' },
    { key: 'curl', name: 'Curl' },
  ],
  inputs: [
    { lifts: ['squat'], kinds: ['oneRm', 'tm'] },
    { lifts: ['bench'], kinds: ['fiveRm', 'e1rm', 'workingWeight'] },
  ],
  referenceVars: ['tm', 'top', 'fiveRm', 'e1rm', 'workingWeight'],
  initial: [
    { kind: 'copy', var: 'tm', from: 'tm' },
    { kind: 'scale', var: 'tm', from: 'oneRm', factor: { option: 'tmPct' } },
    { kind: 'onRamp', var: 'top', from: 'fiveRm', factor: 0.975, peakWeek: 4 },
    { kind: 'copy', var: 'fiveRm', from: 'fiveRm' },
    { kind: 'copy', var: 'e1rm', from: 'e1rm' },
    { kind: 'copy', var: 'workingWeight', from: 'workingWeight' },
  ],
  options: [
    { key: 'tmPct', kind: 'choice', values: [0.9, 0.85], default: 0.9, source: ['synthetic'] },
    { key: 'rampStep', kind: 'choice', values: [0.1, 0.125, 0.15], default: 0.125, source: ['synthetic'] },
    { key: 'perRep', kind: 'choice', values: ['standard', 'fine'], default: 'standard', source: ['synthetic'] },
    { key: 'deloadPct', kind: 'number', min: 0.05, max: 0.15, default: 0.1, source: ['synthetic'] },
  ],
  conversions: [{ lb: 10, kg: 5, note: 'synthetic' }],
  weekTables: {
    main: [
      {
        sets: [
          { pct: 0.65, reps: 5 },
          { pct: 0.75, reps: 5 },
          { pct: 0.85, reps: 5, amrap: true, minReps: 5 },
        ],
      },
      {
        sets: [
          { pct: 0.7, reps: 3 },
          { pct: 0.8, reps: 3 },
          { pct: 0.9, reps: 3, amrap: true, minReps: 3 },
        ],
      },
      {
        sets: [
          { pct: 0.75, reps: 5 },
          { pct: 0.85, reps: 3 },
          { pct: 0.95, reps: 1, amrap: true, minReps: 1 },
        ],
      },
      {
        sets: [
          { pct: 0.4, reps: 5 },
          { pct: 0.5, reps: 5 },
          { pct: 0.6, reps: 5 },
        ],
      },
    ],
  },
  schedule: {
    kind: 'cycle',
    weeksPerCycle: 4,
    waveWeeks: 4,
    days: [
      {
        key: 'basic',
        name: 'Basic',
        slots: [
          {
            id: 'basic-table',
            lift: 'squat',
            role: 'main',
            scheme: { kind: 'weekTable', table: 'main', of: 'tm' },
          },
          {
            id: 'basic-first-set-last',
            lift: 'squat',
            role: 'supplemental',
            weeks: [1, 2, 3],
            scheme: {
              kind: 'repeat',
              count: 3,
              reps: 5,
              load: { kind: 'weekTablePct', table: 'main', set: 0, of: 'tm' },
            },
          },
          {
            id: 'basic-pct',
            lift: 'squat',
            role: 'supplemental',
            when: [{ option: 'tmPct', equals: 0.9 }],
            scheme: {
              kind: 'sets',
              sets: [
                { reps: 5, load: { kind: 'pct', pct: 0.5, of: 'tm' } },
                { reps: 5, load: { kind: 'pct', pct: { byCycle: [0.3, 0.45, 0.6] }, of: 'tm' }, optional: true },
                { reps: 5, load: { kind: 'pct', pct: 0.7, of: 'tm' }, amrap: true, minReps: 5 },
              ],
            },
          },
          {
            id: 'basic-ramp',
            lift: 'bench',
            role: 'main',
            scheme: {
              kind: 'repeat',
              count: 5,
              reps: 5,
              load: { kind: 'ramp', step: { option: 'rampStep' }, count: 5, of: 'top' },
            },
          },
          {
            id: 'basic-same-as',
            lift: 'bench',
            role: 'supplemental',
            scheme: { kind: 'sets', sets: [{ reps: 8, load: { kind: 'sameAs', ref: 'basic-ramp:2' } }] },
          },
          {
            id: 'basic-last-logged',
            lift: 'curl',
            role: 'assistance',
            scheme: { kind: 'repeat', count: 3, reps: 8, maxReps: 12, load: { kind: 'lastLogged' }, optional: true },
          },
        ],
      },
      {
        key: 'advanced',
        name: 'Advanced',
        optional: true,
        slots: [
          {
            id: 'advanced-rpe-top',
            lift: 'bench',
            role: 'main',
            scheme: { kind: 'sets', sets: [{ reps: 3, load: { kind: 'rpeLoad', reps: 3, rpe: 8, of: 'e1rm' } }] },
          },
          {
            id: 'advanced-backoff',
            lift: 'bench',
            role: 'supplemental',
            scheme: {
              kind: 'repeat',
              count: 5,
              reps: 3,
              optional: true,
              load: { kind: 'pctOfSet', ref: 'advanced-rpe-top:0', pct: 0.95 },
            },
          },
          {
            id: 'advanced-cross-day',
            lift: 'squat',
            role: 'supplemental',
            scheme: {
              kind: 'repeat',
              count: 2,
              reps: 5,
              load: { kind: 'pctOfSlot', day: 'basic', slot: 'basic-table', idx: 2, pct: 0.8 },
            },
          },
          {
            id: 'advanced-add-on',
            lift: 'squat',
            role: 'main',
            scheme: {
              kind: 'repeat',
              count: 6,
              reps: 6,
              load: {
                kind: 'cumulativeAddOn',
                pct: 0.7,
                of: 'tm',
                byWeek: [
                  { kg: 0, lb: 0 },
                  { kg: 5, lb: 10 },
                  { kg: 8.75, lb: 20 },
                ],
              },
            },
          },
          {
            id: 'advanced-stages',
            lift: 'bench',
            role: 'main',
            scheme: {
              kind: 'stages',
              stages: [
                { sets: 5, reps: 3, amrapLast: true },
                { sets: 6, reps: 2, amrapLast: true },
              ],
              load: { kind: 'pct', pct: 1, of: 'workingWeight' },
            },
          },
        ],
      },
    ],
  },
  progression: [
    {
      lift: 'squat',
      var: 'tm',
      trigger: 'endOfCycle',
      judgedSlots: ['basic-table'],
      judgedWeeks: [1, 2, 3],
      onMet: [{ kind: 'increment', by: { kg: 5, lb: 10 } }],
      onMiss: [{ kind: 'tmReset', pct: 0.1 }],
    },
    {
      lift: 'bench',
      var: 'top',
      trigger: 'endOfWeek',
      judgedSlots: ['basic-ramp'],
      onMet: [{ kind: 'increment', byPct: 0.025 }],
      onMiss: [{ kind: 'hold' }],
    },
    {
      lift: 'bench',
      var: 'workingWeight',
      trigger: 'afterSession',
      judgedSlots: ['advanced-stages'],
      onMet: [
        {
          kind: 'increment',
          by: { option: 'perRep', cases: { standard: { kg: 2.5, lb: 5 }, fine: { kg: 1.25, lb: 2.5 } } },
        },
      ],
      onMiss: [
        { kind: 'failureCounter', threshold: 3, deloadPct: { option: 'deloadPct' } },
        { kind: 'stageMachine', onLastFail: { kind: 'retest', pct: 0.85 } },
        { kind: 'stageMachine', onLastFail: { kind: 'resetToFirstStage', add: { kg: 6.25, lb: 15 } } },
      ],
    },
    {
      lift: 'squat',
      var: 'tm',
      trigger: 'endOfWave',
      judgedSlots: ['advanced-add-on'],
      onMet: [
        {
          kind: 'amrapTable',
          setIndex: 5,
          bands: [
            [0, { kg: 0, lb: 0 }],
            [2, { kg: 2.5, lb: 5 }],
            [4, { kg: 5, lb: 10 }],
          ],
        },
        {
          kind: 'repsOverStandard',
          setIndex: 5,
          standardByWave: [10, 8, 5, 3],
          perRep: { option: 'perRep', cases: { standard: { kg: 2.5, lb: 5 }, fine: { kg: 1.25, lb: 2.5 } } },
          cap: 10,
        },
        { kind: 'amrapThreshold', setIndex: 5, reps: 25 },
      ],
      onMiss: [{ kind: 'customRule', name: 'synthetic' }],
    },
    {
      lift: 'bench',
      var: 'e1rm',
      trigger: 'afterSession',
      judgedSlots: ['advanced-rpe-top'],
      onMet: [],
      onMiss: [],
      always: [{ kind: 'e1rmFromSet', setIndex: 0 }],
    },
  ],
};

export function fullPrimitivesEnrollment(): ProgramEnrollment {
  return {
    id: 'enrollment-full',
    unit: 'kg',
    options: { tmPct: 0.9, rampStep: 0.125, perRep: 'standard', deloadPct: 0.1 },
    bindings: { squat: 'squat', bench: 'bench', curl: 'curl' },
    inputs: { squat: { tm: 100 }, bench: { fiveRm: 100, e1rm: 120, workingWeight: 80 } },
    rounding: DEFAULT_ROUNDING.kg,
  };
}
