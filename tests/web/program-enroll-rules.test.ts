import { describe, expect, it } from 'vitest';
import { type OptionValue, type ProgramDefinition, validateEnrollment, type WeightUnit } from '@domain/index.ts';
import {
  type BindableExercise,
  defaultBindings,
  type EnrollForm,
  enrollPayload,
  initialEnrollForm,
  inputFields,
  optionControls,
  type ProgramTemplateRow,
  referencePreview,
  templateListEntries,
  withUnit,
} from '../../web/src/lib/program-enroll-rules.ts';
import { FIVE_THREE_ONE } from '../domain/program-fixtures/five_three_one.ts';
import { JUGGERNAUT_2 } from '../domain/program-fixtures/juggernaut_2.ts';
import { MADCOW_5X5 } from '../domain/program-fixtures/madcow_5x5.ts';

function catalogExercise(key: string, name: string, archived = false): BindableExercise {
  return { id: `id-${key}`, key, name, archived };
}

const CATALOG: readonly BindableExercise[] = [
  catalogExercise('front_squat', 'Front Squat'),
  catalogExercise('back_squat', 'Back Squat'),
  catalogExercise('incline_barbell_bench_press', 'Incline Barbell Bench Press'),
  catalogExercise('barbell_bench_press', 'Barbell Bench Press'),
  catalogExercise('dumbbell_row', 'Dumbbell Row'),
  catalogExercise('barbell_row', 'Barbell Row'),
  catalogExercise('overhead_press', 'Overhead Press'),
  catalogExercise('romanian_deadlift', 'Romanian Deadlift'),
  catalogExercise('deadlift', 'Deadlift'),
  catalogExercise('dip', 'Dip'),
  catalogExercise('weighted_dip', 'Weighted Dip'),
  catalogExercise('barbell_curl', 'Barbell Curl'),
  catalogExercise('skull_crusher', 'Skull Crusher'),
  { id: 'custom-squat', key: null, name: 'Squat', archived: false },
];

const EVERY_INPUT_KIND: ProgramDefinition = {
  ...MADCOW_5X5,
  key: 'every_input_kind',
  name: 'Every input kind',
  inputs: [
    { lifts: ['squat'], kinds: ['oneRm'] },
    { lifts: ['bench'], kinds: ['tm'] },
    { lifts: ['row'], kinds: ['fiveRm'] },
    { lifts: ['press'], kinds: ['e1rm'] },
    { lifts: ['deadlift'], kinds: ['workingWeight'] },
  ],
};

function templateRow(definition: unknown, overrides: Partial<ProgramTemplateRow> = {}): ProgramTemplateRow {
  const parsed = definition as { key: string; version: number; name: string };
  return { key: parsed.key, version: parsed.version, name: parsed.name, definition, ...overrides };
}

function withUnknownLoadKind(definition: ProgramDefinition): unknown {
  const json = structuredClone(definition) as unknown as {
    schedule: { days: { slots: { scheme: { load?: unknown } }[] }[] };
  };
  json.schedule.days[0].slots[0].scheme.load = { kind: 'warpSpeed', of: 'top' };
  return json;
}

function madcowForm(unit: WeightUnit = 'kg', fiveRms = ['100', '80', '70', '50', '140']): EnrollForm {
  const form = initialEnrollForm(MADCOW_5X5, unit, CATALOG);
  const lifts = ['squat', 'bench', 'row', 'press', 'deadlift'];
  return { ...form, inputValues: Object.fromEntries(lifts.map((lift, index) => [lift, fiveRms[index]])) };
}

function fiveThreeOneForm(unit: WeightUnit, oneRms: Record<string, string>): EnrollForm {
  const form = initialEnrollForm(FIVE_THREE_ONE, unit, CATALOG);
  return { ...form, inputValues: oneRms };
}

const FIVE_THREE_ONE_ONE_RMS_LB = { squat: '315', bench: '225', deadlift: '405', press: '135' };

describe('template list entries', () => {
  it('lists a template the app understands as enrollable with its parsed definition', () => {
    const [entry] = templateListEntries([templateRow(MADCOW_5X5)]);
    expect(entry).toEqual({
      kind: 'enrollable',
      key: 'madcow_5x5',
      version: 1,
      name: 'Madcow 5x5',
      definition: MADCOW_5X5,
    });
  });

  it('lists a template with an unknown primitive kind as "Update the app to use this program"', () => {
    const rows = [templateRow(withUnknownLoadKind(MADCOW_5X5), { key: 'future_madcow', name: 'Future Madcow' })];
    expect(templateListEntries(rows)).toEqual([
      {
        kind: 'needs_update',
        key: 'future_madcow',
        version: 1,
        name: 'Future Madcow',
        message: 'Update the app to use this program',
      },
    ]);
  });

  it('lists a template whose rule this app knows but cannot run (customRule) as needing an update', () => {
    const definition = {
      ...MADCOW_5X5,
      key: 'custom_madcow',
      progression: [{ ...MADCOW_5X5.progression[0], onMiss: [{ kind: 'customRule', name: 'synthetic' }] }],
    };
    expect(templateListEntries([templateRow(definition)])[0].kind).toBe('needs_update');
  });

  it('lists a malformed definition as unusable instead of throwing', () => {
    const rows = [{ key: 'broken', version: 1, name: 'Broken', definition: { schedule: 'weekly' } }];
    expect(templateListEntries(rows)).toEqual([
      { kind: 'unusable', key: 'broken', version: 1, name: 'Broken', message: "This program can't be used right now" },
    ]);
  });

  it('lists only the highest version of each template key', () => {
    const entries = templateListEntries([
      templateRow({ ...MADCOW_5X5, version: 2, name: 'Madcow 5x5 v2' }),
      templateRow(MADCOW_5X5),
    ]);
    expect(entries.map((entry) => [entry.key, entry.version, entry.name])).toEqual([
      ['madcow_5x5', 2, 'Madcow 5x5 v2'],
    ]);
  });

  it('sorts the list by name, so 5/3/1 comes before Madcow 5x5', () => {
    const entries = templateListEntries([templateRow(MADCOW_5X5), templateRow(FIVE_THREE_ONE)]);
    expect(entries.map((entry) => entry.name)).toEqual(['5/3/1', 'Madcow 5x5']);
  });
});

describe('default lift bindings from catalog exercise keys', () => {
  it('binds the Madcow main lifts to back_squat, barbell_bench_press, barbell_row, overhead_press and deadlift', () => {
    const bindings = defaultBindings(MADCOW_5X5, CATALOG);
    expect([bindings.squat, bindings.bench, bindings.row, bindings.press, bindings.deadlift]).toEqual([
      'id-back_squat',
      'id-barbell_bench_press',
      'id-barbell_row',
      'id-overhead_press',
      'id-deadlift',
    ]);
  });

  it('binds the Madcow dip, curl and triceps assistance to weighted_dip, barbell_curl and skull_crusher', () => {
    const bindings = defaultBindings(MADCOW_5X5, CATALOG);
    expect([bindings.dip, bindings.curl, bindings.triceps]).toEqual([
      'id-weighted_dip',
      'id-barbell_curl',
      'id-skull_crusher',
    ]);
  });

  it('leaves the hyperextension and sit-up unbound because the catalog has no matching exercise', () => {
    const bindings = defaultBindings(MADCOW_5X5, CATALOG);
    expect([bindings.hyper, bindings.situp]).toEqual([null, null]);
  });

  it('declares a binding for every lift of the template and nothing else', () => {
    expect(Object.keys(defaultBindings(FIVE_THREE_ONE, CATALOG)).sort()).toEqual([
      'bench',
      'deadlift',
      'press',
      'squat',
    ]);
  });

  it('binds the 5/3/1 overhead press to overhead_press', () => {
    expect(defaultBindings(FIVE_THREE_ONE, CATALOG).press).toBe('id-overhead_press');
  });

  it('leaves a lift unbound when its matching exercise is archived', () => {
    const catalog = CATALOG.map((exercise) =>
      exercise.key === 'back_squat' ? { ...exercise, archived: true } : exercise,
    );
    expect(defaultBindings(MADCOW_5X5, catalog).squat).toBeNull();
  });

  it('never binds a custom exercise by its name', () => {
    const catalog = CATALOG.filter((exercise) => exercise.key !== 'back_squat');
    expect(defaultBindings(MADCOW_5X5, catalog).squat).toBeNull();
  });
});

describe('enroll form fields come from the declared inputs', () => {
  it('renders one field per lift for a definition that declares every input kind, labelled with kind and unit', () => {
    const form = initialEnrollForm(EVERY_INPUT_KIND, 'lb', CATALOG);
    expect(inputFields(EVERY_INPUT_KIND, form).map((field) => [field.lift, field.kind, field.label])).toEqual([
      ['squat', 'oneRm', 'Squat 1RM (lb)'],
      ['bench', 'tm', 'Bench press training max (lb)'],
      ['row', 'fiveRm', 'Barbell row 5RM (lb)'],
      ['press', 'e1rm', 'Incline or military press estimated 1RM (lb)'],
      ['deadlift', 'workingWeight', 'Deadlift working weight (lb)'],
    ]);
  });

  it('gives every field the unit of the form', () => {
    const form = initialEnrollForm(EVERY_INPUT_KIND, 'kg', CATALOG);
    expect(new Set(inputFields(EVERY_INPUT_KIND, form).map((field) => field.unit))).toEqual(new Set(['kg']));
  });

  it('asks Madcow for five 5RMs: squat, bench, row, press and deadlift', () => {
    const form = initialEnrollForm(MADCOW_5X5, 'kg', CATALOG);
    expect(inputFields(MADCOW_5X5, form).map((field) => field.label)).toEqual([
      'Squat 5RM (kg)',
      'Bench press 5RM (kg)',
      'Barbell row 5RM (kg)',
      'Incline or military press 5RM (kg)',
      'Deadlift 5RM (kg)',
    ]);
  });

  it('asks 5/3/1 for a 1RM per lift by default and offers a training max instead', () => {
    const form = initialEnrollForm(FIVE_THREE_ONE, 'kg', CATALOG);
    expect(inputFields(FIVE_THREE_ONE, form).map((field) => [field.label, field.kinds])).toEqual([
      ['Squat 1RM (kg)', ['oneRm', 'tm']],
      ['Bench press 1RM (kg)', ['oneRm', 'tm']],
      ['Deadlift 1RM (kg)', ['oneRm', 'tm']],
      ['Overhead press 1RM (kg)', ['oneRm', 'tm']],
    ]);
  });

  it('relabels a field when its lift switches to another declared input kind', () => {
    const form = initialEnrollForm(FIVE_THREE_ONE, 'kg', CATALOG);
    const switched = { ...form, inputKinds: { ...form.inputKinds, squat: 'tm' as const } };
    expect(inputFields(FIVE_THREE_ONE, switched)[0]).toMatchObject({ kind: 'tm', label: 'Squat training max (kg)' });
  });
});

describe('enroll form option controls come from the declared options', () => {
  it('offers Madcow a ramp step of 10%, 12.5% or 15%, defaulting to 12.5%', () => {
    expect(optionControls(MADCOW_5X5, 'kg')).toEqual([
      {
        kind: 'choice',
        key: 'rampStep',
        label: 'Ramp step',
        choices: [
          { value: 0.1, label: '10%' },
          { value: 0.125, label: '12.5%' },
          { value: 0.15, label: '15%' },
        ],
        defaultValue: 0.125,
      },
    ]);
  });

  it('offers 5/3/1 supplemental work, BBB weight and progression, the TM percentage and the TM reset', () => {
    expect(optionControls(FIVE_THREE_ONE, 'kg')).toEqual([
      {
        kind: 'choice',
        key: 'supplemental',
        label: 'Supplemental work',
        choices: [
          { value: 'none', label: 'None' },
          { value: 'bbb', label: 'Boring But Big' },
          { value: 'fsl', label: 'First Set Last' },
        ],
        defaultValue: 'bbb',
      },
      {
        kind: 'choice',
        key: 'bbbPct',
        label: 'BBB weight',
        choices: [
          { value: 0.5, label: '50%' },
          { value: 0.55, label: '55%' },
          { value: 0.6, label: '60%' },
        ],
        defaultValue: 0.5,
      },
      {
        kind: 'choice',
        key: 'bbbProgression',
        label: 'BBB progression',
        choices: [
          { value: 'standard', label: 'Standard' },
          { value: 'beginner', label: 'Beginner' },
        ],
        defaultValue: 'standard',
      },
      {
        kind: 'choice',
        key: 'tmPct',
        label: 'Training max percentage',
        choices: [
          { value: 0.9, label: '90%' },
          { value: 0.85, label: '85%' },
        ],
        defaultValue: 0.9,
      },
      { kind: 'number', key: 'tmReset', label: 'Training max reset', min: 0.1, max: 0.15, defaultValue: 0.1 },
    ]);
  });

  it('falls back to the option key and the raw values for an option it has no label for', () => {
    const definition: ProgramDefinition = {
      ...MADCOW_5X5,
      options: [{ key: 'tempo', kind: 'choice', values: ['slow', 'fast'], default: 'slow', source: ['x'] }],
    };
    expect(optionControls(definition, 'kg')).toEqual([
      {
        kind: 'choice',
        key: 'tempo',
        label: 'tempo',
        choices: [
          { value: 'slow', label: 'slow' },
          { value: 'fast', label: 'fast' },
        ],
        defaultValue: 'slow',
      },
    ]);
  });
});

describe('enroll form option controls fit the enrollment unit', () => {
  function perRepChoices(unit: WeightUnit): OptionValue[] {
    const control = optionControls(JUGGERNAUT_2, unit).find((candidate) => candidate.key === 'perRep');
    return control?.kind === 'choice' ? control.choices.map((choice) => choice.value) : [];
  }

  it('offers a kg Juggernaut enrollment only the standard per-rep increment, because fine is lb only', () => {
    expect(perRepChoices('kg')).toEqual(['standard']);
  });

  it('offers an lb Juggernaut enrollment both the standard and the fine per-rep increment', () => {
    expect(perRepChoices('lb')).toEqual(['standard', 'fine']);
  });

  it('keeps standard as the default for either unit', () => {
    expect(optionControls(JUGGERNAUT_2, 'kg')[0]).toMatchObject({ key: 'perRep', defaultValue: 'standard' });
    expect(optionControls(JUGGERNAUT_2, 'lb')[0]).toMatchObject({ key: 'perRep', defaultValue: 'standard' });
  });
});

describe('initial enroll form', () => {
  it('defaults kilogram rounding to the nearest 2.5 kg with a 20 kg bar', () => {
    expect(initialEnrollForm(MADCOW_5X5, 'kg', CATALOG).rounding).toEqual({
      increment: 2.5,
      mode: 'nearest',
      barWeight: 20,
    });
  });

  it('defaults pound rounding to the nearest 5 lb with a 45 lb bar', () => {
    expect(initialEnrollForm(MADCOW_5X5, 'lb', CATALOG).rounding).toEqual({
      increment: 5,
      mode: 'nearest',
      barWeight: 45,
    });
  });

  it('starts every option at its declared default', () => {
    expect(initialEnrollForm(FIVE_THREE_ONE, 'kg', CATALOG).options).toEqual({
      supplemental: 'bbb',
      bbbPct: 0.5,
      bbbProgression: 'standard',
      tmPct: 0.9,
      tmReset: 0.1,
    });
  });

  it('starts every input lift on its first declared kind with an empty value', () => {
    const form = initialEnrollForm(FIVE_THREE_ONE, 'kg', CATALOG);
    expect(form.inputKinds).toEqual({ squat: 'oneRm', bench: 'oneRm', deadlift: 'oneRm', press: 'oneRm' });
    expect(form.inputValues).toEqual({ squat: '', bench: '', deadlift: '', press: '' });
  });

  it('starts with the default bindings', () => {
    expect(initialEnrollForm(MADCOW_5X5, 'kg', CATALOG).bindings).toEqual(defaultBindings(MADCOW_5X5, CATALOG));
  });

  it('switches rounding to the pound defaults when the unit changes to lb and keeps the typed values', () => {
    const switched = withUnit(madcowForm('kg'), 'lb');
    expect(switched.unit).toBe('lb');
    expect(switched.rounding).toEqual({ increment: 5, mode: 'nearest', barWeight: 45 });
    expect(switched.inputValues.squat).toBe('100');
  });
});

describe('reference preview', () => {
  it('previews the unrounded training max: a 315 lb 1RM at 90% reads 283.5 lb (315 × 0.9 = 283.5)', () => {
    const form = fiveThreeOneForm('lb', FIVE_THREE_ONE_ONE_RMS_LB);
    expect(referencePreview(FIVE_THREE_ONE, form, 'squat')).toBe('Training max 283.5 lb');
  });

  it('follows the TM percentage option: 315 lb at 85% reads 267.75 lb (315 × 0.85 = 267.75)', () => {
    const form = fiveThreeOneForm('lb', FIVE_THREE_ONE_ONE_RMS_LB);
    const at85 = { ...form, options: { ...form.options, tmPct: 0.85 } };
    expect(referencePreview(FIVE_THREE_ONE, at85, 'squat')).toBe('Training max 267.75 lb');
  });

  it('previews the Madcow week 1 top unrounded: a 100 kg 5RM reads 92.69 kg (100 × 0.975^3 = 92.6859)', () => {
    expect(referencePreview(MADCOW_5X5, madcowForm('kg'), 'squat')).toBe('Top set 92.69 kg');
  });

  it('shows no preview when the lift is entered as a training max already', () => {
    const form = fiveThreeOneForm('lb', FIVE_THREE_ONE_ONE_RMS_LB);
    const asTm = { ...form, inputKinds: { ...form.inputKinds, squat: 'tm' as const } };
    expect(referencePreview(FIVE_THREE_ONE, asTm, 'squat')).toBeNull();
  });

  it('shows no preview before a value is typed', () => {
    const form = fiveThreeOneForm('lb', { ...FIVE_THREE_ONE_ONE_RMS_LB, squat: '' });
    expect(referencePreview(FIVE_THREE_ONE, form, 'squat')).toBeNull();
  });
});

describe('enroll payload', () => {
  it('builds the Madcow payload with five 5RM inputs, the ramp step, the bindings and kilogram rounding', () => {
    const result = enrollPayload(MADCOW_5X5, madcowForm('kg'));
    expect(result).toEqual({
      kind: 'ok',
      payload: {
        templateKey: 'madcow_5x5',
        templateVersion: 1,
        unit: 'kg',
        options: { rampStep: 0.125 },
        bindings: defaultBindings(MADCOW_5X5, CATALOG),
        inputs: {
          squat: { fiveRm: 100 },
          bench: { fiveRm: 80 },
          row: { fiveRm: 70 },
          press: { fiveRm: 50 },
          deadlift: { fiveRm: 140 },
        },
        rounding: { increment: 2.5, mode: 'nearest', barWeight: 20 },
      },
    });
  });

  it('builds the 5/3/1 payload with a 1RM per lift, the TM percentage and pound rounding', () => {
    const result = enrollPayload(FIVE_THREE_ONE, fiveThreeOneForm('lb', FIVE_THREE_ONE_ONE_RMS_LB));
    expect(result).toEqual({
      kind: 'ok',
      payload: {
        templateKey: 'five_three_one',
        templateVersion: 1,
        unit: 'lb',
        options: { supplemental: 'bbb', bbbPct: 0.5, bbbProgression: 'standard', tmPct: 0.9, tmReset: 0.1 },
        bindings: defaultBindings(FIVE_THREE_ONE, CATALOG),
        inputs: { squat: { oneRm: 315 }, bench: { oneRm: 225 }, deadlift: { oneRm: 405 }, press: { oneRm: 135 } },
        rounding: { increment: 5, mode: 'nearest', barWeight: 45 },
      },
    });
  });

  it('carries exactly the fields enroll_program reads', () => {
    const result = enrollPayload(MADCOW_5X5, madcowForm('kg'));
    if (result.kind !== 'ok') throw new Error(result.problems.join('; '));
    expect(Object.keys(result.payload).sort()).toEqual([
      'bindings',
      'inputs',
      'options',
      'rounding',
      'templateKey',
      'templateVersion',
      'unit',
    ]);
    expect(Object.keys(result.payload.rounding).sort()).toEqual(['barWeight', 'increment', 'mode']);
  });

  it('builds payloads the domain enrollment validation accepts for both programs', () => {
    const madcow = enrollPayload(MADCOW_5X5, madcowForm('kg'));
    const fiveThreeOne = enrollPayload(FIVE_THREE_ONE, fiveThreeOneForm('lb', FIVE_THREE_ONE_ONE_RMS_LB));
    if (madcow.kind !== 'ok' || fiveThreeOne.kind !== 'ok') throw new Error('expected both payloads to build');
    expect(validateEnrollment(MADCOW_5X5, { id: 'new', ...madcow.payload })).toEqual([]);
    expect(validateEnrollment(FIVE_THREE_ONE, { id: 'new', ...fiveThreeOne.payload })).toEqual([]);
  });

  it('sends the training max under tm when a lift is entered as a training max', () => {
    const form = fiveThreeOneForm('kg', { squat: '135', bench: '90', deadlift: '180', press: '55' });
    const result = enrollPayload(FIVE_THREE_ONE, { ...form, inputKinds: { ...form.inputKinds, squat: 'tm' } });
    if (result.kind !== 'ok') throw new Error(result.problems.join('; '));
    expect(result.payload.inputs.squat).toEqual({ tm: 135 });
    expect(result.payload.inputs.bench).toEqual({ oneRm: 90 });
  });

  it('reads a decimal value such as 102.5', () => {
    const result = enrollPayload(MADCOW_5X5, madcowForm('kg', ['102.5', '80', '70', '50', '140']));
    if (result.kind !== 'ok') throw new Error(result.problems.join('; '));
    expect(result.payload.inputs.squat).toEqual({ fiveRm: 102.5 });
  });

  it('asks for a missing value by its field label', () => {
    expect(enrollPayload(MADCOW_5X5, madcowForm('kg', ['', '80', '70', '50', '140']))).toEqual({
      kind: 'invalid',
      problems: ['Enter Squat 5RM (kg)'],
    });
  });

  it('refuses a value of 0 or above 1000', () => {
    expect(enrollPayload(MADCOW_5X5, madcowForm('kg', ['0', '80', '70', '50', '1001']))).toEqual({
      kind: 'invalid',
      problems: [
        'Squat 5RM (kg) must be above 0 and at most 1000',
        'Deadlift 5RM (kg) must be above 0 and at most 1000',
      ],
    });
  });

  it('refuses a value that is not a number', () => {
    expect(enrollPayload(MADCOW_5X5, madcowForm('kg', ['abc', '80', '70', '50', '140']))).toEqual({
      kind: 'invalid',
      problems: ['Squat 5RM (kg) must be above 0 and at most 1000'],
    });
  });

  it('keeps an unbound lift as null in the bindings', () => {
    const form = madcowForm('kg');
    const result = enrollPayload(MADCOW_5X5, { ...form, bindings: { ...form.bindings, row: null } });
    if (result.kind !== 'ok') throw new Error(result.problems.join('; '));
    expect(result.payload.bindings.row).toBeNull();
  });
});

function withRoundingText(form: EnrollForm, increment: string, barWeight: string): EnrollForm {
  return { ...form, roundingText: { increment, barWeight } };
}

function problemsOf(form: EnrollForm, definition: ProgramDefinition = MADCOW_5X5): string[] {
  const result = enrollPayload(definition, form);
  return result.kind === 'invalid' ? result.problems : [];
}

function payloadOf(form: EnrollForm, definition: ProgramDefinition = MADCOW_5X5) {
  const result = enrollPayload(definition, form);
  if (result.kind !== 'ok') throw new Error(result.problems.join('; '));
  return result.payload;
}

describe('the enroll form keeps raw text for every number field', () => {
  it('starts the kilogram rounding text at 2.5 and a 20 kg bar', () => {
    expect(initialEnrollForm(MADCOW_5X5, 'kg', CATALOG).roundingText).toEqual({ increment: '2.5', barWeight: '20' });
  });

  it('starts the pound rounding text at 5 and a 45 lb bar after switching the unit', () => {
    expect(withUnit(initialEnrollForm(MADCOW_5X5, 'kg', CATALOG), 'lb').roundingText).toEqual({
      increment: '5',
      barWeight: '45',
    });
  });

  it('keeps number options as text, starting at their defaults', () => {
    expect(initialEnrollForm(FIVE_THREE_ONE, 'kg', CATALOG).optionText).toEqual({ tmReset: '0.1' });
    expect(initialEnrollForm(MADCOW_5X5, 'kg', CATALOG).optionText).toEqual({});
  });

  it('keeps a cleared rounding field empty and asks for it instead of sending 0', () => {
    expect(problemsOf(withRoundingText(madcowForm('kg'), '', '20'))).toEqual(['Enter Round to (kg)']);
    expect(problemsOf(withRoundingText(madcowForm('kg'), '2.5', ''))).toEqual(['Enter Bar weight (kg)']);
  });

  it('reads 2.5 typed into a cleared rounding field as 2.5, from the text rather than the number', () => {
    const cleared = { ...madcowForm('kg'), rounding: { increment: 0, mode: 'nearest' as const, barWeight: 0 } };
    expect(payloadOf(withRoundingText(cleared, '2.5', '20')).rounding).toEqual({
      increment: 2.5,
      mode: 'nearest',
      barWeight: 20,
    });
  });

  it('reads 2.5 typed into a cleared 5RM field as 2.5', () => {
    expect(payloadOf(madcowForm('kg', ['2.5', '80', '70', '50', '140'])).inputs.squat).toEqual({ fiveRm: 2.5 });
  });

  it('reads the number option text into the payload: TM reset 0.125', () => {
    const form = fiveThreeOneForm('kg', { squat: '100', bench: '80', deadlift: '140', press: '50' });
    expect(payloadOf({ ...form, optionText: { tmReset: '0.125' } }, FIVE_THREE_ONE).options.tmReset).toBe(0.125);
  });

  it('asks for a cleared number option', () => {
    const form = fiveThreeOneForm('kg', { squat: '100', bench: '80', deadlift: '140', press: '50' });
    expect(problemsOf({ ...form, optionText: { tmReset: '' } }, FIVE_THREE_ONE)).toEqual(['Enter Training max reset']);
  });
});

describe('the enroll payload validates rounding and number options', () => {
  it.each(['0', '3', '-2.5', 'abc'])('refuses a kilogram rounding increment of %s', (increment) => {
    expect(problemsOf(withRoundingText(madcowForm('kg'), increment, '20'))).toEqual([
      'Round to (kg) must be one of 0.5, 1, 1.25, 2.5 or 5',
    ]);
  });

  it.each(['0.5', '1', '1.25', '2.5', '5'])('accepts a kilogram rounding increment of %s', (increment) => {
    expect(payloadOf(withRoundingText(madcowForm('kg'), increment, '20')).rounding.increment).toBe(Number(increment));
  });

  it.each(['0.5', '0', '7'])('refuses a pound rounding increment of %s', (increment) => {
    expect(problemsOf(withRoundingText(madcowForm('lb'), increment, '45'))).toEqual([
      'Round to (lb) must be one of 1, 2.5, 5 or 10',
    ]);
  });

  it.each(['1', '2.5', '5', '10'])('accepts a pound rounding increment of %s', (increment) => {
    expect(payloadOf(withRoundingText(madcowForm('lb'), increment, '45')).rounding.increment).toBe(Number(increment));
  });

  it.each(['0', '-20', 'heavy'])('refuses a bar weight of %s', (barWeight) => {
    expect(problemsOf(withRoundingText(madcowForm('kg'), '2.5', barWeight))).toEqual([
      'Bar weight (kg) must be above 0',
    ]);
  });

  it('accepts a 15 kg bar', () => {
    expect(payloadOf(withRoundingText(madcowForm('kg'), '2.5', '15')).rounding.barWeight).toBe(15);
  });

  it.each(['0.09', '0.16', '1'])('refuses a TM reset of %s outside 0.1 to 0.15', (tmReset) => {
    const form = fiveThreeOneForm('kg', { squat: '100', bench: '80', deadlift: '140', press: '50' });
    expect(problemsOf({ ...form, optionText: { tmReset } }, FIVE_THREE_ONE)).toEqual([
      'Training max reset must be between 0.1 and 0.15',
    ]);
  });

  it.each(['0.1', '0.15'])('accepts a TM reset of %s at the ends of its range', (tmReset) => {
    const form = fiveThreeOneForm('kg', { squat: '100', bench: '80', deadlift: '140', press: '50' });
    expect(payloadOf({ ...form, optionText: { tmReset } }, FIVE_THREE_ONE).options.tmReset).toBe(Number(tmReset));
  });

  it('lists input problems before rounding and option problems', () => {
    const form = fiveThreeOneForm('kg', { squat: '', bench: '80', deadlift: '140', press: '50' });
    const broken = { ...form, roundingText: { increment: '3', barWeight: '0' }, optionText: { tmReset: '0.5' } };
    expect(problemsOf(broken, FIVE_THREE_ONE)).toEqual([
      'Enter Squat 1RM (kg)',
      'Round to (kg) must be one of 0.5, 1, 1.25, 2.5 or 5',
      'Bar weight (kg) must be above 0',
      'Training max reset must be between 0.1 and 0.15',
    ]);
  });
});
