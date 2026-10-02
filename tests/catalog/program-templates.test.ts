import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import {
  type OptionDecl,
  parseProgramDefinition,
  type ProgramDefinition,
  type RepeatScheme,
  type SetListScheme,
  type WeekTableScheme,
} from '@domain/index.ts';
import { generateSeed } from '../../scripts/catalog/generate.ts';
import {
  kgFromLb,
  loadProgramTemplates,
  parseProgramTemplate,
  type ProgramTemplate,
  programTemplateProblems,
  ProgramTemplateShapeError,
  renderProgramTemplates,
} from '../../scripts/catalog/program-templates.ts';
import { CatalogValidationError } from '../../scripts/catalog/validate.ts';
import { FIVE_THREE_ONE } from '../domain/program-fixtures/five_three_one.ts';
import { FULL_PRIMITIVES } from '../domain/program-fixtures/full_primitives.ts';
import { GZCLP_SHAPE } from '../domain/program-fixtures/gzclp.ts';
import { LINEAR_AFTER_SESSION } from '../domain/program-fixtures/linear_after_session.ts';
import { MADCOW_5X5 } from '../domain/program-fixtures/madcow_5x5.ts';
import {
  LINEAR_DELOAD_AFTER_SESSION,
  TWO_RULES_ONE_LIFT,
  UNSUPPORTED_JUDGED_SCHEMES,
  WEEK_AND_CYCLE_RULES,
} from '../domain/program-fixtures/review-fixtures.ts';

const FIXTURE_DEFINITIONS: readonly ProgramDefinition[] = [
  FIVE_THREE_ONE,
  MADCOW_5X5,
  FULL_PRIMITIVES,
  GZCLP_SHAPE,
  LINEAR_AFTER_SESSION,
  LINEAR_DELOAD_AFTER_SESSION,
  TWO_RULES_ONE_LIFT,
  UNSUPPORTED_JUDGED_SCHEMES,
  WEEK_AND_CYCLE_RULES,
];

function asYaml(definition: ProgramDefinition): ProgramDefinition {
  return parse(stringify(definition)) as ProgramDefinition;
}

function fileOf(definition: ProgramDefinition): string {
  return `${definition.key}.yaml`;
}

function shapeIssuesAfter(
  definition: ProgramDefinition,
  mutate: (raw: ProgramDefinition) => void,
): ProgramTemplateShapeError {
  const raw = asYaml(definition);
  mutate(raw);
  try {
    parseProgramTemplate({ file: fileOf(definition), raw });
  } catch (error) {
    expect(error).toBeInstanceOf(ProgramTemplateShapeError);
    return error as ProgramTemplateShapeError;
  }
  return expect.unreachable('the template parsed although its shape is broken');
}

function problemsAfter(definition: ProgramDefinition, mutate: (copy: ProgramDefinition) => void): string[] {
  const copy = structuredClone(definition);
  mutate(copy);
  return programTemplateProblems({ file: fileOf(definition), definition: copy });
}

function slotScheme<Scheme>(definition: ProgramDefinition, day: number, slot: number): Scheme {
  return definition.schedule.days[day].slots[slot].scheme as Scheme;
}

function template(definition: ProgramDefinition): ProgramTemplate {
  return { file: fileOf(definition), definition: structuredClone(definition) };
}

const fixtureCases = FIXTURE_DEFINITIONS.map((definition) => [definition.key, definition] as const);

describe('program template schema', () => {
  it.each(fixtureCases)('round-trips the %s fixture through YAML unchanged', (_key, definition) => {
    const parsed = parseProgramTemplate({ file: fileOf(definition), raw: asYaml(definition) });
    expect(parsed.file).toBe(fileOf(definition));
    expect(parsed.definition).toEqual(definition);
  });

  it.each(fixtureCases)('finds no problem in the %s fixture', (_key, definition) => {
    expect(programTemplateProblems(template(definition))).toEqual([]);
  });

  it('refuses a template without a source and names the field', () => {
    const error = shapeIssuesAfter(FIVE_THREE_ONE, (raw) => delete (raw as Partial<ProgramDefinition>).source);
    expect(error.file).toBe('five_three_one.yaml');
    expect(error.issues.some((issue) => issue.startsWith('source'))).toBe(true);
    expect(error.message).toContain('five_three_one.yaml: source');
  });

  it('refuses a template with an empty source list', () => {
    const error = shapeIssuesAfter(MADCOW_5X5, (raw) => (raw.source = []));
    expect(error.issues.some((issue) => issue.startsWith('source'))).toBe(true);
  });

  it('refuses an option without a source and names the option by its path', () => {
    const error = shapeIssuesAfter(FIVE_THREE_ONE, (raw) => delete (raw.options[1] as Partial<OptionDecl>).source);
    expect(error.issues.some((issue) => issue.startsWith('options.1.source'))).toBe(true);
  });

  it('refuses an option with an empty source list', () => {
    const error = shapeIssuesAfter(MADCOW_5X5, (raw) => (raw.options[0].source = []));
    expect(error.issues.some((issue) => issue.startsWith('options.0.source'))).toBe(true);
  });

  it('refuses a field the definition does not have', () => {
    const error = shapeIssuesAfter(MADCOW_5X5, (raw) => Object.assign(raw.schedule.days[0], { notes: 'heavy day' }));
    expect(error.issues.some((issue) => issue.startsWith('schedule.days.0'))).toBe(true);
  });

  it('refuses an unknown load kind and points at the load', () => {
    const error = shapeIssuesAfter(MADCOW_5X5, (raw) =>
      Object.assign(slotScheme<RepeatScheme>(raw, 0, 0).load, { kind: 'percent' }),
    );
    expect(error.issues.some((issue) => issue.startsWith('schedule.days.0.slots.0.scheme.load'))).toBe(true);
    expect(error.message).toContain('madcow_5x5.yaml: schedule.days.0.slots.0.scheme.load');
  });

  it('refuses a scheme that misses a required field and points at the scheme', () => {
    const error = shapeIssuesAfter(
      FIVE_THREE_ONE,
      (raw) => delete (slotScheme<WeekTableScheme>(raw, 0, 0) as Partial<WeekTableScheme>).of,
    );
    expect(error.issues.some((issue) => issue.startsWith('schedule.days.0.slots.0.scheme'))).toBe(true);
  });

  it('refuses an unknown schedule kind', () => {
    const error = shapeIssuesAfter(FIVE_THREE_ONE, (raw) => Object.assign(raw.schedule, { kind: 'block' }));
    expect(error.issues.some((issue) => issue.startsWith('schedule'))).toBe(true);
  });

  it('refuses an unknown adjustment kind in a progression rule', () => {
    const error = shapeIssuesAfter(MADCOW_5X5, (raw) =>
      Object.assign(raw.progression[0].onMiss[0], { kind: 'deload' }),
    );
    expect(error.issues.some((issue) => issue.startsWith('progression.0.onMiss.0'))).toBe(true);
  });

  it('refuses a version that is not a positive whole number', () => {
    const error = shapeIssuesAfter(MADCOW_5X5, (raw) => (raw.version = 1.5));
    expect(error.issues.some((issue) => issue.startsWith('version'))).toBe(true);
  });
});

describe('program template problems', () => {
  it('names the template and the set when a set ref is broken', () => {
    const problems = problemsAfter(MADCOW_5X5, (copy) => {
      slotScheme<SetListScheme>(copy, 2, 0).sets[0].load = { kind: 'sameAs', ref: 'mon-nope:0' };
    });
    expect(problems).toContain(`program template "madcow_5x5": slot 'fri-squat' refers to unknown set 'mon-nope:0'`);
  });

  it('names the template and the option when an option ref is broken', () => {
    const problems = problemsAfter(FIVE_THREE_ONE, (copy) => {
      slotScheme<RepeatScheme>(copy, 0, 1).load = { kind: 'pct', pct: { option: 'bbbPercent' }, of: 'tm' };
    });
    expect(problems).toContain(`program template "five_three_one": slot 'squat-bbb' uses unknown option 'bbbPercent'`);
  });

  it('refuses a kg conversion that is not lb x 0.45359 rounded to the nearest 1.25 kg', () => {
    const problems = problemsAfter(FIVE_THREE_ONE, (copy) => {
      copy.conversions = [
        { lb: 5, kg: 2.27, note: 'upper-body cycle increment' },
        { lb: 10, kg: 5, note: 'lower-body cycle increment' },
      ];
    });
    expect(problems).toEqual([`program template "five_three_one": conversion of 5 lb must be 2.5 kg, got 2.27`]);
  });

  it('refuses a kg conversion rounded up a whole step too far', () => {
    const problems = problemsAfter(GZCLP_SHAPE, (copy) => {
      copy.conversions = [
        { lb: 5, kg: 2.5, note: 'upper-body increment' },
        { lb: 10, kg: 5, note: 'lower-body increment' },
        { lb: 15, kg: 7.5, note: 'T2 reset add-on' },
      ];
    });
    expect(problems).toEqual([`program template "gzclp": conversion of 15 lb must be 6.25 kg, got 7.5`]);
  });

  it('refuses a key that differs from the file name', () => {
    const problems = problemsAfter(FIVE_THREE_ONE, (copy) => (copy.key = 'five_three_one_bbb'));
    expect(problems).toContain(
      `program template "five_three_one_bbb": key must equal the file name "five_three_one.yaml"`,
    );
  });

  it('lists every problem in one pass', () => {
    const problems = problemsAfter(FIVE_THREE_ONE, (copy) => {
      copy.conversions = [
        { lb: 5, kg: 2.27, note: 'upper-body cycle increment' },
        { lb: 10, kg: 4.5, note: 'lower-body cycle increment' },
      ];
      slotScheme<RepeatScheme>(copy, 0, 1).load = { kind: 'pct', pct: { option: 'bbbPercent' }, of: 'tm' };
    });
    expect(problems).toHaveLength(3);
  });
});

describe('kgFromLb', () => {
  it.each([
    [5, 2.5],
    [10, 5],
    [15, 6.25],
    [20, 8.75],
    [2.5, 1.25],
    [1.25, 0],
    [45, 20],
    [135, 61.25],
  ])('converts %d lb to %d kg', (lb, kg) => {
    expect(kgFromLb(lb)).toBe(kg);
  });
});

describe('catalog program templates', () => {
  it('ships five_three_one and madcow_5x5, ordered by file name', () => {
    const files = loadProgramTemplates().map((loaded) => loaded.file);
    expect(files).toContain('five_three_one.yaml');
    expect(files).toContain('madcow_5x5.yaml');
    expect(files).toEqual([...files].sort());
  });

  it('keeps five_three_one.yaml equal to the 5/3/1 domain fixture', () => {
    const loaded = loadProgramTemplates().find((candidate) => candidate.file === 'five_three_one.yaml');
    expect(loaded?.definition).toEqual(FIVE_THREE_ONE);
  });

  it('keeps madcow_5x5.yaml equal to the Madcow domain fixture', () => {
    const loaded = loadProgramTemplates().find((candidate) => candidate.file === 'madcow_5x5.yaml');
    expect(loaded?.definition).toEqual(MADCOW_5X5);
  });

  it('ships only templates the domain parser accepts as supported', () => {
    for (const loaded of loadProgramTemplates()) {
      const parsed = parseProgramDefinition(JSON.parse(JSON.stringify(loaded.definition)));
      expect(parsed.kind, loaded.file).toBe('ok');
    }
  });
});

describe('loading program templates from a directory', () => {
  let dir: string | null = null;

  function directoryWith(files: Record<string, unknown>): string {
    dir = mkdtempSync(join(tmpdir(), 'program-templates-'));
    for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, file), stringify(content));
    return dir;
  }

  afterEach(() => {
    if (dir !== null) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('loads every YAML file, sorted by file name', () => {
    const loaded = loadProgramTemplates(
      directoryWith({ 'madcow_5x5.yaml': MADCOW_5X5, 'five_three_one.yaml': FIVE_THREE_ONE }),
    );
    expect(loaded).toEqual([
      { file: 'five_three_one.yaml', definition: FIVE_THREE_ONE },
      { file: 'madcow_5x5.yaml', definition: MADCOW_5X5 },
    ]);
  });

  it('throws a catalog validation error listing the problems of every template', () => {
    const wrongConversion: ProgramDefinition = {
      ...structuredClone(FIVE_THREE_ONE),
      conversions: [
        { lb: 5, kg: 2.27, note: 'upper-body cycle increment' },
        { lb: 10, kg: 5, note: 'lower-body cycle increment' },
      ],
    };
    const wrongKey = { ...structuredClone(MADCOW_5X5), key: 'madcow' };
    try {
      loadProgramTemplates(directoryWith({ 'five_three_one.yaml': wrongConversion, 'madcow_5x5.yaml': wrongKey }));
      expect.unreachable('invalid templates loaded');
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogValidationError);
      expect((error as CatalogValidationError).problems).toEqual([
        `program template "five_three_one": conversion of 5 lb must be 2.5 kg, got 2.27`,
        `program template "madcow": key must equal the file name "madcow_5x5.yaml"`,
      ]);
    }
  });

  it('throws a shape error naming the file when a template has the wrong shape', () => {
    const broken: Partial<ProgramDefinition> = asYaml(MADCOW_5X5);
    delete broken.schedule;
    const brokenDir = directoryWith({ 'madcow_5x5.yaml': broken });
    expect(() => loadProgramTemplates(brokenDir)).toThrow(ProgramTemplateShapeError);
    expect(() => loadProgramTemplates(brokenDir)).toThrow(/madcow_5x5\.yaml: schedule/);
  });
});

const PROGRAM_TEMPLATES_INSERT = 'insert into public.program_templates (key, version, name, definition) values\n';
const PROGRAM_TEMPLATES_UPSERT =
  'on conflict (key, version) do update set name = excluded.name, definition = excluded.definition;';

function renderedDefinition(sql: string, key: string, version: number, name: string): unknown {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const row = new RegExp(`\\('${key}', ${version}, '${escapedName}', '(.*?)'::jsonb\\)`).exec(sql);
  if (row === null) throw new Error(`no program_templates row for ${key} v${version}`);
  return JSON.parse(row[1].replaceAll("''", "'"));
}

describe('program template seed rows', () => {
  it('renders one upsert keyed by key and version with the definition as jsonb', () => {
    const sql = renderProgramTemplates([template(MADCOW_5X5), template(FIVE_THREE_ONE)]);
    expect(sql.startsWith(PROGRAM_TEMPLATES_INSERT)).toBe(true);
    expect(sql.endsWith(PROGRAM_TEMPLATES_UPSERT)).toBe(true);
    expect(renderedDefinition(sql, 'five_three_one', 1, '5/3/1')).toEqual(FIVE_THREE_ONE);
    expect(renderedDefinition(sql, 'madcow_5x5', 1, 'Madcow 5x5')).toEqual(MADCOW_5X5);
  });

  it('renders the rows in key and version order whatever the input order', () => {
    const forwards = renderProgramTemplates([template(FIVE_THREE_ONE), template(MADCOW_5X5)]);
    const backwards = renderProgramTemplates([template(MADCOW_5X5), template(FIVE_THREE_ONE)]);
    expect(backwards).toBe(forwards);
    expect(forwards.indexOf("('five_three_one', 1,")).toBeLessThan(forwards.indexOf("('madcow_5x5', 1,"));
  });

  it('escapes quotes in the name and in the definition', () => {
    const quoted = { ...structuredClone(FIVE_THREE_ONE), name: "Wendler's 5/3/1", source: ["Wendler's site"] };
    const sql = renderProgramTemplates([{ file: 'five_three_one.yaml', definition: quoted }]);
    expect(sql).toContain(`('five_three_one', 1, 'Wendler''s 5/3/1', '`);
    expect(renderedDefinition(sql, 'five_three_one', 1, "Wendler''s 5/3/1")).toEqual(quoted);
  });

  it('puts the catalog templates into the generated seed, inside its transaction', () => {
    const seed = generateSeed();
    const rows = renderProgramTemplates(loadProgramTemplates());
    expect(seed).toContain(rows);
    expect(seed.indexOf(rows)).toBeLessThan(seed.lastIndexOf('commit;'));
    expect(renderedDefinition(seed, 'madcow_5x5', 1, 'Madcow 5x5')).toEqual(MADCOW_5X5);
  });

  it('generates the same template rows every time', () => {
    expect(renderProgramTemplates(loadProgramTemplates())).toBe(renderProgramTemplates(loadProgramTemplates()));
  });
});
