import { describe, expect, it } from 'vitest';
import {
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramFact,
  type ProgramState,
  programStateAt,
  type ReferenceChange,
} from '@domain/index.ts';
import { rolloverSummary } from '../../web/src/lib/program-summary-rules.ts';
import {
  factClock,
  sessionFact,
  setAsPrescribed,
  setReferenceFact,
  skipDayFact,
} from '../domain/program-fixtures/facts.ts';
import {
  cyclePosition,
  cycleSessions,
  FIVE_THREE_ONE,
  fiveThreeOneEnrollment,
  mainSets531,
} from '../domain/program-fixtures/five_three_one.ts';
import { MADCOW_5X5, madcowEnrollment, madcowWeek } from '../domain/program-fixtures/madcow_5x5.ts';
import { STRONGLIFTS_5X5, strongLiftsEnrollment } from '../domain/program-fixtures/stronglifts_5x5.ts';

const DEFAULT_CYCLE_LINES = [
  'Squat training max 140 → 145 kg',
  'Bench press training max 100 → 102.5 kg',
  'Deadlift training max 180 → 185 kg',
  'Overhead press training max 60 → 62.5 kg',
];

function summaryAfter(definition: ProgramDefinition, enrollment: ProgramEnrollment, facts: ProgramFact[]) {
  return rolloverSummary(definition, enrollment, programStateAt(definition, enrollment, facts));
}

function fiveThreeOneSummary(facts: ProgramFact[], enrollment = fiveThreeOneEnrollment()) {
  return summaryAfter(FIVE_THREE_ONE, enrollment, facts);
}

function cycleWithPressSkipped(): ProgramFact[] {
  const clock = factClock();
  return [1, 2, 3, 4].flatMap((week) => [
    ...(['squat', 'bench', 'deadlift'] as const).map((lift) =>
      sessionFact(clock.next(), cyclePosition(1, week, lift), mainSets531(lift, week)),
    ),
    skipDayFact(clock.next(), cyclePosition(1, week, 'press')),
  ]);
}

describe('rollover summary for a cycle program (5/3/1)', () => {
  it('has no summary before any rollover', () => {
    expect(fiveThreeOneSummary([])).toBeNull();
  });

  it('has no summary after week rollovers that changed no training max (weeks 1–3 done)', () => {
    expect(fiveThreeOneSummary(cycleSessions(factClock(), 1, { weeks: [1, 2, 3] }))).toBeNull();
  });

  it('titles the summary after the finished cycle: "Cycle 1 complete"', () => {
    expect(fiveThreeOneSummary(cycleSessions(factClock(), 1))?.title).toBe('Cycle 1 complete');
  });

  it('lists every training max the cycle raised: squat 140 → 145, bench 100 → 102.5, deadlift 180 → 185, press 60 → 62.5', () => {
    expect(fiveThreeOneSummary(cycleSessions(factClock(), 1))?.lines).toEqual(DEFAULT_CYCLE_LINES);
  });

  it('keys the summary by the enrollment and the finished week: "enrollment-531:C1 W4"', () => {
    expect(fiveThreeOneSummary(cycleSessions(factClock(), 1))?.key).toBe('enrollment-531:C1 W4');
  });

  it('lists only the lifts whose training max changed: the press, skipped all cycle, is left out', () => {
    expect(fiveThreeOneSummary(cycleWithPressSkipped())?.lines).toEqual([
      'Squat training max 140 → 145 kg',
      'Bench press training max 100 → 102.5 kg',
      'Deadlift training max 180 → 185 kg',
    ]);
  });

  it('shows a training max reset: a week 1 AMRAP of 4 resets squat 140 → 126 kg', () => {
    const facts = cycleSessions(factClock(), 1, { lastSetReps: { 'squat@1': 4 } });
    expect(fiveThreeOneSummary(facts)?.lines[0]).toBe('Squat training max 140 → 126 kg');
  });

  it('starts from a mid-cycle edit: squat set to 130 in week 2 reads 130 → 135 kg', () => {
    const clock = factClock();
    const facts = [
      ...cycleSessions(clock, 1, { weeks: [1, 2] }),
      setReferenceFact(clock.next(), 'squat', 'tm', 130),
      ...cycleSessions(clock, 1, { weeks: [3, 4] }),
    ];
    expect(fiveThreeOneSummary(facts)?.lines[0]).toBe('Squat training max 130 → 135 kg');
  });

  it('ignores an edit made after the rollover: squat set to 150 in cycle 2 still reads 140 → 145 kg', () => {
    const clock = factClock();
    const facts = [...cycleSessions(clock, 1), setReferenceFact(clock.next(), 'squat', 'tm', 150)];
    expect(fiveThreeOneSummary(facts)?.lines).toEqual(DEFAULT_CYCLE_LINES);
  });

  it('keeps the same summary after the first session of the new cycle', () => {
    const clock = factClock();
    const facts = [
      ...cycleSessions(clock, 1),
      sessionFact(clock.next(), cyclePosition(2, 1, 'squat'), mainSets531('squat', 1)),
    ];
    expect(fiveThreeOneSummary(facts)).toEqual({
      key: 'enrollment-531:C1 W4',
      title: 'Cycle 1 complete',
      lines: DEFAULT_CYCLE_LINES,
    });
  });

  it('has no summary once a later rollover changed nothing (cycle 2 week 1 done)', () => {
    const clock = factClock();
    const facts = [...cycleSessions(clock, 1), ...cycleSessions(clock, 2, { weeks: [1] })];
    expect(fiveThreeOneSummary(facts)).toBeNull();
  });

  it('disappears when a deleted session undoes the rollover (the last week 4 session is gone)', () => {
    expect(fiveThreeOneSummary(cycleSessions(factClock(), 1).slice(0, -1))).toBeNull();
  });

  it('shows a pound enrollment in pounds: squat 300 → 310 lb', () => {
    const enrollment = fiveThreeOneEnrollment({ unit: 'lb', tms: { squat: 300 } });
    expect(fiveThreeOneSummary(cycleSessions(factClock(), 1), enrollment)?.lines[0]).toBe(
      'Squat training max 300 → 310 lb',
    );
  });
});

describe('rollover summary for a weekly program (Madcow)', () => {
  const enrollment = madcowEnrollment();
  const afterWeek1 = () => summaryAfter(MADCOW_5X5, enrollment, madcowWeek(factClock(), 1));

  it('titles the summary after the finished week: "Week 1 complete"', () => {
    expect(afterWeek1()?.title).toBe('Week 1 complete');
  });

  it('keys the summary by the enrollment and the week: "enrollment-madcow:W1"', () => {
    expect(afterWeek1()?.key).toBe('enrollment-madcow:W1');
  });

  it('lists each top set raised by the week, to two decimals (100 × 0.975³ = 92.69 → 100 × 0.975² = 95.06)', () => {
    expect(afterWeek1()?.lines).toEqual([
      'Squat top set 92.69 → 95.06 kg',
      'Bench press top set 74.15 → 76.05 kg',
      'Barbell row top set 64.88 → 66.54 kg',
      'Incline or military press top set 46.34 → 47.53 kg',
      'Deadlift top set 129.76 → 133.09 kg',
    ]);
  });

  it('has no summary in the middle of week 1', () => {
    expect(summaryAfter(MADCOW_5X5, enrollment, madcowWeek(factClock(), 1, { omit: ['fri'] }))).toBeNull();
  });
});

describe('rollover summary for a rotation program (StrongLifts)', () => {
  it('has no summary, since a rotation has no week or cycle rollover', () => {
    const squatSets = [0, 1, 2, 3, 4].map((index) =>
      setAsPrescribed('squat', `a-squat:${index}`, { weightKg: 100, reps: 5 }),
    );
    const facts = [sessionFact(factClock().next(), { index: 0 }, squatSets)];
    expect(summaryAfter(STRONGLIFTS_5X5, strongLiftsEnrollment(), facts)).toBeNull();
  });
});

describe('rollover summary nets the changes of one reference in one rollover', () => {
  const enrollment = fiveThreeOneEnrollment();
  const finishedWeek = cyclePosition(1, 4, 'press');

  function withRolloverHistory(changes: ReferenceChange[]): ProgramState {
    const state = programStateAt(FIVE_THREE_ONE, enrollment, cycleSessions(factClock(), 1));
    return { ...state, history: [...changes, ...state.history.filter((change) => change.lift !== 'squat')] };
  }

  function squatChange(from: number, to: number, reason: ReferenceChange['reason']): ReferenceChange {
    return { lift: 'squat', var: 'tm', from, to, reason, position: finishedWeek };
  }

  it('reads an increment then a reset as first from → last to: squat 140 → 130.5 kg', () => {
    const state = withRolloverHistory([squatChange(140, 145, 'increment'), squatChange(145, 130.5, 'tmReset')]);
    expect(rolloverSummary(FIVE_THREE_ONE, enrollment, state)?.lines).toEqual([
      'Squat training max 140 → 130.5 kg',
      ...DEFAULT_CYCLE_LINES.slice(1),
    ]);
  });

  it('leaves out a reference whose changes cancel out: squat 140 → 145 → 140', () => {
    const state = withRolloverHistory([squatChange(140, 145, 'increment'), squatChange(145, 140, 'adjustment')]);
    expect(rolloverSummary(FIVE_THREE_ONE, enrollment, state)?.lines).toEqual(DEFAULT_CYCLE_LINES.slice(1));
  });
});
