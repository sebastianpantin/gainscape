import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import {
  type ProgramDefinition,
  validateProgramDefinition,
} from '../../supabase/functions/_shared/domain/program-definition.ts';
import { CatalogValidationError } from './validate.ts';

export const PROGRAM_TEMPLATES_DIR = join(import.meta.dirname, '../../catalog/program-templates');

export interface ProgramTemplateSource {
  file: string;
  raw: unknown;
}

export interface ProgramTemplate {
  file: string;
  definition: ProgramDefinition;
}

export class ProgramTemplateShapeError extends Error {
  readonly file: string;
  readonly issues: string[];

  constructor(file: string, issues: string[]) {
    super(issues.map((issue) => `${file}: ${issue}`).join('\n'));
    this.name = 'ProgramTemplateShapeError';
    this.file = file;
    this.issues = issues;
  }
}

const sources = z.array(z.string().min(1)).min(1);
const inputKind = z.enum(['oneRm', 'tm', 'fiveRm', 'e1rm', 'workingWeight']);
const referenceVar = z.enum(['tm', 'top', 'fiveRm', 'e1rm', 'workingWeight']);
const optionValue = z.union([z.string(), z.number()]);
const positiveInt = z.int().positive();
const nonNegativeInt = z.int().nonnegative();

const numberExpr = z.union([
  z.number(),
  z.strictObject({ option: z.string() }),
  z.strictObject({ byCycle: z.array(z.number()) }),
]);

const unitAmount = z.strictObject({ kg: z.number(), lb: z.number() });

const unitAmountExpr = z.union([
  unitAmount,
  z.strictObject({ option: z.string(), cases: z.record(z.string(), unitAmount) }),
]);

const load = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('pct'),
    pct: numberExpr,
    of: referenceVar,
    lift: z.string().optional(),
    add: unitAmountExpr.optional(),
  }),
  z.strictObject({ kind: z.literal('ramp'), step: numberExpr, count: positiveInt, of: referenceVar }),
  z.strictObject({ kind: z.literal('sameAs'), ref: z.string() }),
  z.strictObject({ kind: z.literal('weekTablePct'), table: z.string(), set: nonNegativeInt, of: referenceVar }),
  z.strictObject({ kind: z.literal('lastLogged') }),
  z.strictObject({ kind: z.literal('pctOfSet'), ref: z.string(), pct: numberExpr }),
  z.strictObject({
    kind: z.literal('pctOfSlot'),
    day: z.string(),
    slot: z.string(),
    idx: nonNegativeInt,
    pct: numberExpr,
  }),
  z.strictObject({ kind: z.literal('rpeLoad'), reps: positiveInt, rpe: z.number(), of: referenceVar }),
  z.strictObject({
    kind: z.literal('cumulativeAddOn'),
    pct: numberExpr,
    of: referenceVar,
    byWeek: z.array(unitAmount),
  }),
]);

const reps = positiveInt.nullable();

const setSpec = z.strictObject({
  reps,
  maxReps: positiveInt.optional(),
  load,
  amrap: z.boolean().optional(),
  minReps: positiveInt.optional(),
  optional: z.boolean().optional(),
});

const scheme = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('sets'), sets: z.array(setSpec) }),
  z.strictObject({
    kind: z.literal('repeat'),
    count: numberExpr,
    reps,
    maxReps: positiveInt.optional(),
    load,
    amrapLast: z.boolean().optional(),
    minReps: positiveInt.optional(),
    optional: z.boolean().optional(),
  }),
  z.strictObject({ kind: z.literal('weekTable'), table: z.string(), of: referenceVar }),
  z.strictObject({
    kind: z.literal('stages'),
    stages: z.array(z.strictObject({ sets: positiveInt, reps: positiveInt, amrapLast: z.boolean() })),
    load,
  }),
]);

const slot = z.strictObject({
  id: z.string(),
  lift: z.string(),
  role: z.enum(['main', 'supplemental', 'assistance']),
  scheme,
  when: z.array(z.strictObject({ option: z.string(), equals: optionValue })).optional(),
  weeks: z.array(positiveInt).optional(),
});

const day = z.strictObject({
  key: z.string(),
  name: z.string(),
  optional: z.boolean().optional(),
  slots: z.array(slot),
});

const schedule = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('cycle'),
    weeksPerCycle: positiveInt,
    waveWeeks: positiveInt.optional(),
    days: z.array(day),
  }),
  z.strictObject({ kind: z.literal('weekly'), days: z.array(day) }),
  z.strictObject({ kind: z.literal('rotation'), days: z.array(day) }),
]);

const stageLastFail = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('retest'), pct: z.number(), from: referenceVar }),
  z.strictObject({ kind: z.literal('resetToFirstStage'), add: unitAmount }),
]);

const adjustment = z.union([
  z.strictObject({
    kind: z.literal('increment'),
    by: unitAmountExpr,
    opening: z.strictObject({ times: positiveInt, by: unitAmountExpr }).optional(),
  }),
  z.strictObject({ kind: z.literal('increment'), byPct: numberExpr }),
  z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('hold') }),
    z.strictObject({ kind: z.literal('tmReset'), pct: numberExpr }),
    z.strictObject({ kind: z.literal('failureCounter'), threshold: positiveInt, deloadPct: numberExpr }),
    z.strictObject({ kind: z.literal('stageMachine'), onLastFail: stageLastFail }),
    z.strictObject({ kind: z.literal('amrapThreshold'), setIndex: nonNegativeInt, reps: positiveInt }),
    z.strictObject({
      kind: z.literal('amrapTable'),
      setIndex: nonNegativeInt,
      bands: z.array(z.tuple([z.number(), unitAmount])),
    }),
    z.strictObject({
      kind: z.literal('repsOverStandard'),
      setIndex: nonNegativeInt,
      standardByWave: z.array(z.number()),
      perRep: unitAmountExpr,
      cap: z.number(),
    }),
    z.strictObject({ kind: z.literal('e1rmFromSet'), setIndex: nonNegativeInt }),
    z.strictObject({ kind: z.literal('customRule'), name: z.string() }),
  ]),
]);

const option = z.discriminatedUnion('kind', [
  z.strictObject({
    key: z.string(),
    kind: z.literal('choice'),
    values: z.array(optionValue).min(1),
    default: optionValue,
    onlyForUnit: z.record(z.string(), z.enum(['kg', 'lb'])).optional(),
    source: sources,
  }),
  z.strictObject({
    key: z.string(),
    kind: z.literal('number'),
    min: z.number(),
    max: z.number(),
    default: z.number(),
    source: sources,
  }),
]);

const initial = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('copy'), var: referenceVar, from: inputKind }),
  z.strictObject({ kind: z.literal('scale'), var: referenceVar, from: inputKind, factor: numberExpr }),
  z.strictObject({
    kind: z.literal('onRamp'),
    var: referenceVar,
    from: inputKind,
    factor: z.number(),
    peakWeek: positiveInt,
  }),
]);

const progressionRule = z.strictObject({
  lift: z.string(),
  var: referenceVar,
  trigger: z.enum(['afterSession', 'endOfWeek', 'endOfCycle', 'endOfWave']),
  judgedSlots: z.array(z.string()),
  judgedWeeks: z.array(positiveInt).optional(),
  judgedSets: z.array(nonNegativeInt).min(1).optional(),
  onMet: z.array(adjustment),
  onMiss: z.array(adjustment),
  always: z.array(adjustment).optional(),
});

export const programDefinitionSchema = z.strictObject({
  key: z.string().regex(/^[a-z0-9_]+$/),
  version: positiveInt,
  name: z.string().min(1).max(60),
  source: sources,
  lifts: z.array(
    z.strictObject({
      key: z.string(),
      name: z.string(),
      category: z.enum(['upper', 'lower']).optional(),
      barbell: z.boolean().optional(),
    }),
  ),
  inputs: z.array(z.strictObject({ lifts: z.array(z.string()), kinds: z.array(inputKind).min(1) })),
  referenceVars: z.array(referenceVar),
  initial: z.array(initial),
  options: z.array(option),
  conversions: z.array(z.strictObject({ lb: z.number(), kg: z.number(), note: z.string() })).optional(),
  weekTables: z
    .record(
      z.string(),
      z.array(
        z.strictObject({
          sets: z.array(
            z.strictObject({
              pct: z.number(),
              reps: positiveInt,
              amrap: z.boolean().optional(),
              minReps: positiveInt.optional(),
            }),
          ),
        }),
      ),
    )
    .optional(),
  schedule,
  progression: z.array(progressionRule),
});

function issuePath(path: readonly PropertyKey[]): string {
  return path.map(String).join('.');
}

export function readProgramTemplateSources(dir: string = PROGRAM_TEMPLATES_DIR): ProgramTemplateSource[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.yaml'))
    .sort()
    .map((file) => ({ file, raw: parse(readFileSync(join(dir, file), 'utf8')) }));
}

export function parseProgramTemplate(source: ProgramTemplateSource): ProgramTemplate {
  const parsed = programDefinitionSchema.safeParse(source.raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issuePath(issue.path)}: ${issue.message}`);
    throw new ProgramTemplateShapeError(source.file, issues);
  }
  const definition: ProgramDefinition = parsed.data;
  return { file: source.file, definition };
}

const KG_CONVERSION_STEP = 1.25;
const KG_PER_LB_FOR_CONVERSIONS = 0.45359;

export function kgFromLb(lb: number): number {
  return Math.round((lb * KG_PER_LB_FOR_CONVERSIONS) / KG_CONVERSION_STEP) * KG_CONVERSION_STEP;
}

export function programTemplateProblems(template: ProgramTemplate): string[] {
  const { definition } = template;
  const problems: string[] = [];
  if (`${definition.key}.yaml` !== template.file) {
    problems.push(`key must equal the file name "${template.file}"`);
  }
  problems.push(...validateProgramDefinition(definition));
  for (const conversion of definition.conversions ?? []) {
    const expected = kgFromLb(conversion.lb);
    if (conversion.kg !== expected) {
      problems.push(`conversion of ${conversion.lb} lb must be ${expected} kg, got ${conversion.kg}`);
    }
  }
  return problems.map((problem) => `program template "${definition.key}": ${problem}`);
}

export function loadProgramTemplates(dir: string = PROGRAM_TEMPLATES_DIR): ProgramTemplate[] {
  const templates = readProgramTemplateSources(dir).map(parseProgramTemplate);
  const problems = templates.flatMap(programTemplateProblems);
  if (problems.length > 0) throw new CatalogValidationError(problems);
  return templates;
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function byKeyThenVersion(a: ProgramDefinition, b: ProgramDefinition): number {
  if (a.key !== b.key) return a.key < b.key ? -1 : 1;
  return a.version - b.version;
}

export function renderProgramTemplates(templates: readonly ProgramTemplate[]): string {
  const rows = templates
    .map(({ definition }) => definition)
    .sort(byKeyThenVersion)
    .map(
      (definition) =>
        `  (${sqlText(definition.key)}, ${definition.version}, ${sqlText(definition.name)}, ${sqlText(JSON.stringify(definition))}::jsonb)`,
    );
  return `insert into public.program_templates (key, version, name, definition) values\n${rows.join(',\n')}\non conflict (key, version) do nothing;`;
}

export const PROGRAM_TEMPLATES_LOCK_PATH = join(import.meta.dirname, '../../catalog/program-templates.lock.json');

export type ProgramTemplateLock = Readonly<Record<string, string>>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record)
      .sort()
      .map((field) => `${JSON.stringify(field)}:${canonicalJson(record[field])}`);
    return `{${fields.join(',')}}`;
  }
  return JSON.stringify(value);
}

function lockKey(definition: ProgramDefinition): string {
  return `${definition.key}@${definition.version}`;
}

export function readProgramTemplateLock(path: string = PROGRAM_TEMPLATES_LOCK_PATH): ProgramTemplateLock {
  return z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function programDefinitionHash(definition: ProgramDefinition): string {
  return createHash('sha256').update(canonicalJson(definition)).digest('hex');
}

export function programTemplateLockProblems(
  templates: readonly ProgramTemplate[],
  lock: ProgramTemplateLock,
): string[] {
  const problems: string[] = [];
  const templateKeys = new Set<string>();
  for (const { definition } of templates) {
    const key = lockKey(definition);
    templateKeys.add(key);
    const locked = lock[key];
    if (locked === undefined) problems.push(`program template "${key}" is missing from the lock`);
    else if (locked !== programDefinitionHash(definition)) {
      problems.push(`program template "${key}" differs from its lock entry; publish the change as a new version`);
    }
  }
  for (const key of Object.keys(lock)) {
    if (!templateKeys.has(key)) problems.push(`program template lock entry "${key}" has no template`);
  }
  return problems;
}
