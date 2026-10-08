import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GEAR_SLOTS, ITEM_ICON_KINDS, ITEM_TIERS } from '../../supabase/functions/_shared/domain/crafting.ts';
import { GEAR_SLOT_SKILLS } from '../../supabase/functions/_shared/domain/gear.ts';
import { CARDIO_EFFORT_LEVELS } from '../../supabase/functions/_shared/domain/types.ts';
import { type CatalogData, type CatalogExercise, type CatalogItem, catalogNames } from './load.ts';

const DENYLIST_PATH = join(import.meta.dirname, '../../tests/ip-denylist.txt');

const KEY_PATTERN = /^[a-z0-9_]+$/;
const MAX_NAME_LENGTH = 60;
const FULL_SHARE_BP = 10000;
const MAX_WEIGHT = 1_000_000;
const MAX_QUANTITY = 1000;
const REQUIRED_TABLES = ['regular', 'rare'];

export class CatalogValidationError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`catalog is invalid:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    this.problems = problems;
  }
}

export function readDenylist(): string[] {
  return readFileSync(DENYLIST_PATH, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function words(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

interface Named {
  key: string;
  name: string;
}

function checkKeysAndNames(kind: string, rows: readonly Named[], problems: string[]): void {
  for (const row of rows) {
    if (!KEY_PATTERN.test(row.key)) problems.push(`${kind} key "${row.key}" must match ${KEY_PATTERN}`);
    if (row.name.length < 1 || row.name.length > MAX_NAME_LENGTH) {
      problems.push(`${kind} "${row.key}" name must be 1-${MAX_NAME_LENGTH} characters`);
    }
  }
  for (const key of duplicates(rows.map((row) => row.key))) problems.push(`${kind} key "${key}" is not unique`);
  for (const name of duplicates(rows.map((row) => row.name.toLowerCase()))) {
    problems.push(`${kind} name "${name}" is not unique`);
  }
}

function inRange(value: number, lowest: number, highest: number): boolean {
  return Number.isInteger(value) && value >= lowest && value <= highest;
}

function checkModalityFields(exercise: CatalogExercise, problems: string[]): void {
  if (exercise.modality === 'lift') {
    if (exercise.loadType === null) problems.push(`lift exercise "${exercise.key}" needs a load_type`);
    if (exercise.cardio !== null) problems.push(`lift exercise "${exercise.key}" has a cardio block`);
    return;
  }
  if (exercise.loadType !== null) problems.push(`cardio exercise "${exercise.key}" has a load_type`);
  if (exercise.cardio === null) {
    problems.push(`cardio exercise "${exercise.key}" needs a cardio block`);
    return;
  }
  const levels: readonly string[] = CARDIO_EFFORT_LEVELS;
  if (!levels.includes(exercise.cardio.maxEffort)) {
    problems.push(
      `cardio exercise "${exercise.key}" max_effort "${exercise.cardio.maxEffort}" must be one of ${levels.join(', ')}`,
    );
  }
  if (exercise.cardio.recordMinDistanceM !== null && exercise.cardio.referencePaceSPerKm === null) {
    problems.push(`cardio exercise "${exercise.key}" has record_min_distance_m but no reference pace`);
  }
}

function programDays(catalog: CatalogData) {
  return catalog.programs.flatMap((program) => program.days.map((day) => ({ program, day })));
}

function exercisesByKeyOf(catalog: CatalogData): Map<string, CatalogExercise> {
  return new Map(catalog.exercises.map((exercise) => [exercise.key, exercise]));
}

function itemsByKeyOf(catalog: CatalogData): Map<string, CatalogItem> {
  return new Map(catalog.items.map((item) => [item.key, item]));
}

function checkExercises(catalog: CatalogData, problems: string[]): void {
  const skillsByKey = new Map(catalog.skills.map((skill) => [skill.key, skill]));
  const exercisesByKey = exercisesByKeyOf(catalog);
  for (const exercise of catalog.exercises) {
    checkModalityFields(exercise, problems);
    for (const share of exercise.shares) {
      const skill = skillsByKey.get(share.skill);
      if (skill === undefined) problems.push(`exercise "${exercise.key}" shares unknown skill "${share.skill}"`);
      else if (skill.modality !== exercise.modality) {
        problems.push(`exercise "${exercise.key}" shares skill "${share.skill}" of another modality`);
      }
    }
    const total = exercise.shares.reduce((sum, share) => sum + share.shareBp, 0);
    if (total !== FULL_SHARE_BP)
      problems.push(`exercise "${exercise.key}" shares sum to ${total}, not ${FULL_SHARE_BP}`);
    if (exercise.variationOf !== null) {
      const base = exercisesByKey.get(exercise.variationOf);
      if (base === undefined || base.key === exercise.key) {
        problems.push(`exercise "${exercise.key}" is a variation of unknown exercise "${exercise.variationOf}"`);
      } else if (base.modality !== exercise.modality) {
        problems.push(`exercise "${exercise.key}" is a variation of "${base.key}" of another modality`);
      }
    }
  }
}

function checkProgramDays(catalog: CatalogData, problems: string[]): void {
  const exercisesByKey = exercisesByKeyOf(catalog);
  for (const { program, day } of programDays(catalog)) {
    for (const entry of day.exercises) {
      const exercise = exercisesByKey.get(entry.exercise);
      if (exercise === undefined) {
        problems.push(`program day "${program.key}:${day.key}" uses unknown exercise "${entry.exercise}"`);
      } else if (exercise.modality === 'cardio') {
        problems.push(`program day "${program.key}:${day.key}" uses cardio exercise "${entry.exercise}"`);
      }
    }
  }
}

function checkGear(catalog: CatalogData, problems: string[]): void {
  if (catalog.gearTiers.join() !== ITEM_TIERS.join()) {
    problems.push(
      `gear tiers [${catalog.gearTiers.join(', ')}] must match ITEM_TIERS [${ITEM_TIERS.join(', ')}] in order`,
    );
  }
  if (catalog.gearSlots.join() !== GEAR_SLOTS.join()) {
    problems.push(
      `gear slots [${catalog.gearSlots.join(', ')}] must match GEAR_SLOTS [${GEAR_SLOTS.join(', ')}] in order`,
    );
  }
  const skillKeys = new Set(catalog.skills.map((skill) => skill.key));
  for (const slot of GEAR_SLOTS) {
    for (const skill of GEAR_SLOT_SKILLS[slot].filter((key) => !skillKeys.has(key))) {
      problems.push(`gear slot "${slot}" boosts unknown skill "${skill}"`);
    }
  }
  const boosted = new Set(Object.values(GEAR_SLOT_SKILLS).flat());
  for (const skill of catalog.skills.filter((candidate) => !boosted.has(candidate.key))) {
    problems.push(`skill "${skill.key}" is boosted by no gear slot`);
  }
}

function checkItems(catalog: CatalogData, problems: string[]): void {
  const exercisesByKey = exercisesByKeyOf(catalog);
  const iconKinds = new Set<string>(ITEM_ICON_KINDS);
  for (const item of catalog.items) {
    if (!iconKinds.has(item.icon)) problems.push(`item "${item.key}" has unknown icon "${item.icon}"`);
  }
  const scrollsByExercise = new Map<string, string[]>();
  for (const item of catalog.items) {
    if (item.kind !== 'scroll') {
      if (item.grants !== null) problems.push(`item "${item.key}" grants an exercise but is no scroll`);
      continue;
    }
    const granted = item.grants === null ? undefined : exercisesByKey.get(item.grants);
    if (granted === undefined || granted.variationOf === null) {
      problems.push(`scroll "${item.key}" must grant a known variation exercise`);
      continue;
    }
    scrollsByExercise.set(granted.key, [...(scrollsByExercise.get(granted.key) ?? []), item.key]);
  }
  for (const exercise of catalog.exercises.filter((candidate) => candidate.variationOf !== null)) {
    const scrolls = scrollsByExercise.get(exercise.key) ?? [];
    if (scrolls.length !== 1) {
      problems.push(`variation "${exercise.key}" needs exactly one scroll, has ${scrolls.length}`);
    }
  }
}

function checkActiveItem(
  itemsByKey: ReadonlyMap<string, CatalogItem>,
  key: string,
  where: string,
  problems: string[],
): void {
  const item = itemsByKey.get(key);
  if (item === undefined) problems.push(`${where} references unknown item "${key}"`);
  else if (item.retired) problems.push(`${where} uses retired item "${key}"`);
}

function checkDropTables(catalog: CatalogData, problems: string[]): void {
  const itemsByKey = itemsByKeyOf(catalog);
  for (const table of catalog.dropTables) {
    for (const entry of table.entries) {
      if (table.retired) {
        if (!itemsByKey.has(entry.item))
          problems.push(`drop table "${table.key}" references unknown item "${entry.item}"`);
      } else {
        checkActiveItem(itemsByKey, entry.item, `drop table "${table.key}"`, problems);
      }
      if (!inRange(entry.weight, 1, MAX_WEIGHT)) {
        problems.push(`drop table "${table.key}" entry "${entry.item}" weight must be an integer in 1-${MAX_WEIGHT}`);
      }
      if (!inRange(entry.min, 1, MAX_QUANTITY) || !inRange(entry.max, entry.min, MAX_QUANTITY)) {
        problems.push(`drop table "${table.key}" entry "${entry.item}" needs 1 <= min <= max <= ${MAX_QUANTITY}`);
      }
    }
    for (const item of duplicates(table.entries.map((entry) => entry.item))) {
      problems.push(`drop table "${table.key}" lists item "${item}" twice`);
    }
    if (!table.retired && table.entries.length === 0) problems.push(`drop table "${table.key}" has no entries`);
  }
  for (const key of REQUIRED_TABLES) {
    if (!catalog.dropTables.some((table) => table.key === key && !table.retired)) {
      problems.push(`drop table "${key}" is required`);
    }
  }
}

function checkRecipes(catalog: CatalogData, problems: string[]): void {
  const itemsByKey = itemsByKeyOf(catalog);
  for (const recipe of catalog.recipes) {
    checkActiveItem(itemsByKey, recipe.output, `recipe "${recipe.key}" output`, problems);
    if (!inRange(recipe.outputQuantity, 1, MAX_QUANTITY)) {
      problems.push(`recipe "${recipe.key}" output quantity must be 1-${MAX_QUANTITY}`);
    }
    for (const input of recipe.inputs) {
      checkActiveItem(itemsByKey, input.item, `recipe "${recipe.key}" input`, problems);
      if (!inRange(input.quantity, 1, MAX_QUANTITY)) {
        problems.push(`recipe "${recipe.key}" input "${input.item}" quantity must be 1-${MAX_QUANTITY}`);
      }
      if (input.item === recipe.output) problems.push(`recipe "${recipe.key}" consumes its own output`);
    }
    if (recipe.inputs.length === 0) problems.push(`recipe "${recipe.key}" has no inputs`);
    for (const item of duplicates(recipe.inputs.map((input) => input.item))) {
      problems.push(`recipe "${recipe.key}" lists input "${item}" twice`);
    }
    const gearInputs = recipe.inputs.filter((input) => itemsByKey.get(input.item)?.kind === 'gear').length;
    if (itemsByKey.get(recipe.output)?.kind === 'gear' && gearInputs > 1) {
      problems.push(`recipe "${recipe.key}" consumes ${gearInputs} gear items, at most 1 allowed`);
    }
  }
}

function checkDenylist(catalog: CatalogData, denylist: readonly string[], problems: string[]): void {
  const texts = [
    ...catalog.skills.flatMap((row) => [row.key, row.name]),
    ...catalog.exercises.flatMap((row) => [row.key, row.name]),
    ...catalog.programs.flatMap((row) => [row.key, row.name]),
    ...programDays(catalog).flatMap(({ day }) => [day.key, day.name]),
    ...catalog.items.flatMap((row) => [row.key, row.name, row.description]),
    ...catalog.dropTables.flatMap((row) => [row.key, row.name]),
    ...catalog.recipes.map((row) => row.key),
  ];
  for (const term of denylist) {
    const needle = words(term);
    for (const text of texts.filter((candidate) => words(candidate).includes(needle))) {
      problems.push(`"${text}" matches denylisted term "${term}"`);
    }
  }
}

export function catalogProblems(catalog: CatalogData, denylist: readonly string[]): string[] {
  const problems: string[] = [];
  checkKeysAndNames('skill', catalog.skills, problems);
  checkKeysAndNames('exercise', catalog.exercises, problems);
  checkKeysAndNames('program', catalog.programs, problems);
  for (const program of catalog.programs) checkKeysAndNames(`program ${program.key} day`, program.days, problems);
  checkKeysAndNames('item', catalog.items, problems);
  checkKeysAndNames('drop table', catalog.dropTables, problems);
  checkKeysAndNames(
    'recipe',
    catalog.recipes.map((recipe) => ({ key: recipe.key, name: recipe.key })),
    problems,
  );

  const generatedNames = [
    ...catalog.skills.map((row) => catalogNames.skill(row.key)),
    ...catalog.exercises.map((row) => catalogNames.exercise(row.key)),
    ...catalog.programs.map((row) => catalogNames.program(row.key)),
    ...programDays(catalog).map(({ program, day }) => catalogNames.programDay(program.key, day.key)),
    ...catalog.items.map((row) => catalogNames.item(row.key)),
    ...catalog.dropTables.map((row) => catalogNames.dropTable(row.key)),
    ...catalog.recipes.map((row) => catalogNames.recipe(row.key)),
  ];
  for (const name of duplicates(generatedNames)) problems.push(`generated id name "${name}" is not unique`);

  checkExercises(catalog, problems);
  checkProgramDays(catalog, problems);
  checkGear(catalog, problems);
  checkItems(catalog, problems);
  checkDropTables(catalog, problems);
  checkRecipes(catalog, problems);
  checkDenylist(catalog, denylist, problems);
  return problems;
}

export function validateCatalog(catalog: CatalogData, denylist: readonly string[] = readDenylist()): void {
  const problems = catalogProblems(catalog, denylist);
  if (problems.length > 0) throw new CatalogValidationError(problems);
}
