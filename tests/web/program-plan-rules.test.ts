import { describe, expect, it } from 'vitest';
import {
  type Position,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramFact,
  programStateAt,
  type WeightUnit,
} from '@domain/index.ts';
import { type PlanDay, planStatusText, programPlan } from '../../web/src/lib/programs/program-plan-rules.ts';
import { factClock, jumpToFact, sessionFact, skipDayFact } from '../domain/program-fixtures/facts.ts';
import {
  cyclePosition,
  cycleSessions,
  FIVE_THREE_ONE,
  FIVE_THREE_ONE_LIFTS,
  fiveThreeOneEnrollment,
  mainSets531,
} from '../domain/program-fixtures/five_three_one.ts';
import { MADCOW_5X5, madcowDaySets, madcowEnrollment, weekDay } from '../domain/program-fixtures/madcow_5x5.ts';
import { STRONGLIFTS_5X5, strongLiftsEnrollment } from '../domain/program-fixtures/stronglifts_5x5.ts';

const EXERCISE_NAMES: ReadonlyMap<string, string> = new Map([
  ['squat', 'Back Squat'],
  ['bench', 'Barbell Bench Press'],
  ['row', 'Barbell Row'],
  ['press', 'Overhead Press'],
  ['ohp', 'Overhead Press'],
  ['deadlift', 'Deadlift'],
]);

const FIVE_THREE_ONE_DAY_NAMES = ['Day 1', 'Day 2', 'Day 3', 'Day 4'];

function planAfter(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  facts: ProgramFact[],
  unit: WeightUnit = enrollment.unit,
) {
  return programPlan({
    definition,
    enrollment,
    state: programStateAt(definition, enrollment, facts),
    unit,
    exerciseNames: EXERCISE_NAMES,
  });
}

function dayLabelled(days: readonly PlanDay[], label: string): PlanDay {
  const day = days.find((candidate) => candidate.label === label);
  if (!day) throw new Error(`no plan day labelled ${label}`);
  return day;
}

function linesOf(day: PlanDay, title: string): string[] {
  const card = day.cards.find((candidate) => candidate.title === title);
  if (!card || card.kind !== 'exercise') throw new Error(`no exercise card titled ${title} on ${day.label}`);
  return card.lines;
}

function statusesOf(days: readonly PlanDay[]): [string, string][] {
  return days.map((day) => [day.label, day.status]);
}

function mondayDone(): ProgramFact[] {
  return [sessionFact(factClock().next(), weekDay(1, 'mon'), madcowDaySets('mon'))];
}

describe('plan for a weekly program (Madcow)', () => {
  it('titles the plan after the current week: "Week 1"', () => {
    expect(planAfter(MADCOW_5X5, madcowEnrollment(), []).title).toBe('Week 1');
  });

  it('lists every day of the current week as upcoming at the start', () => {
    expect(statusesOf(planAfter(MADCOW_5X5, madcowEnrollment(), []).days)).toEqual([
      ['W1 Day 1', 'upcoming'],
      ['W1 Day 2', 'upcoming'],
      ['W1 Day 3', 'upcoming'],
    ]);
  });

  it('marks Day 1 completed once it is logged and keeps Day 2 and Day 3 upcoming', () => {
    expect(statusesOf(planAfter(MADCOW_5X5, madcowEnrollment(), mondayDone()).days)).toEqual([
      ['W1 Day 1', 'completed'],
      ['W1 Day 2', 'upcoming'],
      ['W1 Day 3', 'upcoming'],
    ]);
  });

  it('keeps an optional Day 2 upcoming while the week waits on a later required Day 3', () => {
    const [monday, wednesday] = MADCOW_5X5.schedule.days;
    const withOptionalTuesday: ProgramDefinition = {
      ...MADCOW_5X5,
      schedule: {
        kind: 'weekly',
        days: [monday, { ...wednesday, key: 'tue', name: 'Day 2', optional: true }, { ...wednesday, name: 'Day 3' }],
      },
    };
    expect(statusesOf(planAfter(withOptionalTuesday, madcowEnrollment(), mondayDone()).days)).toEqual([
      ['W1 Day 1', 'completed'],
      ['W1 Day 2', 'upcoming'],
      ['W1 Day 3', 'upcoming'],
    ]);
  });

  it('marks a skipped Day 1 skipped', () => {
    const facts = [skipDayFact(factClock().next(), weekDay(1, 'mon'))];
    expect(dayLabelled(planAfter(MADCOW_5X5, madcowEnrollment(), facts).days, 'W1 Day 1').status).toBe('skipped');
  });

  it('shows no prescribed rows on a completed day', () => {
    expect(dayLabelled(planAfter(MADCOW_5X5, madcowEnrollment(), mondayDone()).days, 'W1 Day 1').cards).toEqual([]);
  });

  it('shows the Day 1 squat ramp on the upcoming Day 1: 47.5, 57.5, 70, 80 and 92.5 kg', () => {
    const monday = dayLabelled(planAfter(MADCOW_5X5, madcowEnrollment(), []).days, 'W1 Day 1');
    expect(linesOf(monday, 'Back Squat')).toEqual([
      '47.5 kg × 5 · 50%',
      '57.5 kg × 5 · 62.5%',
      '70 kg × 5 · 75%',
      '80 kg × 5 · 87.5%',
      '92.5 kg × 5 · 100%',
    ]);
  });

  it('shows the light Day 2 squat on the upcoming Day 2: 47.5, 57.5, then 2 × 5 at 70 kg', () => {
    const wednesday = dayLabelled(planAfter(MADCOW_5X5, madcowEnrollment(), mondayDone()).days, 'W1 Day 2');
    expect(linesOf(wednesday, 'Back Squat')).toEqual([
      '47.5 kg × 5 · 50%',
      '57.5 kg × 5 · 62.5%',
      '2 × 5 @ 70 kg · 75%',
    ]);
  });

  it("shows the rows in the user's pounds: the 92.5 kg top set reads 203.9 lb", () => {
    const monday = dayLabelled(planAfter(MADCOW_5X5, madcowEnrollment(), [], 'lb').days, 'W1 Day 1');
    expect(linesOf(monday, 'Back Squat')[4]).toBe('203.9 lb × 5 · 100%');
  });
});

describe('plan for a cycle program (5/3/1)', () => {
  const enrollment = fiveThreeOneEnrollment({ tms: { squat: 90 } });

  it('titles the plan after the current cycle: "Cycle 1"', () => {
    expect(planAfter(FIVE_THREE_ONE, enrollment, []).title).toBe('Cycle 1');
  });

  it('lists all sixteen days of the cycle in schedule order, week by week', () => {
    const labels = planAfter(FIVE_THREE_ONE, enrollment, []).days.map((day) => day.label);
    expect(labels).toEqual(
      [1, 2, 3, 4].flatMap((week) => FIVE_THREE_ONE_DAY_NAMES.map((name) => `C1 W${week} ${name}`)),
    );
  });

  it('shows the week 1 squat at a 90 kg TM: 57.5, 67.5 and 77.5 kg for 5+', () => {
    const squat = dayLabelled(planAfter(FIVE_THREE_ONE, enrollment, []).days, 'C1 W1 Day 1');
    expect(linesOf(squat, 'Back Squat')).toEqual(['57.5 kg × 5 · 65%', '67.5 kg × 5 · 75%', '77.5 kg × 5+ · 85%']);
  });

  it('shows a later week of the cycle too: the week 3 squat single is 85 kg for 1+', () => {
    const squat = dayLabelled(planAfter(FIVE_THREE_ONE, enrollment, []).days, 'C1 W3 Day 1');
    expect(linesOf(squat, 'Back Squat')[2]).toBe('85 kg × 1+ · 95%');
  });

  it('keeps the finished week 1 in the plan as completed while week 2 is upcoming', () => {
    const facts = cycleSessions(factClock(), 1, { weeks: [1] });
    const days = planAfter(FIVE_THREE_ONE, enrollment, facts).days;
    expect(statusesOf(days.slice(0, 5))).toEqual([
      ['C1 W1 Day 1', 'completed'],
      ['C1 W1 Day 2', 'completed'],
      ['C1 W1 Day 3', 'completed'],
      ['C1 W1 Day 4', 'completed'],
      ['C1 W2 Day 1', 'upcoming'],
    ]);
  });

  it('moves to cycle 2 once cycle 1 is done, with every day upcoming', () => {
    const plan = planAfter(FIVE_THREE_ONE, enrollment, cycleSessions(factClock(), 1));
    expect(plan.title).toBe('Cycle 2');
    expect(plan.days).toHaveLength(4 * FIVE_THREE_ONE_LIFTS.length);
    expect(plan.days.every((day) => day.status === 'upcoming')).toBe(true);
    expect(plan.days[0].label).toBe('C2 W1 Day 1');
  });
});

describe('plan for a rotation program (StrongLifts)', () => {
  it('titles the plan "Next sessions"', () => {
    expect(planAfter(STRONGLIFTS_5X5, strongLiftsEnrollment(), []).title).toBe('Next sessions');
  });

  it('lists the next three sessions in rotation order, all upcoming', () => {
    expect(statusesOf(planAfter(STRONGLIFTS_5X5, strongLiftsEnrollment(), []).days)).toEqual([
      ['Session 1 Day 1', 'upcoming'],
      ['Session 2 Day 2', 'upcoming'],
      ['Session 3 Day 1', 'upcoming'],
    ]);
  });

  it('shows the next session at the working weight: squat 5 × 5 at 100 kg', () => {
    const next = planAfter(STRONGLIFTS_5X5, strongLiftsEnrollment(), []).days[0];
    expect(linesOf(next, 'Back Squat')).toEqual(['5 × 5 @ 100 kg']);
  });
});

describe('plan day status text', () => {
  it('reads a completed day as "Done"', () => {
    expect(planStatusText('completed')).toBe('Done');
  });

  it('reads a skipped day as "Skipped"', () => {
    expect(planStatusText('skipped')).toBe('Skipped');
  });

  it('has no status text for an upcoming day', () => {
    expect(planStatusText('upcoming')).toBeNull();
  });
});

describe('plan day status from the records the fold keeps', () => {
  const enrollment = fiveThreeOneEnrollment({ tms: { squat: 90 } });

  it('finds a completed day whose position came back from jsonb with its keys in another order', () => {
    const reordered = JSON.parse('{"day":"squat","week":1,"cycle":1}') as Position;
    const facts = [sessionFact(factClock().next(), reordered, mainSets531('squat', 1))];
    expect(dayLabelled(planAfter(FIVE_THREE_ONE, enrollment, facts).days, 'C1 W1 Day 1').status).toBe('completed');
  });

  it('reads the days a jump_to passed over, which have no record, as skipped', () => {
    const facts = [jumpToFact(factClock().next(), cyclePosition(1, 3, 'squat'))];
    const days = planAfter(FIVE_THREE_ONE, enrollment, facts).days;
    expect(days.slice(0, 8).every((day) => day.status === 'skipped')).toBe(true);
    expect(dayLabelled(days, 'C1 W3 Day 1').status).toBe('upcoming');
  });
});
