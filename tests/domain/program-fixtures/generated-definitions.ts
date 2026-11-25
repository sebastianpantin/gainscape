import fc from 'fast-check';
import {
  DEFAULT_ROUNDING,
  type OptionValue,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ReferenceVar,
  type WeightUnit,
} from '@domain/index.ts';
import {
  type Adjustment,
  type DayDecl,
  type InitialExpression,
  type Load,
  type NumberExpr,
  type OptionDecl,
  type ProgressionRule,
  type ProgressionTrigger,
  type Schedule,
  type SetScheme,
  type SetSpec,
  type SlotDecl,
  type SlotRole,
  type StageDecl,
  type UnitAmountExpr,
  type WeekTableRow,
} from '@domain/program-types.ts';
import { type UnitAmount } from '@domain/units.ts';
import { catalogEnrollment } from './catalog.ts';

const LIFTS = ['squat', 'bench', 'row'] as const;
const VARS: readonly ReferenceVar[] = ['tm', 'top', 'fiveRm', 'e1rm', 'workingWeight'];
const ROLES: readonly SlotRole[] = ['main', 'supplemental', 'assistance'];
const WEEK_TABLE = 'main';
const WEEK_TABLE_ROWS = 4;
const USUAL_WEIGHT = 60;

const OPTIONS: readonly OptionDecl[] = [
  { key: 'setCount', kind: 'choice', values: [3, 5, 2], default: 3, source: ['generated'] },
  { key: 'share', kind: 'choice', values: [0.9, 0.85], default: 0.9, source: ['generated'] },
  { key: 'variant', kind: 'choice', values: ['a', 'b'], default: 'a', source: ['generated'] },
  { key: 'deload', kind: 'number', min: 0.05, max: 0.2, default: 0.1, source: ['generated'] },
];

type ScheduleShape =
  { kind: 'cycle'; weeksPerCycle: number; waveWeeks?: number } | { kind: 'weekly' } | { kind: 'rotation' };

interface PlannedSlot {
  id: string;
  day: string;
  lift: string;
  ordinal: number;
}

interface Plan {
  shape: ScheduleShape;
  days: PlannedSlot[][];
  slots: PlannedSlot[];
}

function kind<K extends string>(value: K): fc.Arbitrary<K> {
  return fc.constant(value);
}

function usually<T>(usual: fc.Arbitrary<T>, ...rarely: fc.Arbitrary<T>[]): fc.Arbitrary<T> {
  return fc.oneof({ weight: USUAL_WEIGHT, arbitrary: usual }, ...rarely.map((arbitrary) => ({ weight: 1, arbitrary })));
}

function weighted<T>(...choices: [weight: number, arbitrary: fc.Arbitrary<T>][]): fc.Arbitrary<T> {
  return fc.oneof(...choices.filter(([weight]) => weight > 0).map(([weight, arbitrary]) => ({ weight, arbitrary })));
}

function waveCountOf(shape: ScheduleShape): number | null {
  return shape.kind === 'cycle' && shape.waveWeeks ? Math.floor(shape.weeksPerCycle / shape.waveWeeks) : null;
}

const lift = fc.constantFrom(...LIFTS);
const referenceVar = fc.constantFrom(...VARS);
const reps = fc.integer({ min: 1, max: 8 });
const anySetIndex = fc.nat(6);
const lowSetIndex = weighted([12, fc.constant(0)], [2, fc.nat(2)], [1, anySetIndex]);

const share: fc.Arbitrary<NumberExpr> = usually<NumberExpr>(
  fc.oneof(
    fc.constantFrom(0.5, 0.7, 0.85, 1),
    fc.constantFrom<NumberExpr>({ option: 'share' }, { option: 'deload' }),
    fc.array(fc.constantFrom(0.6, 0.8, 0.9), { minLength: 1, maxLength: 3 }).map((byCycle) => ({ byCycle })),
  ),
  fc.constantFrom<NumberExpr>({ option: 'variant' }, { option: 'missing' }, { byCycle: [] }),
);

const setCount: fc.Arbitrary<NumberExpr> = usually<NumberExpr>(
  fc.oneof(
    fc.integer({ min: 1, max: 5 }),
    fc.constant<NumberExpr>({ option: 'setCount' }),
    fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 3 }).map((byCycle) => ({ byCycle })),
  ),
  fc.constantFrom<NumberExpr>({ option: 'deload' }, { option: 'missing' }, { option: 'variant' }, 0),
);

const amount = fc.constantFrom<UnitAmount>({ kg: 0, lb: 0 }, { kg: 2.5, lb: 5 }, { kg: 5, lb: 10 });

const amountExpr: fc.Arbitrary<UnitAmountExpr> = usually<UnitAmountExpr>(
  fc.oneof(
    amount,
    fc.record({ a: amount, b: amount }).map((cases) => ({ option: 'variant', cases })),
  ),
  amount.map((a) => ({ option: 'variant', cases: { a } })),
  amount.map((a) => ({ option: 'deload', cases: { a } })),
);

function loadFor(plan: Plan, own: PlannedSlot): fc.Arbitrary<Load> {
  const anySlot = fc.constantFrom(...plan.slots);
  const earlier = plan.slots.filter((slot) => slot.ordinal < own.ordinal);
  const target = earlier.length > 0 ? usually(fc.constantFrom(...earlier), anySlot) : anySlot;
  const setRef = fc.tuple(target, lowSetIndex).map(([slot, index]) => `${slot.id}:${index}`);
  const relative = earlier.length > 0 ? 6 : 0;
  const pctOfSlot = fc.tuple(target, lowSetIndex, share).chain(([slot, idx, pct]) =>
    usually(fc.constant(slot.day), fc.constantFrom('nowhere', plan.days[0][0].day)).map((day): Load => ({
      kind: 'pctOfSlot',
      day,
      slot: slot.id,
      idx,
      pct,
    })),
  );
  const sameAs = fc.record({ kind: kind('sameAs'), ref: setRef });
  const weekTablePct = fc.record({
    kind: kind('weekTablePct'),
    table: usually(fc.constant(WEEK_TABLE), fc.constant('missing')),
    set: weighted([20, fc.constant(0)], [1, anySetIndex]),
    of: referenceVar,
  });
  return weighted<Load>(
    [
      24,
      fc.record(
        { kind: kind('pct'), pct: share, of: referenceVar, lift, add: amountExpr },
        { requiredKeys: ['kind', 'pct', 'of'] },
      ),
    ],
    [
      6,
      fc.record({
        kind: kind('ramp'),
        step: fc.constantFrom<NumberExpr>(0.1, 0.125, { option: 'deload' }),
        count: fc.integer({ min: 1, max: 5 }),
        of: referenceVar,
      }),
    ],
    [6, fc.constant({ kind: 'lastLogged' })],
    [
      6,
      fc.record({
        kind: kind('rpeLoad'),
        reps: usually(fc.integer({ min: 1, max: 6 }), fc.constant(7)),
        rpe: usually(fc.constantFrom(7, 8, 8.5, 9.5, 10), fc.constant(6.5)),
        of: referenceVar,
      }),
    ],
    [
      6,
      fc.record({
        kind: kind('cumulativeAddOn'),
        pct: share,
        of: referenceVar,
        byWeek: usually(fc.array(amount, { minLength: 4, maxLength: 5 }), fc.array(amount, { maxLength: 3 })),
      }),
    ],
    [plan.shape.kind === 'weekly' ? 0 : 6, weekTablePct],
    [relative, sameAs],
    [relative, fc.record({ kind: kind('pctOfSet'), ref: setRef, pct: share })],
    [plan.shape.kind === 'rotation' ? 0 : relative, pctOfSlot],
    [1, fc.oneof(sameAs, weekTablePct, pctOfSlot)],
  );
}

const stage: fc.Arbitrary<StageDecl> = fc.record({
  sets: fc.integer({ min: 1, max: 5 }),
  reps,
  amrapLast: fc.boolean(),
});

const stagesWithOwnReps: fc.Arbitrary<StageDecl[]> = fc
  .uniqueArray(reps, { minLength: 1, maxLength: 3 })
  .chain((stageReps) =>
    fc.tuple(...stageReps.map((ownReps) => stage.map((drawn): StageDecl => ({ ...drawn, reps: ownReps })))),
  );

function schemeFor(plan: Plan, load: fc.Arbitrary<Load>): fc.Arbitrary<SetScheme> {
  const countedOrOpenReps = weighted<number | null>([12, reps], [1, fc.constant(null)]);
  const setSpec: fc.Arbitrary<SetSpec> = fc.record(
    {
      reps: countedOrOpenReps,
      maxReps: fc.integer({ min: 8, max: 12 }),
      load,
      amrap: fc.boolean(),
      minReps: fc.integer({ min: 1, max: 5 }),
      optional: fc.boolean(),
    },
    { requiredKeys: ['reps', 'load'] },
  );
  const weekTable = fc.record({
    kind: kind('weekTable'),
    table: usually(fc.constant(WEEK_TABLE), fc.constant('missing')),
    of: referenceVar,
  });
  return weighted<SetScheme>(
    [18, fc.record({ kind: kind('sets'), sets: fc.array(setSpec, { minLength: 1, maxLength: 3 }) })],
    [
      18,
      fc.record(
        {
          kind: kind('repeat'),
          count: setCount,
          reps: countedOrOpenReps,
          maxReps: fc.integer({ min: 8, max: 12 }),
          load,
          amrapLast: fc.boolean(),
          minReps: fc.integer({ min: 1, max: 5 }),
          optional: fc.boolean(),
        },
        { requiredKeys: ['kind', 'count', 'reps', 'load'] },
      ),
    ],
    [plan.shape.kind === 'weekly' ? 0 : 8, weekTable],
    [
      14,
      fc.record({
        kind: kind('stages'),
        stages: usually(
          stagesWithOwnReps,
          fc.array(stage, { minLength: 2, maxLength: 3 }),
          fc.constant<StageDecl[]>([]),
        ),
        load,
      }),
    ],
    [1, weekTable],
  );
}

function slotFor(plan: Plan, planned: PlannedSlot): fc.Arbitrary<SlotDecl> {
  return fc.record(
    {
      id: fc.constant(planned.id),
      lift: fc.constant(planned.lift),
      role: fc.constantFrom(...ROLES),
      scheme: schemeFor(plan, loadFor(plan, planned)),
      when: fc.constantFrom('a', 'b').map((equals) => [{ option: 'variant', equals }]),
      weeks: fc.constantFrom([1], [1, 2], [2, 3]),
    },
    { requiredKeys: ['id', 'lift', 'role', 'scheme'] },
  );
}

function fewestSureSets(slot: SlotDecl): number {
  const scheme = slot.scheme;
  switch (scheme.kind) {
    case 'sets':
      return scheme.sets.length;
    case 'repeat':
      return typeof scheme.count === 'number' ? scheme.count : 1;
    case 'stages':
      return Math.min(5, ...scheme.stages.map((drawn) => drawn.sets));
    case 'weekTable':
      return 1;
  }
}

function hasOnlyPlainLowRepSets(slot: SlotDecl): boolean {
  const scheme = slot.scheme;
  if (scheme.kind === 'repeat') {
    return scheme.reps !== null && scheme.reps <= 6 && scheme.maxReps === undefined && !scheme.amrapLast;
  }
  return scheme.kind === 'stages' && scheme.stages.every((drawn) => drawn.reps <= 6 && !drawn.amrapLast);
}

function setIndexIn(slot: SlotDecl): fc.Arbitrary<number> {
  return usually(fc.nat(Math.max(fewestSureSets(slot) - 1, 0)), anySetIndex);
}

function adjustmentFor(shape: ScheduleShape, judged: SlotDecl): fc.Arbitrary<Adjustment> {
  const setIndex = setIndexIn(judged);
  const waves = waveCountOf(shape);
  const bands = usually(
    fc.constantFrom<[number, UnitAmount][]>(
      [[0, { kg: 0, lb: 0 }]],
      [
        [0, { kg: 0, lb: 0 }],
        [3, { kg: 2.5, lb: 5 }],
        [6, { kg: 5, lb: 10 }],
      ],
    ),
    fc.constantFrom<[number, UnitAmount][]>(
      [],
      [
        [4, { kg: 5, lb: 10 }],
        [2, { kg: 2.5, lb: 5 }],
      ],
    ),
  );
  const stageMachine = fc.record({
    kind: kind('stageMachine'),
    onLastFail: fc.oneof(
      fc.record({ kind: kind('retest'), pct: fc.constant(0.85), from: referenceVar }),
      fc.record({ kind: kind('resetToFirstStage'), add: amount }),
    ),
  });
  const repsOverStandard = fc.record({
    kind: kind('repsOverStandard'),
    setIndex,
    standardByWave: usually(
      fc.array(reps, { minLength: waves ?? 1, maxLength: waves ?? 1 }),
      fc.array(reps, { maxLength: 3 }),
    ),
    perRep: amountExpr,
    cap: fc.integer({ min: 1, max: 10 }),
  });
  return weighted<Adjustment>(
    [
      12,
      fc.record(
        {
          kind: kind('increment'),
          by: amountExpr,
          opening: fc.record({ times: fc.integer({ min: 1, max: 2 }), by: amountExpr }),
        },
        { requiredKeys: ['kind', 'by'] },
      ),
    ],
    [6, fc.record({ kind: kind('increment'), byPct: share })],
    [6, fc.constant({ kind: 'hold' })],
    [6, fc.record({ kind: kind('tmReset'), pct: share })],
    [6, fc.record({ kind: kind('failureCounter'), threshold: fc.integer({ min: 1, max: 3 }), deloadPct: share })],
    [judged.scheme.kind === 'stages' ? 18 : 0, stageMachine],
    [6, fc.record({ kind: kind('amrapThreshold'), setIndex, reps })],
    [6, fc.record({ kind: kind('amrapTable'), setIndex, bands })],
    [waves === null ? 0 : 6, repsOverStandard],
    [hasOnlyPlainLowRepSets(judged) ? 16 : 1, fc.record({ kind: kind('e1rmFromSet'), setIndex })],
    [1, fc.oneof(stageMachine, repsOverStandard)],
  );
}

function ruleFor(shape: ScheduleShape, slots: readonly SlotDecl[]): fc.Arbitrary<ProgressionRule> {
  const trigger = usually<ProgressionTrigger>(
    fc.constantFrom<ProgressionTrigger>(
      'afterSession',
      'endOfWeek',
      'endOfCycle',
      waveCountOf(shape) === null ? 'afterSession' : 'endOfWave',
    ),
    fc.constant('endOfWave'),
  );
  return fc.constantFrom(...slots).chain((judged) => {
    const adjustments = fc.array(adjustmentFor(shape, judged), { maxLength: 2 });
    return fc.record(
      {
        lift: usually(fc.constant(judged.lift), lift, fc.constant('missing')),
        var: referenceVar,
        trigger,
        judgedSlots: usually(
          weighted<string[]>(
            [3, fc.constant([judged.id])],
            [1, fc.constantFrom(...slots).map((other) => [...new Set([judged.id, other.id])])],
          ),
          fc.constant(['nowhere']),
        ),
        judgedWeeks: fc.constantFrom([1], [1, 2, 3]),
        judgedSetIndexes: usually(fc.array(setIndexIn(judged), { minLength: 1, maxLength: 2 }), fc.constant([])),
        onMet: adjustments,
        onMiss: adjustments,
        always: adjustments,
      },
      { requiredKeys: ['lift', 'var', 'trigger', 'judgedSlots', 'onMet', 'onMiss'] },
    );
  });
}

const initial: fc.Arbitrary<InitialExpression[]> = fc
  .tuple(
    ...VARS.map((variable) =>
      weighted<InitialExpression[]>(
        [6, fc.constant([{ kind: 'copy', var: variable, from: 'oneRm' }])],
        [2, share.map((factor) => [{ kind: 'scale', var: variable, from: 'oneRm', factor }])],
        [1, fc.constant([{ kind: 'onRamp', var: variable, from: 'oneRm', factor: 0.975, peakWeek: 3 }])],
        [1, fc.constant([])],
      ),
    ),
  )
  .map((perVar) => perVar.flat());

const weekTableRow: fc.Arbitrary<WeekTableRow> = fc.record({
  sets: fc.array(
    fc.record(
      {
        pct: fc.constantFrom(0.65, 0.75, 0.85),
        reps: fc.integer({ min: 1, max: 6 }),
        amrap: fc.boolean(),
        minReps: fc.integer({ min: 1, max: 5 }),
      },
      { requiredKeys: ['pct', 'reps'] },
    ),
    { minLength: 1, maxLength: 3 },
  ),
});

const weekTableRows = usually(
  fc.array(weekTableRow, { minLength: WEEK_TABLE_ROWS, maxLength: WEEK_TABLE_ROWS }),
  fc.array(weekTableRow, { maxLength: WEEK_TABLE_ROWS - 1 }),
);

const scheduleShape = usually<ScheduleShape>(
  fc.constantFrom<ScheduleShape>(
    { kind: 'cycle', weeksPerCycle: 1 },
    { kind: 'cycle', weeksPerCycle: 2, waveWeeks: 1 },
    { kind: 'cycle', weeksPerCycle: 3 },
    { kind: 'cycle', weeksPerCycle: 4, waveWeeks: 2 },
    { kind: 'weekly' },
    { kind: 'weekly' },
    { kind: 'rotation' },
    { kind: 'rotation' },
  ),
  fc.constant({ kind: 'cycle', weeksPerCycle: 4, waveWeeks: 3 }),
);

const plan: fc.Arbitrary<Plan> = fc
  .tuple(scheduleShape, fc.array(fc.array(lift, { minLength: 1, maxLength: 2 }), { minLength: 1, maxLength: 3 }))
  .map(([shape, dayLifts]) => {
    const days = dayLifts.map((lifts, dayIndex) =>
      lifts.map((slotLift, slotIndex) => ({
        id: `d${dayIndex}-s${slotIndex}`,
        day: `d${dayIndex}`,
        lift: slotLift,
        ordinal: dayLifts.slice(0, dayIndex).flat().length + slotIndex,
      })),
    );
    return { shape, days, slots: days.flat() };
  });

function daysFor(drawn: Plan): fc.Arbitrary<DayDecl[]> {
  return fc.tuple(
    ...drawn.days.map((daySlots, dayIndex) =>
      fc.record({
        key: fc.constant(`d${dayIndex}`),
        name: fc.constant(`Day ${dayIndex + 1}`),
        optional: dayIndex === 0 ? fc.constant(false) : weighted([5, fc.constant(false)], [1, fc.constant(true)]),
        slots: fc.tuple(...daySlots.map((slot) => slotFor(drawn, slot))),
      }),
    ),
  );
}

export const generatedDefinition: fc.Arbitrary<ProgramDefinition> = plan.chain((drawn) =>
  daysFor(drawn).chain((days) =>
    fc.record({
      key: fc.constant('generated'),
      version: fc.constant(1),
      name: fc.constant('Generated definition'),
      source: fc.constant(['generated']),
      lifts: fc.constant(LIFTS.map((key) => ({ key, name: key, ...(key === 'row' ? { barbell: false } : {}) }))),
      inputs: fc.constant([{ lifts: [...LIFTS], kinds: ['oneRm' as const] }]),
      referenceVars: fc.constant([...VARS]),
      initial,
      options: fc.constant([...OPTIONS]),
      weekTables: weekTableRows.map((rows) => ({ [WEEK_TABLE]: rows })),
      schedule: fc.constant<Schedule>({ ...drawn.shape, days }),
      progression: fc.array(
        ruleFor(
          drawn.shape,
          days.flatMap((day) => day.slots),
        ),
        { maxLength: 3 },
      ),
    }),
  ),
);

export function enrollmentFor(definition: ProgramDefinition): fc.Arbitrary<ProgramEnrollment> {
  const optionValues = fc.tuple(
    ...definition.options.map((option) =>
      option.kind === 'choice'
        ? fc.constantFrom<OptionValue>(...option.values)
        : fc.constantFrom<OptionValue>(option.min, option.default, option.max),
    ),
  );
  const unboundLift = weighted<string | null>([5, fc.constant(null)], [1, lift]);
  return fc
    .tuple(fc.constantFrom<WeightUnit>('kg', 'lb'), optionValues, unboundLift)
    .map(([unit, values, unbound]) => ({
      ...catalogEnrollment(definition),
      unit,
      options: Object.fromEntries(definition.options.map((option, index) => [option.key, values[index]])),
      bindings: Object.fromEntries(definition.lifts.map(({ key }) => [key, key === unbound ? null : key])),
      rounding: DEFAULT_ROUNDING[unit],
    }));
}
