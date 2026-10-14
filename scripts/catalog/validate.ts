import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GEAR_SLOTS, ITEM_ICON_KINDS, ITEM_TIERS } from '../../supabase/functions/_shared/domain/crafting.ts';
import { GEAR_SLOT_SKILLS, SKILLS_WITHOUT_GEAR } from '../../supabase/functions/_shared/domain/gear.ts';
import { CARDIO_EFFORT_LEVELS } from '../../supabase/functions/_shared/domain/types.ts';
import { MOBILITY_SKILL_KEY } from '../../supabase/functions/_shared/domain/cardio.ts';
import {
  type CatalogChallengeDefinition,
  type CatalogData,
  type CatalogExercise,
  type CatalogItem,
  type CatalogQuest,
  type CatalogQuestStep,
  catalogNames,
} from './load.ts';

const DENYLIST_PATH = join(import.meta.dirname, '../../tests/ip-denylist.txt');

const KEY_PATTERN = /^[a-z0-9_]+$/;
const MAX_NAME_LENGTH = 60;
const FULL_SHARE_BP = 10000;
const MAX_WEIGHT = 1_000_000;
const MAX_QUANTITY = 1000;
const MAX_PROGRAM_SETS = 10;
const MAX_PROGRAM_REPS = 100;
const MAX_DAY_EXERCISES = 20;
const MAX_PROGRAM_DAYS = 14;
const MAX_DAY_NAME_LENGTH = 40;
const REQUIRED_TABLES = ['regular', 'rare'];
const MAX_QUEST_DESCRIPTION_LENGTH = 280;
const MAX_QUEST_POINTS = 10;
const MIN_REQUIRED_LEVEL = 2;
const MAX_REQUIRED_LEVEL = 99;
const MAX_QUEST_STEPS = 10;
const MAX_SESSIONS_TARGET = 100;
const MAX_QUEST_REWARD_XP = 5000;

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
  if (exercise.measure !== 'reps') problems.push(`cardio exercise "${exercise.key}" has a measure`);
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
  if (!exercise.cardio.tracksDistance && exercise.cardio.referencePaceSPerKm !== null) {
    problems.push(`cardio exercise "${exercise.key}" tracks no distance but has a reference pace`);
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
      if (!inRange(share.shareBp, 1, FULL_SHARE_BP)) {
        problems.push(
          `exercise "${exercise.key}" share of skill "${share.skill}" must be an integer in 1-${FULL_SHARE_BP}`,
        );
      }
      const skill = skillsByKey.get(share.skill);
      if (skill === undefined) problems.push(`exercise "${exercise.key}" shares unknown skill "${share.skill}"`);
      else if (skill.modality !== exercise.modality) {
        problems.push(`exercise "${exercise.key}" shares skill "${share.skill}" of another modality`);
      }
    }
    if (exercise.shares.length > 1 && exercise.shares.some((share) => share.skill === MOBILITY_SKILL_KEY)) {
      problems.push(`exercise "${exercise.key}" shares Mobility with another skill`);
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
      } else if (base.measure !== exercise.measure) {
        problems.push(
          `exercise "${exercise.key}" measures ${exercise.measure} but its base "${base.key}" measures ${base.measure}`,
        );
      }
    }
  }
}

function checkProgramDays(catalog: CatalogData, problems: string[]): void {
  const exercisesByKey = exercisesByKeyOf(catalog);
  for (const program of catalog.programs) {
    if (program.days.length > MAX_PROGRAM_DAYS) {
      problems.push(`program "${program.key}" has ${program.days.length} days, at most ${MAX_PROGRAM_DAYS} allowed`);
    }
  }
  for (const { program, day } of programDays(catalog)) {
    const where = `program day "${program.key}:${day.key}"`;
    if (day.name.length > MAX_DAY_NAME_LENGTH) {
      problems.push(`${where} name must be at most ${MAX_DAY_NAME_LENGTH} characters`);
    }
    if (day.exercises.length > MAX_DAY_EXERCISES) {
      problems.push(`${where} has ${day.exercises.length} exercises, at most ${MAX_DAY_EXERCISES} allowed`);
    }
    day.exercises.forEach((entry, index) => {
      const exercise = exercisesByKey.get(entry.exercise);
      if (exercise === undefined) {
        problems.push(`${where} uses unknown exercise "${entry.exercise}"`);
      } else if (exercise.modality === 'cardio') {
        problems.push(`${where} uses cardio exercise "${entry.exercise}"`);
      } else if (exercise.measure !== 'reps') {
        problems.push(`${where} uses hold exercise "${entry.exercise}"`);
      }
      if (!inRange(entry.sets, 1, MAX_PROGRAM_SETS)) {
        problems.push(`${where} exercise ${index + 1} needs 1-${MAX_PROGRAM_SETS} sets`);
      }
      if (!inRange(entry.repsMin, 1, MAX_PROGRAM_REPS) || !inRange(entry.repsMax, entry.repsMin, MAX_PROGRAM_REPS)) {
        problems.push(`${where} exercise ${index + 1} needs 1 <= reps_min <= reps_max <= ${MAX_PROGRAM_REPS}`);
      }
    });
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
  const boosted = new Set([...Object.values(GEAR_SLOT_SKILLS).flat(), ...SKILLS_WITHOUT_GEAR]);
  for (const skill of catalog.skills.filter((candidate) => !boosted.has(candidate.key))) {
    problems.push(`skill "${skill.key}" is boosted by no gear slot`);
  }
}

function checkItems(catalog: CatalogData, problems: string[]): void {
  const iconKinds = new Set<string>(ITEM_ICON_KINDS);
  for (const item of catalog.items) {
    if (!iconKinds.has(item.icon)) problems.push(`item "${item.key}" has unknown icon "${item.icon}"`);
  }
}

function checkChallengeExercise(
  where: string,
  exercisesByKey: ReadonlyMap<string, CatalogExercise>,
  key: string,
  hasPercentage: boolean,
  problems: string[],
): void {
  const exercise = exercisesByKey.get(key);
  if (exercise === undefined) problems.push(`${where} uses unknown exercise "${key}"`);
  else if (exercise.modality !== 'lift') problems.push(`${where} uses cardio exercise "${key}"`);
  else if (exercise.measure !== 'reps') problems.push(`${where} uses hold exercise "${key}"`);
  else if (hasPercentage && exercise.loadType !== 'external') {
    problems.push(`${where} sets a percentage on "${key}", which has no external load`);
  }
}

function checkChallengeContents(
  where: string,
  challenge: CatalogChallengeDefinition,
  exercisesByKey: ReadonlyMap<string, CatalogExercise>,
  problems: string[],
): void {
  const seenExercises = new Set<string>();
  for (const superset of challenge.supersets) {
    if (superset.exercises.length < 2) {
      problems.push(`${where} superset needs at least 2 exercises`);
    }
    if (superset.rounds < 1 || superset.exercises.some((entry) => entry.reps < 1)) {
      problems.push(`${where} needs rounds and reps of at least 1`);
    }
    for (const entry of superset.exercises) {
      checkChallengeExercise(where, exercisesByKey, entry.exercise, entry.pct !== null, problems);
      if (seenExercises.has(entry.exercise)) {
        problems.push(`${where} repeats exercise "${entry.exercise}"`);
      }
      seenExercises.add(entry.exercise);
    }
  }
  const volume = challenge.volume;
  if (volume === null) return;
  if (!(volume.target > 0)) problems.push(`${where} needs a volume target above 0`);
  if (volume.exercise !== null) {
    checkChallengeExercise(where, exercisesByKey, volume.exercise, volume.minPct !== null, problems);
  } else if (volume.minPct !== null) {
    problems.push(`${where} sets min_pct without an exercise`);
  }
}

function checkChallengeKind(where: string, challenge: CatalogChallengeDefinition, problems: string[]): void {
  if (challenge.kind === 'prescription') {
    if (challenge.supersets.length === 0 || challenge.volume !== null) {
      problems.push(`${where} of kind prescription needs supersets and no volume`);
    }
  } else if (challenge.volume === null || challenge.supersets.length > 0) {
    problems.push(`${where} of kind volume needs a volume and no supersets`);
  }
}

function checkChallenges(catalog: CatalogData, problems: string[]): void {
  const exercisesByKey = exercisesByKeyOf(catalog);
  const challengeKeys = new Set(catalog.challenges.map((challenge) => challenge.key));
  const scrollsByChallenge = new Map<string, string[]>();
  for (const item of catalog.items) {
    if (item.kind !== 'scroll') {
      if (item.grants !== null) problems.push(`item "${item.key}" grants a challenge but is no scroll`);
      continue;
    }
    if (item.grants === null || !challengeKeys.has(item.grants)) {
      problems.push(`scroll "${item.key}" must grant a known challenge`);
      continue;
    }
    scrollsByChallenge.set(item.grants, [...(scrollsByChallenge.get(item.grants) ?? []), item.key]);
  }
  for (const challenge of catalog.challenges) {
    const where = `challenge "${challenge.key}"`;
    checkChallengeKind(where, challenge, problems);
    checkChallengeContents(where, challenge, exercisesByKey, problems);
    const scrolls = scrollsByChallenge.get(challenge.key) ?? [];
    if (scrolls.length !== 1) {
      problems.push(`challenge "${challenge.key}" needs exactly one scroll, has ${scrolls.length}`);
    }
  }
}

function checkKnownExercise(
  where: string,
  exercisesByKey: ReadonlyMap<string, CatalogExercise>,
  key: string | null,
  problems: string[],
): void {
  if (key !== null && !exercisesByKey.has(key)) problems.push(`${where} uses unknown exercise "${key}"`);
}

function checkQuestStep(
  where: string,
  step: CatalogQuestStep,
  exercisesByKey: ReadonlyMap<string, CatalogExercise>,
  problems: string[],
): void {
  switch (step.kind) {
    case 'workout':
      if (step.challenge.supersets.length > 0 === (step.challenge.volume !== null)) {
        problems.push(`${where} needs supersets or a volume, not both`);
      }
      checkChallengeContents(where, step.challenge, exercisesByKey, problems);
      return;
    case 'volume':
      if (!(step.target > 0)) problems.push(`${where} needs a volume target above 0`);
      if (step.exercise !== null) checkChallengeExercise(where, exercisesByKey, step.exercise, false, problems);
      return;
    case 'record':
      checkKnownExercise(where, exercisesByKey, step.exercise, problems);
      return;
    case 'sessions':
      if (!inRange(step.target, 1, MAX_SESSIONS_TARGET)) {
        problems.push(`${where} needs a sessions target that is an integer in 1-${MAX_SESSIONS_TARGET}`);
      }
      checkKnownExercise(where, exercisesByKey, step.exercise, problems);
  }
}

function questsInRequirementCycles(quests: readonly CatalogQuest[]): Set<string> {
  const requiredBy = new Map(quests.map((quest) => [quest.key, quest.requiredQuests]));
  const leadsBackTo = (start: string): boolean => {
    const seen = new Set<string>();
    const pending = [...(requiredBy.get(start) ?? [])];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      if (next === start) return true;
      if (seen.has(next)) continue;
      seen.add(next);
      pending.push(...(requiredBy.get(next) ?? []));
    }
    return false;
  };
  return new Set(quests.map((quest) => quest.key).filter(leadsBackTo));
}

function checkQuests(catalog: CatalogData, problems: string[]): void {
  const exercisesByKey = exercisesByKeyOf(catalog);
  const skillKeys = new Set(catalog.skills.map((skill) => skill.key));
  const questKeys = new Set(catalog.quests.map((quest) => quest.key));
  const inCycles = questsInRequirementCycles(catalog.quests);
  for (const quest of catalog.quests) {
    const where = `quest "${quest.key}"`;
    if (quest.description.length < 1 || quest.description.length > MAX_QUEST_DESCRIPTION_LENGTH) {
      problems.push(`${where} description must be 1-${MAX_QUEST_DESCRIPTION_LENGTH} characters`);
    }
    if (!inRange(quest.questPoints, 1, MAX_QUEST_POINTS)) {
      problems.push(`${where} quest_points must be an integer in 1-${MAX_QUEST_POINTS}`);
    }
    for (const required of quest.requiredLevels) {
      if (!skillKeys.has(required.skill)) problems.push(`${where} requires unknown skill "${required.skill}"`);
      if (!inRange(required.level, MIN_REQUIRED_LEVEL, MAX_REQUIRED_LEVEL)) {
        problems.push(
          `${where} requires skill "${required.skill}" at level ${required.level}, which must be an integer in ${MIN_REQUIRED_LEVEL}-${MAX_REQUIRED_LEVEL}`,
        );
      }
    }
    for (const required of quest.requiredQuests) {
      if (required === quest.key) problems.push(`${where} requires itself`);
      else if (!questKeys.has(required)) problems.push(`${where} requires unknown quest "${required}"`);
    }
    if (inCycles.has(quest.key)) problems.push(`${where} is part of a requirement cycle`);
    if (quest.steps.length < 1 || quest.steps.length > MAX_QUEST_STEPS) {
      problems.push(`${where} needs 1-${MAX_QUEST_STEPS} steps, has ${quest.steps.length}`);
    }
    quest.steps.forEach((step, index) => checkQuestStep(`${where} step ${index + 1}`, step, exercisesByKey, problems));
    if (quest.rewardXp.length === 0) problems.push(`${where} rewards no XP`);
    for (const reward of quest.rewardXp) {
      if (!skillKeys.has(reward.skill)) problems.push(`${where} rewards unknown skill "${reward.skill}"`);
      if (!inRange(reward.xp, 1, MAX_QUEST_REWARD_XP)) {
        problems.push(
          `${where} rewards skill "${reward.skill}" ${reward.xp} XP, which must be an integer in 1-${MAX_QUEST_REWARD_XP}`,
        );
      }
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
    ...catalog.challenges.flatMap((row) => [row.key, row.name]),
    ...catalog.quests.flatMap((row) => [row.key, row.name, row.description]),
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
  for (const sortOrder of duplicates(catalog.skills.map((skill) => String(skill.sortOrder)))) {
    problems.push(`skill sort_order ${sortOrder} is not unique`);
  }
  checkKeysAndNames('exercise', catalog.exercises, problems);
  checkKeysAndNames('program', catalog.programs, problems);
  for (const program of catalog.programs) checkKeysAndNames(`program ${program.key} day`, program.days, problems);
  checkKeysAndNames('challenge', catalog.challenges, problems);
  checkKeysAndNames('quest', catalog.quests, problems);
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
    ...catalog.challenges.map((row) => catalogNames.challenge(row.key)),
    ...catalog.quests.map((row) => catalogNames.quest(row.key)),
    ...catalog.items.map((row) => catalogNames.item(row.key)),
    ...catalog.dropTables.map((row) => catalogNames.dropTable(row.key)),
    ...catalog.recipes.map((row) => catalogNames.recipe(row.key)),
  ];
  for (const name of duplicates(generatedNames)) problems.push(`generated id name "${name}" is not unique`);

  checkExercises(catalog, problems);
  checkProgramDays(catalog, problems);
  checkGear(catalog, problems);
  checkItems(catalog, problems);
  checkChallenges(catalog, problems);
  checkDropTables(catalog, problems);
  checkRecipes(catalog, problems);
  checkQuests(catalog, problems);
  checkDenylist(catalog, denylist, problems);
  return problems;
}

export function validateCatalog(catalog: CatalogData, denylist: readonly string[] = readDenylist()): void {
  const problems = catalogProblems(catalog, denylist);
  if (problems.length > 0) throw new CatalogValidationError(problems);
}
