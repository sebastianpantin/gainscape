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
  dayStartFrom,
  hasProgramDayToStart,
  offlineRefreshState,
  pickedDay,
  programLoadStatus,
  programStatusText,
  secondDayChoices,
  positionLabel,
  type PrescriptionCard,
  prescriptionCards,
  skipDayEvent,
  skipDialogTitle,
  skipLabel,
  startLabel,
} from '../../web/src/lib/programs/program-today-rules.ts';
import { factClock, sessionFact, skipDayFact, snapshot } from '../domain/program-fixtures/facts.ts';
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

describe('secondDayChoices', () => {
  const enrollment = madcowEnrollment();
  const program = {
    kind: 'ready' as const,
    name: 'Madcow 5x5',
    templateKey: 'madcow_5x5',
    definition: MADCOW_5X5,
    enrollment,
    state: programStateAt(MADCOW_5X5, enrollment, []),
  };

  it('offers the other open Days of the Draft Enrollment, the first one suggested', () => {
    const choices = secondDayChoices(program, { enrollmentId: enrollment.id, position: weekDay(1, 'mon') });
    expect(choices.map((choice) => [choice.position, choice.suggested])).toEqual([
      [weekDay(1, 'wed'), true],
      [weekDay(1, 'fri'), false],
    ]);
  });

  it('offers nothing for another Enrollment, a Draft without a Day or no program', () => {
    expect(secondDayChoices(program, { enrollmentId: 'other', position: weekDay(1, 'mon') })).toEqual([]);
    expect(secondDayChoices(program, null)).toEqual([]);
    expect(secondDayChoices({ kind: 'none' }, { enrollmentId: enrollment.id, position: weekDay(1, 'mon') })).toEqual(
      [],
    );
  });
});

describe('dayStartFrom', () => {
  it('builds the start of a Day with its prescribed exercises', () => {
    const enrollment = madcowEnrollment();
    const program = {
      kind: 'ready' as const,
      name: 'Madcow 5x5',
      templateKey: 'madcow_5x5',
      definition: MADCOW_5X5,
      enrollment,
      state: programStateAt(MADCOW_5X5, enrollment, []),
    };
    const start = dayStartFrom(program, weekDay(1, 'wed'), {});
    expect(start).toMatchObject({
      enrollmentId: enrollment.id,
      templateKey: 'madcow_5x5',
      programName: 'Madcow 5x5',
      dayName: positionLabel(MADCOW_5X5, weekDay(1, 'wed')),
      position: weekDay(1, 'wed'),
    });
    expect(start.exercises.length).toBeGreaterThan(0);
    expect(start.exercises.every((slot) => slot.kind === 'exercise')).toBe(true);
  });
});

describe('hasProgramDayToStart', () => {
  it('is true for a followed program with a day to start, so its start button is the main action', () => {
    const enrollment = madcowEnrollment();
    const state = programStateAt(MADCOW_5X5, enrollment, []);
    expect(
      hasProgramDayToStart({
        kind: 'ready',
        name: 'Madcow 5x5',
        templateKey: 'madcow_5x5',
        definition: MADCOW_5X5,
        enrollment,
        state,
      }),
    ).toBe(true);
  });

  it('is false without a startable program day, so freestyle is the main action', () => {
    expect(hasProgramDayToStart({ kind: 'none' })).toBe(false);
    expect(hasProgramDayToStart({ kind: 'needs_update', name: 'Old', message: 'Update the app.' })).toBe(false);
  });
});

function choiceLabelsAfter(facts: ProgramFact[]) {
  return dayChoices(MADCOW_5X5, programStateAt(MADCOW_5X5, madcowEnrollment(), facts)).map((choice) => [
    choice.label,
    choice.suggested,
  ]);
}

function skippedAs(stamp: { id: string; at: string }, position: Position): ProgramFact {
  return skipDayFact(stamp, skipDayEvent(position).position);
}

describe('skip day labels', () => {
  it('names the action after the picked day: "Skip W1 Day 1"', () => {
    expect(skipLabel(MADCOW_5X5, weekDay(1, 'mon'))).toBe('Skip W1 Day 1');
  });

  it('names a 5/3/1 day with its cycle: "Skip C1 W2 Day 3"', () => {
    expect(skipLabel(FIVE_THREE_ONE, cyclePosition(1, 2, 'deadlift'))).toBe('Skip C1 W2 Day 3');
  });

  it('asks in the confirm dialog title: "Skip W1 Day 2?"', () => {
    expect(skipDialogTitle(MADCOW_5X5, weekDay(1, 'wed'))).toBe('Skip W1 Day 2?');
  });
});

describe('skip day event', () => {
  it('sends adjust_enrollment a skip_day for the picked position', () => {
    expect(skipDayEvent(weekDay(1, 'mon'))).toEqual({ kind: 'skip_day', position: { week: 1, day: 'mon' } });
  });

  it('sends a cycle position whole: cycle, week and day', () => {
    expect(skipDayEvent(cyclePosition(2, 3, 'press'))).toEqual({
      kind: 'skip_day',
      position: { cycle: 2, week: 3, day: 'press' },
    });
  });

  it('takes the skipped Day 1 out of the day picker and suggests Day 2 next', () => {
    expect(choiceLabelsAfter([skippedAs(factClock().next(), weekDay(1, 'mon'))])).toEqual([
      ['W1 Day 2', true],
      ['W1 Day 3', false],
    ]);
  });

  it('skipping the last open day of the week moves the picker to week 2 Day 1', () => {
    const clock = factClock();
    const facts = [
      sessionFact(clock.next(), weekDay(1, 'mon'), madcowDaySets('mon')),
      sessionFact(clock.next(), weekDay(1, 'wed'), madcowDaySets('wed')),
      skippedAs(clock.next(), weekDay(1, 'fri')),
    ];
    expect(choiceLabelsAfter(facts)[0]).toEqual(['W2 Day 1', true]);
  });
});

describe('program load status', () => {
  it('shows the cache while a refresh runs when an enrollment is cached', () => {
    expect(programLoadStatus({ hasCachedEnrollment: true, refresh: 'pending' })).toBe('cached');
  });

  it('is refreshing while a refresh runs with nothing cached', () => {
    expect(programLoadStatus({ hasCachedEnrollment: false, refresh: 'pending' })).toBe('refreshing');
  });

  it('is cached after a refresh that found an enrollment', () => {
    expect(programLoadStatus({ hasCachedEnrollment: true, refresh: 'done' })).toBe('cached');
  });

  it('is none after a refresh that found no enrollment', () => {
    expect(programLoadStatus({ hasCachedEnrollment: false, refresh: 'done' })).toBe('none');
  });

  it('keeps showing the cache when a refresh fails with an enrollment cached', () => {
    expect(programLoadStatus({ hasCachedEnrollment: true, refresh: 'failed' })).toBe('cached');
  });

  it('is failed when a refresh fails with nothing cached', () => {
    expect(programLoadStatus({ hasCachedEnrollment: false, refresh: 'failed' })).toBe('failed');
  });
});

describe('program status text', () => {
  it('reads "Loading program…" while refreshing', () => {
    expect(programStatusText('refreshing')).toBe('Loading program…');
  });

  it('reads "You\'re not following a program." when there is none', () => {
    expect(programStatusText('none')).toBe("You're not following a program.");
  });

  it('asks to reconnect when loading failed', () => {
    expect(programStatusText('failed')).toBe("Couldn't load your program. Check your connection.");
  });

  it('shows no status text for a cached program', () => {
    expect(programStatusText('cached')).toBeNull();
  });
});

describe('program refresh state while offline', () => {
  it('trusts the saved cache as done when it was refreshed online before', () => {
    expect(offlineRefreshState({ refreshed: true })).toBe('done');
  });

  it('is failed when the saved cache was never refreshed online', () => {
    expect(offlineRefreshState({ refreshed: false })).toBe('failed');
  });
});
