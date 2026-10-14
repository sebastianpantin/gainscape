import { describe, expect, it } from 'vitest';
import { type CatalogData, expandCatalog, loadCatalogData, readCatalogSources } from '../../scripts/catalog/load.ts';
import {
  CatalogValidationError,
  catalogProblems,
  readDenylist,
  validateCatalog,
} from '../../scripts/catalog/validate.ts';

const real = loadCatalogData();
const denylist = readDenylist();

function problemsAfter(mutate: (catalog: CatalogData) => void): string[] {
  const catalog = structuredClone(real);
  mutate(catalog);
  return catalogProblems(catalog, denylist);
}

const find = <T extends { key: string }>(rows: T[], key: string): T => rows.find((row) => row.key === key)!;

describe('catalog validation', () => {
  it('accepts the real catalog, denylist included', () => {
    expect(denylist).toContain('grand exchange');
    expect(catalogProblems(real, denylist)).toEqual([]);
    expect(() => validateCatalog(real)).not.toThrow();
  });

  it('lists every problem when it throws', () => {
    const catalog = structuredClone(real);
    catalog.skills[0].key = 'Bad Key';
    catalog.items[0].name = '';
    try {
      validateCatalog(catalog, denylist);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogValidationError);
      expect((error as CatalogValidationError).problems.length).toBeGreaterThanOrEqual(2);
    }
  });

  it.each<[string, (catalog: CatalogData) => void, RegExp]>([
    [
      'keys match the key pattern',
      (c) => (find(c.items, 'plate_crab').key = 'Plate-Crab'),
      /key "Plate-Crab" must match/,
    ],
    [
      'keys are unique per kind',
      (c) => (find(c.exercises, 'deadlift').key = 'back_squat'),
      /exercise key "back_squat" is not unique/,
    ],
    [
      'generated names are unique',
      (c) => c.programs[0].days.push({ ...c.programs[0].days[0], name: 'Another push' }),
      /generated id name "program:ppl:push" is not unique/,
    ],
    ['names are at least 1 character', (c) => (find(c.items, 'plate_crab').name = ''), /name must be 1-60 characters/],
    [
      'names are at most 60 characters',
      (c) => (find(c.items, 'plate_crab').name = 'x'.repeat(61)),
      /name must be 1-60/,
    ],
    [
      'names are unique per kind, case-insensitively',
      (c) => (find(c.items, 'plate_crab').name = 'SPOTTER PUP'),
      /item name "spotter pup" is not unique/,
    ],
    [
      'shares reference existing skills',
      (c) => (find(c.exercises, 'deadlift').shares[0].skill = 'neck'),
      /shares unknown skill "neck"/,
    ],
    ['shares sum to 10000', (c) => (find(c.exercises, 'deadlift').shares[0].shareBp = 3000), /shares sum to 9000/],
    [
      'each share is 1-10000 basis points',
      (c) => {
        const shares = find(c.exercises, 'deadlift').shares;
        shares[0].shareBp += shares[1].shareBp;
        shares[1].shareBp = 0;
      },
      /exercise "deadlift" share of skill "[a-z_]+" must be an integer in 1-10000/,
    ],
    [
      'skill sort orders are unique',
      (c) => (c.skills[1].sortOrder = c.skills[0].sortOrder),
      /skill sort_order \d+ is not unique/,
    ],
    [
      'program sets are 1-10',
      (c) => (c.programs[0].days[0].exercises[0].sets = 11),
      /program day "ppl:push" exercise 1 needs 1-10 sets/,
    ],
    [
      'program sets are at least 1',
      (c) => (c.programs[0].days[0].exercises[0].sets = 0),
      /program day "ppl:push" exercise 1 needs 1-10 sets/,
    ],
    [
      'program reps_min is at most reps_max',
      (c) => Object.assign(c.programs[0].days[0].exercises[0], { repsMin: 12, repsMax: 5 }),
      /program day "ppl:push" exercise 1 needs 1 <= reps_min <= reps_max <= 100/,
    ],
    [
      'program reps_max is at most 100',
      (c) => (c.programs[0].days[0].exercises[0].repsMax = 101),
      /program day "ppl:push" exercise 1 needs 1 <= reps_min <= reps_max <= 100/,
    ],
    [
      'program days hold at most 20 exercises',
      (c) => {
        const day = c.programs[0].days[0];
        day.exercises = Array.from({ length: 21 }, () => ({ ...day.exercises[0] }));
      },
      /program day "ppl:push" has 21 exercises, at most 20 allowed/,
    ],
    [
      'programs have at most 14 days',
      (c) => {
        const program = c.programs[0];
        program.days = Array.from({ length: 15 }, (_, index) => ({
          ...program.days[0],
          key: `day_${index}`,
          name: `Day ${index}`,
        }));
      },
      /program "ppl" has 15 days, at most 14 allowed/,
    ],
    [
      'program day names are at most 40 characters',
      (c) => (c.programs[0].days[0].name = 'x'.repeat(41)),
      /program day "ppl:push" name must be at most 40 characters/,
    ],
    [
      'variation_of references a built-in exercise',
      (c) => (find(c.exercises, 'pause_squat').variationOf = 'not_an_exercise'),
      /variation of unknown exercise "not_an_exercise"/,
    ],
    [
      'every scroll grants a known challenge',
      (c) => (find(c.items, 'scroll_pause_squat').grants = 'pause_squat'),
      /scroll "scroll_pause_squat" must grant a known challenge/,
    ],
    [
      'a challenge has no more than one scroll',
      (c) => (find(c.items, 'scroll_z_press').grants = 'squat_century'),
      /challenge "squat_century" needs exactly one scroll, has 2/,
    ],
    [
      'a challenge has at least one scroll',
      (c) => (c.items = c.items.filter((item) => item.key !== 'scroll_pause_squat')),
      /challenge "squat_century" needs exactly one scroll, has 0/,
    ],
    [
      'only scrolls grant challenges',
      (c) => (find(c.items, 'plate_crab').grants = 'squat_century'),
      /item "plate_crab" grants a challenge but is no scroll/,
    ],
    [
      'challenge exercises exist',
      (c) => (find(c.challenges, 'deadlift_and_pull_up').supersets[0].exercises[0].exercise = 'deadlif'),
      /challenge "deadlift_and_pull_up" uses unknown exercise "deadlif"/,
    ],
    [
      'challenge exercises are lifts',
      (c) => (find(c.challenges, 'squat_century').volume!.exercise = 'running'),
      /challenge "squat_century" uses cardio exercise "running"/,
    ],
    [
      'a superset has at least 2 exercises',
      (c) => find(c.challenges, 'deadlift_and_pull_up').supersets[0].exercises.pop(),
      /challenge "deadlift_and_pull_up" superset needs at least 2 exercises/,
    ],
    [
      'a challenge does not repeat an exercise within a superset',
      (c) => (find(c.challenges, 'deadlift_and_pull_up').supersets[0].exercises[1].exercise = 'deadlift'),
      /challenge "deadlift_and_pull_up" repeats exercise "deadlift"/,
    ],
    [
      'a challenge does not repeat an exercise across supersets',
      (c) =>
        find(c.challenges, 'bench_and_row').supersets.push({
          rounds: 3,
          exercises: [
            { exercise: 'barbell_row', reps: 8, pct: 65 },
            { exercise: 'pull_up', reps: 8, pct: null },
          ],
        }),
      /challenge "bench_and_row" repeats exercise "barbell_row"/,
    ],
    [
      'a superset has at least 1 round',
      (c) => (find(c.challenges, 'bench_and_row').supersets[0].rounds = 0),
      /challenge "bench_and_row" needs rounds and reps of at least 1/,
    ],
    [
      'a superset exercise has at least 1 rep',
      (c) => (find(c.challenges, 'bench_and_row').supersets[0].exercises[1].reps = 0),
      /challenge "bench_and_row" needs rounds and reps of at least 1/,
    ],
    [
      'pct applies to an external load only',
      (c) => (find(c.challenges, 'deadlift_and_pull_up').supersets[0].exercises[1].pct = 70),
      /challenge "deadlift_and_pull_up" sets a percentage on "pull_up", which has no external load/,
    ],
    [
      'min_pct applies to an external exercise only',
      (c) => (find(c.challenges, 'squat_century').volume!.exercise = 'pull_up'),
      /challenge "squat_century" sets a percentage on "pull_up", which has no external load/,
    ],
    [
      'min_pct needs an exercise',
      (c) => (find(c.challenges, 'ten_ton_day').volume!.minPct = 50),
      /challenge "ten_ton_day" sets min_pct without an exercise/,
    ],
    [
      'a volume target is above 0',
      (c) => (find(c.challenges, 'ten_ton_day').volume!.target = 0),
      /challenge "ten_ton_day" needs a volume target above 0/,
    ],
    [
      'a prescription challenge has supersets',
      (c) => (find(c.challenges, 'dips_and_curls').supersets = []),
      /challenge "dips_and_curls" of kind prescription needs supersets and no volume/,
    ],
    [
      'a volume challenge has a volume block',
      (c) => (find(c.challenges, 'ten_ton_day').volume = null),
      /challenge "ten_ton_day" of kind volume needs a volume and no supersets/,
    ],
    [
      'challenge names are unique',
      (c) => (find(c.challenges, 'ten_ton_day').name = 'squat century'),
      /challenge name "squat century" is not unique/,
    ],
    [
      'no denylisted term appears in a challenge name',
      (c) => (find(c.challenges, 'ten_ton_day').name = 'Party Hat Day'),
      /"Party Hat Day" matches denylisted term "party hat"/,
    ],
    [
      'drop entries reference items',
      (c) => (find(c.dropTables, 'rare').entries[0].item = 'golden_goose'),
      /drop table "rare" references unknown item "golden_goose"/,
    ],
    [
      'drop weights are integers in range',
      (c) => (find(c.dropTables, 'rare').entries[0].weight = 1.5),
      /weight must be an integer in 1-1000000/,
    ],
    [
      'drop weights are at most 1 000 000',
      (c) => (find(c.dropTables, 'rare').entries[0].weight = 1_000_001),
      /weight must be an integer/,
    ],
    [
      'drop quantities satisfy min <= max',
      (c) => Object.assign(find(c.dropTables, 'rare').entries[0], { min: 3, max: 2 }),
      /needs 1 <= min <= max <= 1000/,
    ],
    [
      'drop quantities are at least 1',
      (c) => Object.assign(find(c.dropTables, 'rare').entries[0], { min: 0 }),
      /needs 1 <= min <= max/,
    ],
    [
      'drop quantities are at most 1000',
      (c) => Object.assign(find(c.dropTables, 'rare').entries[0], { max: 1001 }),
      /needs 1 <= min <= max <= 1000/,
    ],
    [
      'recipe inputs reference items',
      (c) => (find(c.recipes, 'grinder_belt').inputs[0].item = 'golden_goose'),
      /recipe "grinder_belt" input references unknown item "golden_goose"/,
    ],
    [
      'recipe input quantities are 1-1000',
      (c) => (find(c.recipes, 'grinder_belt').inputs[1].quantity = 0),
      /input "grinder_scraps" quantity must be 1-1000/,
    ],
    [
      'a recipe output is never among its own inputs',
      (c) => (find(c.recipes, 'grinder_belt').inputs[0].item = 'grinder_belt'),
      /recipe "grinder_belt" consumes its own output/,
    ],
    [
      'the regular table exists',
      (c) => (c.dropTables = c.dropTables.filter((table) => table.key !== 'regular')),
      /drop table "regular" is required/,
    ],
    ['the rare table exists', (c) => (find(c.dropTables, 'rare').retired = true), /drop table "rare" is required/],
    [
      'icons are known icon kinds',
      (c) => (find(c.items, 'plate_crab').icon = 'crab'),
      /item "plate_crab" has unknown icon "crab"/,
    ],
    [
      'an active drop table has entries',
      (c) => (find(c.dropTables, 'rare').entries = []),
      /drop table "rare" has no entries/,
    ],
    [
      'no retired item appears in an active table',
      (c) => (find(c.items, 'plate_crab').retired = true),
      /drop table "rare" uses retired item "plate_crab"/,
    ],
    [
      'no retired item appears in a recipe',
      (c) => (find(c.items, 'rookie_belt').retired = true),
      /recipe "grinder_belt" input uses retired item "rookie_belt"/,
    ],
    [
      'no denylisted term appears in a name',
      (c) => (find(c.items, 'plate_crab').name = 'Party Hat'),
      /"Party Hat" matches denylisted term "party hat"/,
    ],
    [
      'gear tiers match ITEM_TIERS',
      (c) => c.gearTiers.push('celestial'),
      /gear tiers \[.*celestial\] must match ITEM_TIERS/,
    ],
    [
      'gear tiers keep the ITEM_TIERS order',
      (c) => c.gearTiers.reverse(),
      /gear tiers \[ascendant, .*\] must match ITEM_TIERS/,
    ],
    ['gear slots match GEAR_SLOTS', (c) => c.gearSlots.pop(), /gear slots \[.*\] must match GEAR_SLOTS/],
    [
      'every gear slot skill exists in the catalog',
      (c) => (find(c.skills, 'core').key = 'midsection'),
      /gear slot "belt" boosts unknown skill "core"/,
    ],
    [
      'every skill is boosted by some gear slot',
      (c) => c.skills.push({ ...structuredClone(find(c.skills, 'core')), key: 'neck', name: 'Neck', sortOrder: 99 }),
      /skill "neck" is boosted by no gear slot/,
    ],
    [
      'a gear recipe consumes at most one gear item',
      (c) => find(c.recipes, 'grinder_belt').inputs.push({ item: 'rookie_gloves', quantity: 1 }),
      /recipe "grinder_belt" consumes 2 gear items, at most 1 allowed/,
    ],
    [
      'no denylisted term appears in a key',
      (c) => (find(c.items, 'plate_crab').key = 'rune_crab'),
      /"rune_crab" matches denylisted term "rune"/,
    ],
    [
      'no denylisted term appears in a description',
      (c) => (find(c.items, 'plate_crab').description = 'Found near Varrock.'),
      /matches denylisted term "varrock"/,
    ],
    [
      'shares never cross modality',
      (c) => (find(c.exercises, 'running').shares[0].skill = 'legs'),
      /exercise "running" shares skill "legs" of another modality/,
    ],
    [
      'mobility is never shared with another skill',
      (c) => {
        const shares = find(c.exercises, 'running').shares;
        shares[0].shareBp = 5000;
        shares.push({ skill: 'mobility', shareBp: 5000 });
      },
      /exercise "running" shares Mobility with another skill/,
    ],
    [
      'variation_of never crosses modality',
      (c) => (find(c.exercises, 'walking').variationOf = 'back_squat'),
      /exercise "walking" is a variation of "back_squat" of another modality/,
    ],
    [
      'a cardio exercise has no load_type',
      (c) => (find(c.exercises, 'running').loadType = 'external'),
      /cardio exercise "running" has a load_type/,
    ],
    [
      'a cardio exercise has a cardio block',
      (c) => (find(c.exercises, 'running').cardio = null),
      /cardio exercise "running" needs a cardio block/,
    ],
    [
      'a lift has a load_type',
      (c) => (find(c.exercises, 'deadlift').loadType = null),
      /lift exercise "deadlift" needs a load_type/,
    ],
    [
      'a lift has no cardio block',
      (c) => (find(c.exercises, 'deadlift').cardio = structuredClone(find(c.exercises, 'running').cardio)),
      /lift exercise "deadlift" has a cardio block/,
    ],
    [
      'programs use no hold exercise',
      (c) => (c.programs[0].days[0].exercises[0].exercise = 'farmers_carry'),
      /program day "ppl:push" uses hold exercise "farmers_carry"/,
    ],
    [
      'challenges use no hold exercise',
      (c) => (find(c.challenges, 'squat_century').volume!.exercise = 'dead_hang'),
      /challenge "squat_century" uses hold exercise "dead_hang"/,
    ],
    [
      'a measure is set only on lifts',
      (c) => (find(c.exercises, 'running').measure = 'time'),
      /cardio exercise "running" has a measure/,
    ],
    [
      'a variation keeps the measure of its base',
      (c) => (find(c.exercises, 'towel_hang').measure = 'distance'),
      /exercise "towel_hang" measures distance but its base "dead_hang" measures time/,
    ],
    [
      'programs use no cardio exercise',
      (c) => (c.programs[0].days[0].exercises[0].exercise = 'running'),
      /program day "ppl:push" uses cardio exercise "running"/,
    ],
    [
      'max_effort is a cardio effort level',
      (c) => (find(c.exercises, 'running').cardio!.maxEffort = 'extreme'),
      /cardio exercise "running" max_effort "extreme" must be one of easy, moderate, hard, max/,
    ],
    [
      'record_min_distance_m needs a reference pace',
      (c) => (find(c.exercises, 'running').cardio!.referencePaceSPerKm = null),
      /cardio exercise "running" has record_min_distance_m but no reference pace/,
    ],
    [
      'an activity without distance has no reference pace',
      (c) => (find(c.exercises, 'running').cardio!.tracksDistance = false),
      /cardio exercise "running" tracks no distance but has a reference pace/,
    ],
  ])('rejects a catalog when %s is broken', (_rule, mutate, expected) => {
    const problems = problemsAfter(mutate);
    expect(
      problems.some((problem) => expected.test(problem)),
      problems.join('\n'),
    ).toBe(true);
  });

  it.each<[string, (challenge: Record<string, unknown>) => void]>([
    ['an unknown kind', (challenge) => (challenge.kind = 'timed')],
    [
      'a pct below 1',
      (challenge) => ((challenge.supersets as { exercises: { pct?: number }[] }[])[0].exercises[0].pct = 0),
    ],
    [
      'a pct above 100',
      (challenge) => ((challenge.supersets as { exercises: { pct?: number }[] }[])[0].exercises[0].pct = 101),
    ],
    ['an unknown field', (challenge) => (challenge.timed = true)],
  ])('refuses to load a challenge with %s', (_case, mutate) => {
    const sources = readCatalogSources();
    const challenges = structuredClone(sources.challenges) as Record<string, unknown>[];
    mutate(challenges.find((challenge) => challenge.key === 'deadlift_and_pull_up')!);
    expect(() => expandCatalog({ ...sources, challenges })).toThrow();
  });

  it.each<[string, (catalog: CatalogData) => void, RegExp]>([
    [
      'quest keys match the key pattern',
      (c) => (find(c.quests, 'monkey_bar_madness').key = 'Hang-Tough'),
      /quest key "Hang-Tough" must match/,
    ],
    [
      'quest names are unique',
      (c) => (find(c.quests, 'yogic_ritual').name = 'monkey bar madness'),
      /quest name "monkey bar madness" is not unique/,
    ],
    [
      'a quest has a description',
      (c) => (find(c.quests, 'yogic_ritual').description = ''),
      /quest "yogic_ritual" description must be 1-280 characters/,
    ],
    [
      'a quest description is at most 280 characters',
      (c) => (find(c.quests, 'yogic_ritual').description = 'x'.repeat(281)),
      /quest "yogic_ritual" description must be 1-280 characters/,
    ],
    [
      'a quest is worth at least one quest point',
      (c) => (find(c.quests, 'yogic_ritual').questPoints = 0),
      /quest "yogic_ritual" quest_points must be an integer in 1-10/,
    ],
    [
      'a quest is worth at most ten quest points',
      (c) => (find(c.quests, 'yogic_ritual').questPoints = 11),
      /quest "yogic_ritual" quest_points must be an integer in 1-10/,
    ],
    [
      'a required level names a known skill',
      (c) => (find(c.quests, 'monkey_bar_madness').requiredLevels[0].skill = 'forearms'),
      /quest "monkey_bar_madness" requires unknown skill "forearms"/,
    ],
    [
      'a required level is at least 2',
      (c) => (find(c.quests, 'monkey_bar_madness').requiredLevels[0].level = 1),
      /quest "monkey_bar_madness" requires skill "grip" at level 1, which must be an integer in 2-99/,
    ],
    [
      'a required level is at most 99',
      (c) => (find(c.quests, 'monkey_bar_madness').requiredLevels[0].level = 100),
      /quest "monkey_bar_madness" requires skill "grip" at level 100, which must be an integer in 2-99/,
    ],
    [
      'a required quest exists',
      (c) => (find(c.quests, 'the_restless_squat').requiredQuests[0] = 'squat_rack'),
      /quest "the_restless_squat" requires unknown quest "squat_rack"/,
    ],
    [
      'a quest does not require itself',
      (c) => find(c.quests, 'yogic_ritual').requiredQuests.push('yogic_ritual'),
      /quest "yogic_ritual" requires itself/,
    ],
    [
      'quest requirements have no cycle',
      (c) => find(c.quests, 'x_marks_the_squat').requiredQuests.push('back_slayer'),
      /quest "x_marks_the_squat" is part of a requirement cycle/,
    ],
    [
      'a quest has a step',
      (c) => (find(c.quests, 'yogic_ritual').steps = []),
      /quest "yogic_ritual" needs 1-10 steps, has 0/,
    ],
    [
      'a quest has at most ten steps',
      (c) => {
        const quest = find(c.quests, 'yogic_ritual');
        quest.steps = Array.from({ length: 11 }, () => structuredClone(quest.steps[0]));
      },
      /quest "yogic_ritual" needs 1-10 steps, has 11/,
    ],
    [
      'a sessions target is at least 1',
      (c) => Object.assign(find(c.quests, 'yogic_ritual').steps[0], { target: 0 }),
      /quest "yogic_ritual" step 1 needs a sessions target that is an integer in 1-100/,
    ],
    [
      'a sessions target is at most 100',
      (c) => Object.assign(find(c.quests, 'yogic_ritual').steps[0], { target: 101 }),
      /quest "yogic_ritual" step 1 needs a sessions target that is an integer in 1-100/,
    ],
    [
      'a sessions target is whole',
      (c) => Object.assign(find(c.quests, 'yogic_ritual').steps[0], { target: 2.5 }),
      /quest "yogic_ritual" step 1 needs a sessions target that is an integer in 1-100/,
    ],
    [
      'a sessions step names a known exercise',
      (c) => Object.assign(find(c.quests, 'yogic_ritual').steps[0], { exercise: 'mobility_flo' }),
      /quest "yogic_ritual" step 1 uses unknown exercise "mobility_flo"/,
    ],
    [
      'a volume step has a target above 0',
      (c) => Object.assign(find(c.quests, 'x_marks_the_squat').steps[1], { target: 0 }),
      /quest "x_marks_the_squat" step 2 needs a volume target above 0/,
    ],
    [
      'a volume step counts a lift',
      (c) => Object.assign(find(c.quests, 'x_marks_the_squat').steps[1], { exercise: 'running' }),
      /quest "x_marks_the_squat" step 2 uses cardio exercise "running"/,
    ],
    [
      'a volume step counts reps, not a hold',
      (c) => Object.assign(find(c.quests, 'x_marks_the_squat').steps[1], { exercise: 'dead_hang' }),
      /quest "x_marks_the_squat" step 2 uses hold exercise "dead_hang"/,
    ],
    [
      'a record step names a known exercise',
      (c) => Object.assign(find(c.quests, 'bench_mysteries').steps[1], { exercise: 'bench' }),
      /quest "bench_mysteries" step 2 uses unknown exercise "bench"/,
    ],
    [
      'a workout superset has at least 2 exercises',
      (c) => {
        const step = find(c.quests, 'back_slayer').steps[1];
        if (step.kind === 'workout') step.challenge.supersets[0].exercises.pop();
      },
      /quest "back_slayer" step 2 superset needs at least 2 exercises/,
    ],
    [
      'a workout percentage needs an external load',
      (c) => {
        const step = find(c.quests, 'back_slayer').steps[1];
        if (step.kind === 'workout') step.challenge.supersets[0].exercises[1].exercise = 'pull_up';
      },
      /quest "back_slayer" step 2 sets a percentage on "pull_up", which has no external load/,
    ],
    [
      'a workout has supersets or a volume',
      (c) => {
        const step = find(c.quests, 'back_slayer').steps[1];
        if (step.kind === 'workout') step.challenge.supersets = [];
      },
      /quest "back_slayer" step 2 needs supersets or a volume, not both/,
    ],
    [
      'a workout has not both supersets and a volume',
      (c) => {
        const step = find(c.quests, 'back_slayer').steps[1];
        if (step.kind === 'workout')
          step.challenge.volume = { metric: 'reps', target: 10, exercise: null, minPct: null };
      },
      /quest "back_slayer" step 2 needs supersets or a volume, not both/,
    ],
    ['a quest rewards XP', (c) => (find(c.quests, 'yogic_ritual').rewardXp = []), /quest "yogic_ritual" rewards no XP/],
    [
      'a quest rewards a known skill',
      (c) => (find(c.quests, 'yogic_ritual').rewardXp[0].skill = 'flexibility'),
      /quest "yogic_ritual" rewards unknown skill "flexibility"/,
    ],
    [
      'a quest reward is at least 1 XP',
      (c) => (find(c.quests, 'yogic_ritual').rewardXp[0].xp = 0),
      /quest "yogic_ritual" rewards skill "mobility" 0 XP, which must be an integer in 1-5000/,
    ],
    [
      'a quest reward is at most 5000 XP',
      (c) => (find(c.quests, 'yogic_ritual').rewardXp[0].xp = 5001),
      /quest "yogic_ritual" rewards skill "mobility" 5001 XP, which must be an integer in 1-5000/,
    ],
    [
      'a quest reward is whole XP',
      (c) => (find(c.quests, 'yogic_ritual').rewardXp[0].xp = 1.5),
      /quest "yogic_ritual" rewards skill "mobility" 1.5 XP, which must be an integer in 1-5000/,
    ],
    [
      'no denylisted term appears in a quest name',
      (c) => (find(c.quests, 'yogic_ritual').name = 'Dragon Limbs'),
      /"Dragon Limbs" matches denylisted term "dragon"/,
    ],
    [
      'no denylisted term appears in a quest description',
      (c) => (find(c.quests, 'yogic_ritual').description = 'Stretch like a dragon.'),
      /"Stretch like a dragon." matches denylisted term "dragon"/,
    ],
  ])('rejects a catalog when the quest rule "%s" is broken', (_rule, mutate, expected) => {
    const problems = problemsAfter(mutate);
    expect(
      problems.some((problem) => expected.test(problem)),
      problems.join('\n'),
    ).toBe(true);
  });

  it.each<[string, (quest: Record<string, unknown>) => void]>([
    ['an unknown field', (quest) => (quest.hidden = true)],
    ['an unknown step kind', (quest) => ((quest.steps as Record<string, unknown>[])[0].kind = 'teleport')],
    ['a step field of another kind', (quest) => ((quest.steps as Record<string, unknown>[])[0].metric = 'reps')],
    ['an unknown requirement', (quest) => (quest.requires = { items: ['rookie_belt'] })],
    ['a reward that is not XP', (quest) => (quest.rewards = { items: { rookie_belt: 1 } })],
  ])('refuses to load a quest with %s', (_case, mutate) => {
    const sources = readCatalogSources();
    const quests = structuredClone(sources.quests) as Record<string, unknown>[];
    mutate(quests.find((quest) => quest.key === 'x_marks_the_squat')!);
    expect(() => expandCatalog({ ...sources, quests })).toThrow();
  });

  it('accepts a retired drop table without entries', () => {
    expect(
      problemsAfter((c) => c.dropTables.push({ key: 'old_table', name: 'Old table', retired: true, entries: [] })),
    ).toEqual([]);
  });

  it('matches denylisted terms as whole words only', () => {
    expect(problemsAfter((c) => (find(c.items, 'plate_crab').name = 'Prune Crab'))).toEqual([]);
    expect(problemsAfter((c) => (find(c.items, 'plate_crab').name = 'Dragonfly Crab'))).toEqual([]);
  });

  it('reports problems in a fixed order: names, exercises, program days, gear, items, challenges, loot, recipes, denylist', () => {
    expect(
      problemsAfter((c) => {
        find(c.items, 'plate_crab').name = 'Grand Exchange Crab';
        find(c.recipes, 'grinder_belt').inputs[1].quantity = 0;
        find(c.dropTables, 'rare').entries[0].weight = 0;
        find(c.items, 'plate_crab').grants = 'deadlift';
        find(c.items, 'plate_crab').icon = 'teapot';
        c.gearTiers.reverse();
        c.programs[0].days[0].exercises[0].exercise = 'moon_walk';
        find(c.exercises, 'deadlift').shares[0].shareBp += 1;
        c.skills[0].name = '';
      }),
    ).toEqual([
      'skill "chest" name must be 1-60 characters',
      'exercise "deadlift" shares sum to 10001, not 10000',
      'program day "ppl:push" uses unknown exercise "moon_walk"',
      'gear tiers [ascendant, mythic, titan, forged, tempered, grinder, rookie] must match ITEM_TIERS [rookie, grinder, tempered, forged, titan, mythic, ascendant] in order',
      'item "plate_crab" has unknown icon "teapot"',
      'item "plate_crab" grants a challenge but is no scroll',
      'drop table "rare" entry "scroll_pause_bench_press" weight must be an integer in 1-1000000',
      'recipe "grinder_belt" input "grinder_scraps" quantity must be 1-1000',
      '"Grand Exchange Crab" matches denylisted term "grand exchange"',
    ]);
  });
});
