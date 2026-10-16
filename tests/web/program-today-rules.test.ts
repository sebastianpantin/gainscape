import { describe, expect, it } from 'vitest';
import {
  type Position,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramFact,
  programStateAt,
  resolvePrescription,
  type WeightUnit,
} from '@domain/index.ts';
import {
  amrapBadgeOf,
  dayChoices,
  pickedDay,
  positionLabel,
  type PrescriptionCard,
  prescriptionCards,
  startLabel,
} from '../../web/src/lib/programs/program-today-rules.ts';
import { factClock, sessionFact, snapshot } from '../domain/program-fixtures/facts.ts';
import {
  cyclePosition,
  FIVE_THREE_ONE,
  fiveThreeOneEnrollment,
  mainSets531,
} from '../domain/program-fixtures/five_three_one.ts';
import { GZCLP, gzclpEnrollment } from '../domain/program-fixtures/gzclp.ts';
import {
  MADCOW_5X5,
  madcowDaySets,
  madcowEnrollment,
  madcowWeek,
  weekDay,
} from '../domain/program-fixtures/madcow_5x5.ts';

const EXERCISE_NAMES: ReadonlyMap<string, string> = new Map([
  ['squat', 'Back Squat'],
  ['bench', 'Barbell Bench Press'],
  ['row', 'Barbell Row'],
  ['ohp', 'Overhead Press'],
  ['deadlift', 'Deadlift'],
  ['weighted-hyper', 'Weighted Hyperextension'],
  ['weighted-situp', 'Weighted Sit-up'],
  ['weighted-dip', 'Weighted Dip'],
  ['curl', 'Barbell Curl'],
  ['triceps-extension', 'Skull Crusher'],
]);

function choicesAfter(definition: ProgramDefinition, enrollment: ProgramEnrollment, facts: ProgramFact[]) {
  return dayChoices(definition, programStateAt(definition, enrollment, facts));
}

function cardsFor(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  position: Position,
  unit: WeightUnit = enrollment.unit,
  lastLogged: Record<string, number> = {},
): PrescriptionCard[] {
  const state = programStateAt(definition, enrollment, []);
  return prescriptionCards(
    definition,
    resolvePrescription(definition, enrollment, state, position, lastLogged),
    unit,
    EXERCISE_NAMES,
  );
}

function linesOf(cards: PrescriptionCard[], title: string): string[] {
  const card = cards.find((candidate) => candidate.title === title);
  if (!card || card.kind !== 'exercise') throw new Error(`no exercise card titled ${title}`);
  return card.lines;
}

describe('position labels', () => {
  it('labels a weekly position by week and day name: W1 Day 1', () => {
    expect(positionLabel(MADCOW_5X5, weekDay(1, 'mon'))).toBe('W1 Day 1');
  });

  it('labels a cycle position by cycle, week and day name: C2 W3 Day 3', () => {
    expect(positionLabel(FIVE_THREE_ONE, cyclePosition(2, 3, 'deadlift'))).toBe('C2 W3 Day 3');
  });

  it('labels the start button with the program name and the position: Start: Madcow 5x5 — W1 Day 1', () => {
    expect(startLabel('Madcow 5x5', MADCOW_5X5, weekDay(1, 'mon'))).toBe('Start: Madcow 5x5 — W1 Day 1');
  });

  it('labels the 5/3/1 start button: Start: 5/3/1 — C1 W1 Day 2', () => {
    expect(startLabel('5/3/1', FIVE_THREE_ONE, cyclePosition(1, 1, 'bench'))).toBe('Start: 5/3/1 — C1 W1 Day 2');
  });
});

describe('today: the day picker', () => {
  it('offers every Madcow day of week 1 at the start and suggests Day 1', () => {
    expect(choicesAfter(MADCOW_5X5, madcowEnrollment(), [])).toEqual([
      { position: weekDay(1, 'mon'), label: 'W1 Day 1', suggested: true },
      { position: weekDay(1, 'wed'), label: 'W1 Day 2', suggested: false },
      { position: weekDay(1, 'fri'), label: 'W1 Day 3', suggested: false },
    ]);
  });

  it('suggests Day 2 next after Day 1 is done and still offers Day 3', () => {
    const clock = factClock();
    const facts = [sessionFact(clock.next(), weekDay(1, 'mon'), madcowDaySets('mon'))];
    expect(choicesAfter(MADCOW_5X5, madcowEnrollment(), facts)).toEqual([
      { position: weekDay(1, 'wed'), label: 'W1 Day 2', suggested: true },
      { position: weekDay(1, 'fri'), label: 'W1 Day 3', suggested: false },
    ]);
  });

  it('suggests Day 1 in schedule order when Day 2 was done first, and offers Day 3 too', () => {
    const clock = factClock();
    const facts = [sessionFact(clock.next(), weekDay(1, 'wed'), madcowDaySets('wed'))];
    expect(choicesAfter(MADCOW_5X5, madcowEnrollment(), facts)).toEqual([
      { position: weekDay(1, 'mon'), label: 'W1 Day 1', suggested: true },
      { position: weekDay(1, 'fri'), label: 'W1 Day 3', suggested: false },
    ]);
  });

  it('moves to week 2 Day 1 once every day of week 1 is done', () => {
    const facts = madcowWeek(factClock(), 1);
    expect(
      choicesAfter(MADCOW_5X5, madcowEnrollment(), facts).map((choice) => [choice.label, choice.suggested]),
    ).toEqual([
      ['W2 Day 1', true],
      ['W2 Day 2', false],
      ['W2 Day 3', false],
    ]);
  });

  it('offers the four 5/3/1 days of cycle 1 week 1 and suggests squat first', () => {
    expect(
      choicesAfter(FIVE_THREE_ONE, fiveThreeOneEnrollment(), []).map((choice) => [choice.label, choice.suggested]),
    ).toEqual([
      ['C1 W1 Day 1', true],
      ['C1 W1 Day 2', false],
      ['C1 W1 Day 3', false],
      ['C1 W1 Day 4', false],
    ]);
  });

  it('suggests the 5/3/1 bench day after the squat day is done', () => {
    const facts = [sessionFact(factClock().next(), cyclePosition(1, 1, 'squat'), mainSets531('squat', 1))];
    expect(choicesAfter(FIVE_THREE_ONE, fiveThreeOneEnrollment(), facts).map((choice) => choice.label)).toEqual([
      'C1 W1 Day 2',
      'C1 W1 Day 3',
      'C1 W1 Day 4',
    ]);
    expect(choicesAfter(FIVE_THREE_ONE, fiveThreeOneEnrollment(), facts)[0].suggested).toBe(true);
  });
});

function choicesAfterMonday() {
  return choicesAfter(MADCOW_5X5, madcowEnrollment(), [
    sessionFact(factClock().next(), weekDay(1, 'mon'), madcowDaySets('mon')),
  ]);
}

describe('today: the picked day', () => {
  it('uses the suggested day when nothing is picked', () => {
    expect(pickedDay(choicesAfterMonday(), null)).toEqual(weekDay(1, 'wed'));
  });

  it('uses another uncompleted day of the week when the user picks it', () => {
    expect(pickedDay(choicesAfterMonday(), weekDay(1, 'fri'))).toEqual(weekDay(1, 'fri'));
  });

  it('matches a picked day whose keys come back from jsonb in another order', () => {
    const reordered: Position = JSON.parse('{"day":"fri","week":1}');
    expect(pickedDay(choicesAfterMonday(), reordered)).toEqual(weekDay(1, 'fri'));
  });

  it('falls back to the suggested day when the picked day was completed meanwhile', () => {
    expect(pickedDay(choicesAfterMonday(), weekDay(1, 'mon'))).toEqual(weekDay(1, 'wed'));
  });
});

describe('today: prescription lines', () => {
  it('shapes Madcow week 1 Day 1 squat for a 100 kg 5RM into the ramp rows (top 100 × 0.975^3 = 92.69 → 92.5; × .5/.625/.75/.875 = 46.25/57.81/69.38/80.94 → 47.5/57.5/70/80)', () => {
    expect(linesOf(cardsFor(MADCOW_5X5, madcowEnrollment(), weekDay(1, 'mon')), 'Back Squat')).toEqual([
      '47.5 kg × 5 · 50%',
      '57.5 kg × 5 · 62.5%',
      '70 kg × 5 · 75%',
      '80 kg × 5 · 87.5%',
      '92.5 kg × 5 · 100%',
    ]);
  });

  it('titles the Madcow Day 1 cards by exercise, with assistance marked', () => {
    expect(cardsFor(MADCOW_5X5, madcowEnrollment(), weekDay(1, 'mon')).map((card) => card.title)).toEqual([
      'Back Squat',
      'Barbell Bench Press',
      'Barbell Row',
      'Weighted Hyperextension — assistance',
      'Weighted Sit-up — assistance',
    ]);
  });

  it('collapses optional assistance sets and leaves weight and reps open when nothing was logged before: 2 × any reps @ any weight · optional', () => {
    const cards = cardsFor(MADCOW_5X5, madcowEnrollment(), weekDay(1, 'mon'));
    expect(linesOf(cards, 'Weighted Hyperextension — assistance')).toEqual(['2 × any reps @ any weight · optional']);
  });

  it('shows a rep range and the last logged weight for the Day 3 dips: 3 × 5–8 @ 10 kg', () => {
    const cards = cardsFor(MADCOW_5X5, madcowEnrollment(), weekDay(1, 'fri'), 'kg', { 'weighted-dip': 10 });
    expect(linesOf(cards, 'Weighted Dip — assistance')).toEqual(['3 × 5–8 @ 10 kg · optional']);
  });

  it('keeps 5/3/1 week 1 at a 90 kg TM one line per set with "5+" on the last (58.5/67.5/76.5 → 57.5/67.5/77.5)', () => {
    const cards = cardsFor(
      FIVE_THREE_ONE,
      fiveThreeOneEnrollment({ tms: { squat: 90 } }),
      cyclePosition(1, 1, 'squat'),
    );
    expect(linesOf(cards, 'Back Squat')).toEqual(['57.5 kg × 5 · 65%', '67.5 kg × 5 · 75%', '77.5 kg × 5+ · 85%']);
  });

  it('collapses the BBB supplemental into 5 × 10 at 50% of a 90 kg TM: 5 × 10 @ 45 kg', () => {
    const cards = cardsFor(
      FIVE_THREE_ONE,
      fiveThreeOneEnrollment({ tms: { squat: 90 } }),
      cyclePosition(1, 1, 'squat'),
    );
    expect(linesOf(cards, 'Back Squat — supplemental')).toEqual(['5 × 10 @ 45 kg · 50%']);
  });

  it('marks the week 3 single "1+" (90 kg TM × 0.95 = 85.5 → 85)', () => {
    const cards = cardsFor(
      FIVE_THREE_ONE,
      fiveThreeOneEnrollment({ tms: { squat: 90 } }),
      cyclePosition(1, 3, 'squat'),
    );
    expect(linesOf(cards, 'Back Squat')[2]).toBe('85 kg × 1+ · 95%');
  });

  it('shows a pound enrollment in pounds: TM 283.5 lb gives 185/215/240 lb (184.28/212.63/240.98 at 5 lb)', () => {
    const enrollment = fiveThreeOneEnrollment({ unit: 'lb', tms: { squat: 283.5 } });
    expect(linesOf(cardsFor(FIVE_THREE_ONE, enrollment, cyclePosition(1, 1, 'squat')), 'Back Squat')).toEqual([
      '185 lb × 5 · 65%',
      '215 lb × 5 · 75%',
      '240 lb × 5+ · 85%',
    ]);
  });

  it("shows a kilogram enrollment in the user's pounds: the 92.5 kg top set reads 203.9 lb", () => {
    const cards = cardsFor(MADCOW_5X5, madcowEnrollment(), weekDay(1, 'mon'), 'lb');
    expect(linesOf(cards, 'Back Squat')[4]).toBe('203.9 lb × 5 · 100%');
  });

  it('notes an exercise the catalog no longer has as unavailable', () => {
    const state = programStateAt(MADCOW_5X5, madcowEnrollment(), []);
    const resolved = resolvePrescription(MADCOW_5X5, madcowEnrollment(), state, weekDay(1, 'mon'), {});
    const names = new Map([...EXERCISE_NAMES].filter(([id]) => id !== 'row'));
    const titles = prescriptionCards(MADCOW_5X5, resolved, 'kg', names).map((card) => card.title);
    expect(titles).toContain('Barbell row (exercise unavailable)');
  });

  it('shows a pending GZCLP T1 retest as one 5RM test row: any weight × 5 · 5RM test, the T2 and T3 unchanged', () => {
    const enrollment = gzclpEnrollment();
    const state = {
      ...programStateAt(GZCLP, enrollment, []),
      stages: { 'squat-t1': 2 },
      pendingRetests: { 'squat-t1': 'fiveRm' as const },
    };
    const cards = prescriptionCards(
      GZCLP,
      resolvePrescription(GZCLP, enrollment, state, { index: 0 }, {}),
      'kg',
      EXERCISE_NAMES,
    );
    expect(linesOf(cards, 'Back Squat')).toEqual(['any weight × 5 · 5RM test']);
    expect(linesOf(cards, 'Barbell Bench Press — supplemental')).toEqual(['3 × 10 @ 50 kg']);
  });

  it('shows a slot this app cannot resolve as "Update the app to use this program"', () => {
    const cards = prescriptionCards(
      MADCOW_5X5,
      [{ kind: 'unsupported', slotId: 'mon-squat', lift: 'squat', primitive: 'warpSpeed' }],
      'kg',
      EXERCISE_NAMES,
    );
    expect(cards).toEqual([
      { kind: 'unsupported', slotId: 'mon-squat', title: 'Squat', message: 'Update the app to use this program' },
    ]);
  });
});

describe('today: grouped prescription lines', () => {
  it('collapses identical sets at 100% into one line with no bare percentage: the GZCLP T2 bench reads 3 × 10 @ 50 kg', () => {
    const cards = cardsFor(GZCLP, gzclpEnrollment(), { index: 0 });
    expect(linesOf(cards, 'Barbell Bench Press — supplemental')).toEqual(['3 × 10 @ 50 kg']);
  });

  it('keeps the AMRAP last set apart and marked "+": GZCLP T1 reads 4 × 3 then one 3+ set', () => {
    const cards = cardsFor(GZCLP, gzclpEnrollment(), { index: 0 });
    expect(linesOf(cards, 'Back Squat')).toEqual(['4 × 3 @ 100 kg', '100 kg × 3+']);
  });
});

describe('AMRAP badge on a logged set', () => {
  it('reads "5+" for an AMRAP snapshot with a minimum of 5', () => {
    expect(amrapBadgeOf(snapshot('squat-main:2', { weightKg: 77.5, reps: 5, amrap: true, minReps: 5 }))).toBe('5+');
  });

  it('falls back to the prescribed reps when the snapshot has no minimum: "3+"', () => {
    expect(amrapBadgeOf(snapshot('squat-main:2', { weightKg: 80, reps: 3, amrap: true }))).toBe('3+');
  });

  it('has no badge for a fixed-rep set or a set with no prescription', () => {
    expect(amrapBadgeOf(snapshot('mon-squat:4', { weightKg: 92.5, reps: 5 }))).toBeNull();
    expect(amrapBadgeOf(null)).toBeNull();
    expect(amrapBadgeOf(undefined)).toBeNull();
  });
});
