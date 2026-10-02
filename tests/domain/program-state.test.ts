import { describe, expect, it } from 'vitest';
import {
  advanceProgram,
  DEFAULT_ROUNDING,
  type FactSet,
  initialProgramState,
  isSetMet,
  liftOutcomes,
  orderFacts,
  type Position,
  type ProgramFact,
  type ProgramState,
  programStateAt,
} from '@domain/index.ts';
import {
  factClock,
  jumpToFact,
  loggedSet,
  sessionFact,
  setAsPrescribed,
  setReferenceFact,
  skipDayFact,
  snapshot,
  unprescribedSet,
} from './program-fixtures/facts.ts';
import {
  cyclePosition,
  cycleSessions,
  FIVE_THREE_ONE,
  fiveThreeOneEnrollment,
  mainSets531,
} from './program-fixtures/five_three_one.ts';
import {
  LINEAR_AFTER_SESSION,
  linearDay,
  linearEnrollment,
  linearSquatSets,
} from './program-fixtures/linear_after_session.ts';
import {
  MADCOW_5X5,
  madcowDaySets,
  madcowEnrollment,
  madcowWeek,
  metMadcowWeeks,
  rampSets,
  weekDay,
} from './program-fixtures/madcow_5x5.ts';
import { missesOf, refOf } from './program-fixtures/prescription-helpers.ts';

const madcow = madcowEnrollment();
const linear = linearEnrollment(100);

function positionKey(position: Position): string {
  return JSON.stringify(Object.entries(position).sort(([a], [b]) => a.localeCompare(b)));
}

function dayRecordsAt(state: ProgramState, position: Position) {
  return state.days.filter((record) => positionKey(record.position) === positionKey(position));
}

describe('isSetMet (assumption 7: weight ≥ snapshot − half increment, reps ≥ prescribed, or ≥ minReps for AMRAP)', () => {
  const kg = DEFAULT_ROUNDING.kg;
  const fiveByHundred = snapshot('mon-squat:4', { weightKg: 100, reps: 5 });

  it('meets a set logged exactly as prescribed: 100 × 5', () => {
    expect(isSetMet({ weightKg: 100, reps: 5 }, fiveByHundred, kg, 'kg')).toBe(true);
  });

  it('meets a set half an increment light: 98.75 × 5 (100 − 1.25)', () => {
    expect(isSetMet({ weightKg: 98.75, reps: 5 }, fiveByHundred, kg, 'kg')).toBe(true);
  });

  it('misses a set more than half an increment light: 98.7 × 5', () => {
    expect(isSetMet({ weightKg: 98.7, reps: 5 }, fiveByHundred, kg, 'kg')).toBe(false);
  });

  it('misses a set one rep short: 100 × 4', () => {
    expect(isSetMet({ weightKg: 100, reps: 4 }, fiveByHundred, kg, 'kg')).toBe(false);
  });

  it('meets a heavier set with more reps: 102.5 × 6', () => {
    expect(isSetMet({ weightKg: 102.5, reps: 6 }, fiveByHundred, kg, 'kg')).toBe(true);
  });

  it('uses the enrollment increment: 1.25 kg allows 99.4 (≥ 100 − 0.625) but not 99.3', () => {
    const fine = { ...kg, increment: 1.25 };
    expect(isSetMet({ weightKg: 99.4, reps: 5 }, fiveByHundred, fine, 'kg')).toBe(true);
    expect(isSetMet({ weightKg: 99.3, reps: 5 }, fiveByHundred, fine, 'kg')).toBe(false);
  });

  it('judges an AMRAP set by minReps: 5+ with min 5 misses at 4 reps', () => {
    const amrap = snapshot('squat-main:2', { weightKg: 120, reps: 5, amrap: true, minReps: 5 });
    expect(isSetMet({ weightKg: 120, reps: 4 }, amrap, kg, 'kg')).toBe(false);
    expect(isSetMet({ weightKg: 120, reps: 5 }, amrap, kg, 'kg')).toBe(true);
    expect(isSetMet({ weightKg: 120, reps: 12 }, amrap, kg, 'kg')).toBe(true);
  });

  it('judges an AMRAP set by minReps when it is below the prescribed reps: 5+ with min 3 meets at 3', () => {
    const amrap = snapshot('x:0', { weightKg: 100, reps: 5, amrap: true, minReps: 3 });
    expect(isSetMet({ weightKg: 100, reps: 3 }, amrap, kg, 'kg')).toBe(true);
    expect(isSetMet({ weightKg: 100, reps: 2 }, amrap, kg, 'kg')).toBe(false);
  });

  it('ignores minReps on a non-AMRAP set: 5 with min 3 still misses at 3', () => {
    const fixed = snapshot('x:0', { weightKg: 100, reps: 5, amrap: false, minReps: 3 });
    expect(isSetMet({ weightKg: 100, reps: 3 }, fixed, kg, 'kg')).toBe(false);
  });

  it('meets an AMRAP 1+ at a single rep', () => {
    const single = snapshot('squat-main:2', { weightKg: 135, reps: 1, amrap: true, minReps: 1 });
    expect(isSetMet({ weightKg: 135, reps: 1 }, single, kg, 'kg')).toBe(true);
  });

  it('uses half a 5 lb increment in kg for lb enrollments: 195 lb = 88.45 kg allows 87.5 kg but not 87.0 kg', () => {
    const lbSnapshot = snapshot('squat-main:0', { weightKg: 88.45, reps: 5 });
    expect(isSetMet({ weightKg: 87.5, reps: 5 }, lbSnapshot, DEFAULT_ROUNDING.lb, 'lb')).toBe(true);
    expect(isSetMet({ weightKg: 87, reps: 5 }, lbSnapshot, DEFAULT_ROUNDING.lb, 'lb')).toBe(false);
  });
});

describe('liftOutcomes (judged against snapshots on each lift judged slots)', () => {
  const monday = (sets: FactSet[]) =>
    sessionFact({ id: 's-1', at: '2026-10-05T06:00:00.000Z' }, weekDay(4, 'mon'), sets);

  it('judges squat, bench and row on Monday', () => {
    expect(liftOutcomes(MADCOW_5X5, madcow, monday(madcowDaySets('mon')))).toEqual({
      squat: 'met',
      bench: 'met',
      row: 'met',
    });
  });

  it('judges press and deadlift on Wednesday and not the light squat', () => {
    const wednesday = sessionFact(
      { id: 's-2', at: '2026-10-07T06:00:00.000Z' },
      weekDay(4, 'wed'),
      madcowDaySets('wed'),
    );
    expect(liftOutcomes(MADCOW_5X5, madcow, wednesday)).toEqual({ press: 'met', deadlift: 'met' });
  });

  it('misses a lift when its top set is one rep short', () => {
    const outcomes = liftOutcomes(MADCOW_5X5, madcow, monday(madcowDaySets('mon', { mondayTopReps: { squat: 4 } })));
    expect(outcomes.squat).toBe('missed');
    expect(outcomes.bench).toBe('met');
  });

  it('misses a lift when a required set is not logged (4 of 5 sets)', () => {
    const fourSets = rampSets('mon-squat', 'squat', 5).slice(0, 4);
    const sets = [...fourSets, ...rampSets('mon-bench', 'bench', 5), ...rampSets('mon-row', 'row', 5)];
    expect(liftOutcomes(MADCOW_5X5, madcow, monday(sets)).squat).toBe('missed');
  });

  it('ignores sets with no snapshot: an extra 3-rep squat set leaves the squat met', () => {
    const sets = [...madcowDaySets('mon'), unprescribedSet('squat', 60, 3)];
    expect(liftOutcomes(MADCOW_5X5, madcow, monday(sets)).squat).toBe('met');
  });

  it('ignores refs whose bound exercise differs: all squat sets logged as front squat make the squat neutral', () => {
    const sets = madcowDaySets('mon').map((set) =>
      set.exerciseId === 'squat' ? { ...set, exerciseId: 'front-squat' } : set,
    );
    expect(liftOutcomes(MADCOW_5X5, madcow, monday(sets)).squat).toBe('neutral');
  });

  it('ignores a mismatched top set, so the remaining 4 sets are a miss', () => {
    const sets = madcowDaySets('mon').map((set) =>
      set.prescription?.ref === 'mon-squat:4' ? { ...set, exerciseId: 'front-squat' } : set,
    );
    expect(liftOutcomes(MADCOW_5X5, madcow, monday(sets)).squat).toBe('missed');
  });

  it('ignores refs from another day: Friday squat refs in a Monday session leave the squat neutral', () => {
    const fridayRefs = [0, 1, 2, 3, 4].map((index) =>
      setAsPrescribed('squat', `fri-squat:${index}`, { weightKg: 80, reps: 5 }),
    );
    const sets = [...fridayRefs, ...rampSets('mon-bench', 'bench', 5), ...rampSets('mon-row', 'row', 5)];
    expect(liftOutcomes(MADCOW_5X5, madcow, monday(sets)).squat).toBe('neutral');
  });

  it('treats a lift with no logged sets on its judged day as neutral', () => {
    const sets = [...rampSets('mon-bench', 'bench', 5), ...rampSets('mon-row', 'row', 5)];
    expect(liftOutcomes(MADCOW_5X5, madcow, monday(sets)).squat).toBe('neutral');
  });

  it('judges a set against its snapshot, not the current prescription: 80 × 5 at an 80 kg snapshot is met', () => {
    const sets = madcowDaySets('mon');
    expect(sets.every((set) => set.prescription?.weightKg === 80)).toBe(true);
    expect(liftOutcomes(MADCOW_5X5, madcow, monday(sets)).squat).toBe('met');
  });
});

describe('fold rule 1: order by (serverTime, id)', () => {
  it('folds facts given out of order in server-time order', () => {
    const clock = factClock();
    const facts = [...madcowWeek(clock, 1), ...madcowWeek(clock, 2)];
    expect(programStateAt(MADCOW_5X5, madcow, [...facts].reverse())).toEqual(programStateAt(MADCOW_5X5, madcow, facts));
  });

  it('breaks a server-time tie by id: ref-a (120) folds before ref-b (110), leaving 110', () => {
    const at = '2026-10-05T06:00:00.000Z';
    const facts = [
      setReferenceFact({ id: 'ref-b', at }, 'squat', 'tm', 110),
      setReferenceFact({ id: 'ref-a', at }, 'squat', 'tm', 120),
    ];
    expect(refOf(programStateAt(LINEAR_AFTER_SESSION, linear, facts), 'squat', 'tm')).toBe(110);
  });

  it('uses being local only as a final tie-break: a local ref-a still folds before a server ref-b', () => {
    const at = '2026-10-05T06:00:00.000Z';
    const facts: ProgramFact[] = [
      setReferenceFact({ id: 'ref-b', at }, 'squat', 'tm', 110),
      { ...setReferenceFact({ id: 'ref-a', at }, 'squat', 'tm', 120), local: true },
    ];
    expect(refOf(programStateAt(LINEAR_AFTER_SESSION, linear, facts), 'squat', 'tm')).toBe(110);
  });

  it('orderFacts sorts by server time, then id', () => {
    const facts = [
      setReferenceFact({ id: 'c', at: '2026-10-05T06:02:00.000Z' }, 'squat', 'tm', 1),
      setReferenceFact({ id: 'b', at: '2026-10-05T06:01:00.000Z' }, 'squat', 'tm', 2),
      setReferenceFact({ id: 'a', at: '2026-10-05T06:01:00.000Z' }, 'squat', 'tm', 3),
    ];
    expect(orderFacts(facts).map((fact) => fact.id)).toEqual(['a', 'b', 'c']);
  });

  it('programStateAt equals advanceProgram folded over the ordered facts from initialProgramState', () => {
    const clock = factClock();
    const facts = [
      ...madcowWeek(clock, 1),
      setReferenceFact(clock.next(), 'squat', 'top', 95),
      ...madcowWeek(clock, 2, { skip: ['wed'] }),
    ];
    const stepwise = orderFacts(facts).reduce(
      (state, fact) => advanceProgram(MADCOW_5X5, madcow, state, fact),
      initialProgramState(MADCOW_5X5, madcow),
    );
    expect(programStateAt(MADCOW_5X5, madcow, facts)).toEqual(stepwise);
  });
});

describe('fold rule 2: duplicate positions union-merge', () => {
  it('a missed then a met session at week 4 Monday keep the best set per ref: week 5 top 102.5', () => {
    const clock = factClock();
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3]),
      sessionFact(clock.next(), weekDay(4, 'mon'), madcowDaySets('mon', { mondayTopReps: { squat: 4 } })),
      ...madcowWeek(clock, 4),
    ];
    expect(refOf(programStateAt(MADCOW_5X5, madcow, facts), 'squat', 'top')).toBeCloseTo(102.5, 9);
  });

  it('a met then a missed session at the same position still count as met (met beats not met)', () => {
    const clock = factClock();
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3]),
      sessionFact(clock.next(), weekDay(4, 'mon'), madcowDaySets('mon')),
      sessionFact(clock.next(), weekDay(4, 'mon'), madcowDaySets('mon', { mondayTopReps: { squat: 4 } })),
      ...madcowWeek(clock, 4, { omit: ['mon'] }),
    ];
    const state = programStateAt(MADCOW_5X5, madcow, facts);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(102.5, 9);
    expect(missesOf(state, 'squat')).toBe(0);
  });

  it('a 5 × 5 split across two sessions at the same position is one complete 5 × 5', () => {
    const clock = factClock();
    const squat = rampSets('mon-squat', 'squat', 5);
    const rest = [...rampSets('mon-bench', 'bench', 5), ...rampSets('mon-row', 'row', 5)];
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3]),
      sessionFact(clock.next(), weekDay(4, 'mon'), [...squat.slice(0, 2), ...rest]),
      sessionFact(clock.next(), weekDay(4, 'mon'), squat.slice(2)),
      ...madcowWeek(clock, 4, { omit: ['mon'] }),
    ];
    expect(refOf(programStateAt(MADCOW_5X5, madcow, facts), 'squat', 'top')).toBeCloseTo(102.5, 9);
  });

  it('completes the day once: two Monday sessions leave Monday completed once and Wednesday next', () => {
    const clock = factClock();
    const facts = [
      sessionFact(clock.next(), weekDay(1, 'mon'), madcowDaySets('mon')),
      sessionFact(clock.next(), weekDay(1, 'mon'), madcowDaySets('mon')),
    ];
    const state = programStateAt(MADCOW_5X5, madcow, facts);
    expect(state.completedDays).toEqual(['mon']);
    expect(state.position).toEqual(weekDay(1, 'wed'));
    expect(dayRecordsAt(state, weekDay(1, 'mon'))).toHaveLength(1);
  });

  it('two after-session duplicates at one position apply the increment once', () => {
    const clock = factClock();
    const facts = [
      sessionFact(clock.next(), linearDay(1, 'a'), linearSquatSets('a')),
      sessionFact(clock.next(), linearDay(1, 'a'), linearSquatSets('a')),
    ];
    expect(refOf(programStateAt(LINEAR_AFTER_SESSION, linear, facts), 'squat', 'tm')).toBeCloseTo(102.5, 9);
  });
});

describe('fold rule 2: duplicate after-session positions in either order', () => {
  const missedThenMet = () => [
    sessionFact({ id: 'session-1', at: '2026-10-05T06:00:00.000Z' }, linearDay(1, 'a'), linearSquatSets('a', 3)),
    sessionFact({ id: 'session-2', at: '2026-10-05T07:00:00.000Z' }, linearDay(1, 'a'), linearSquatSets('a')),
  ];
  const metThenMissed = () => [
    sessionFact({ id: 'session-1', at: '2026-10-05T06:00:00.000Z' }, linearDay(1, 'a'), linearSquatSets('a')),
    sessionFact({ id: 'session-2', at: '2026-10-05T07:00:00.000Z' }, linearDay(1, 'a'), linearSquatSets('a', 3)),
  ];
  const comparable = (state: ProgramState) => ({
    position: state.position,
    completedDays: state.completedDays,
    refs: state.refs,
    consecutiveMisses: state.consecutiveMisses,
    days: state.days,
  });

  it('a missed session folded first and a met one second end met: 100 → 102.5', () => {
    expect(refOf(programStateAt(LINEAR_AFTER_SESSION, linear, missedThenMet()), 'squat', 'tm')).toBeCloseTo(102.5, 9);
  });

  it('both orders end with the same state', () => {
    expect(comparable(programStateAt(LINEAR_AFTER_SESSION, linear, missedThenMet()))).toEqual(
      comparable(programStateAt(LINEAR_AFTER_SESSION, linear, metThenMissed())),
    );
  });
});

describe('fold rule 3: completed beats skipped, whatever the order', () => {
  it('skip then complete Monday in week 4: the Monday counts as met and week 5 top is 102.5', () => {
    const clock = factClock();
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3]),
      skipDayFact(clock.next(), weekDay(4, 'mon')),
      sessionFact(clock.next(), weekDay(4, 'mon'), madcowDaySets('mon')),
      ...madcowWeek(clock, 4, { omit: ['mon'] }),
    ];
    const state = programStateAt(MADCOW_5X5, madcow, facts);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(102.5, 9);
    expect(dayRecordsAt(state, weekDay(4, 'mon')).map((record) => record.status)).toEqual(['completed']);
  });

  it('complete then skip Monday in week 4: the Monday stays completed and met', () => {
    const clock = factClock();
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3]),
      sessionFact(clock.next(), weekDay(4, 'mon'), madcowDaySets('mon')),
      skipDayFact(clock.next(), weekDay(4, 'mon')),
      ...madcowWeek(clock, 4, { omit: ['mon'] }),
    ];
    const state = programStateAt(MADCOW_5X5, madcow, facts);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(102.5, 9);
    expect(dayRecordsAt(state, weekDay(4, 'mon')).map((record) => record.status)).toEqual(['completed']);
  });

  it('a skipped day counts toward finishing the week', () => {
    const clock = factClock();
    const facts = [
      skipDayFact(clock.next(), weekDay(1, 'mon')),
      skipDayFact(clock.next(), weekDay(1, 'wed')),
      skipDayFact(clock.next(), weekDay(1, 'fri')),
    ];
    expect(programStateAt(MADCOW_5X5, madcow, facts).position).toEqual(weekDay(2, 'mon'));
  });
});

describe('fold rule 4: a late fact never rewinds', () => {
  it('a late week 4 Monday after the week rolled over keeps the position and does not re-run endOfWeek', () => {
    const clock = factClock();
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3]),
      ...madcowWeek(clock, 4, { skip: ['mon'] }),
      sessionFact(clock.next(), weekDay(4, 'mon'), madcowDaySets('mon')),
    ];
    const state = programStateAt(MADCOW_5X5, madcow, facts);
    expect(state.position).toEqual(weekDay(5, 'mon'));
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(100, 2);
  });

  it('a late session still completes its day (completed beats the earlier skip)', () => {
    const clock = factClock();
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3]),
      ...madcowWeek(clock, 4, { skip: ['mon'] }),
      sessionFact(clock.next(), weekDay(4, 'mon'), madcowDaySets('mon')),
    ];
    const state = programStateAt(MADCOW_5X5, madcow, facts);
    expect(dayRecordsAt(state, weekDay(4, 'mon')).map((record) => record.status)).toEqual(['completed']);
  });

  it('a late session applies lift-scoped afterSession triggers: 100 → 102.5 (ahead) → 105 (late)', () => {
    const clock = factClock();
    const facts = [
      sessionFact(clock.next(), linearDay(2, 'a'), linearSquatSets('a')),
      sessionFact(clock.next(), linearDay(1, 'a'), linearSquatSets('a')),
    ];
    const state = programStateAt(LINEAR_AFTER_SESSION, linear, facts);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(105, 9);
    expect(state.position).toEqual(linearDay(2, 'b'));
  });

  it('a late missed after-session session holds: 100 → 102.5 (ahead met) → 102.5 (late missed)', () => {
    const clock = factClock();
    const facts = [
      sessionFact(clock.next(), linearDay(2, 'a'), linearSquatSets('a')),
      sessionFact(clock.next(), linearDay(1, 'b'), linearSquatSets('b', 4)),
    ];
    expect(refOf(programStateAt(LINEAR_AFTER_SESSION, linear, facts), 'squat', 'tm')).toBeCloseTo(102.5, 9);
  });

  it('an afterSession trigger fires per completed session: two met sessions take 100 → 105', () => {
    const clock = factClock();
    const facts = [
      sessionFact(clock.next(), linearDay(1, 'a'), linearSquatSets('a')),
      sessionFact(clock.next(), linearDay(1, 'b'), linearSquatSets('b')),
    ];
    const state = programStateAt(LINEAR_AFTER_SESSION, linear, facts);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(105, 9);
    expect(state.position).toEqual(linearDay(2, 'a'));
  });
});

describe('fold rule 5: an ahead position implicitly skips', () => {
  it('a week 5 Monday after week 4 Monday and Wednesday skips week 4 Friday and rolls the week', () => {
    const clock = factClock();
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3]),
      ...madcowWeek(clock, 4, { omit: ['fri'] }),
      sessionFact(clock.next(), weekDay(5, 'mon'), madcowDaySets('mon')),
    ];
    const state = programStateAt(MADCOW_5X5, madcow, facts);
    expect(state.position).toEqual(weekDay(5, 'wed'));
    expect(state.completedDays).toEqual(['mon']);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(102.5, 9);
    expect(dayRecordsAt(state, weekDay(4, 'fri')).map((record) => record.status)).toEqual(['skipped']);
  });

  it('an implicitly skipped top day is neutral: no Monday in week 4 keeps the week 5 squat top at 100 with no miss', () => {
    const clock = factClock();
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3]),
      ...madcowWeek(clock, 4, { omit: ['mon'] }),
      sessionFact(clock.next(), weekDay(5, 'wed'), madcowDaySets('wed')),
    ];
    const state = programStateAt(MADCOW_5X5, madcow, facts);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(100, 2);
    expect(missesOf(state, 'squat')).toBe(0);
    expect(refOf(state, 'press', 'top')).toBeCloseTo(51.25, 9);
  });

  it('skips every uncompleted day of the weeks in between: a week 3 session from week 1 skips weeks 1 and 2', () => {
    const clock = factClock();
    const facts = [sessionFact(clock.next(), weekDay(3, 'wed'), madcowDaySets('wed'))];
    const state = programStateAt(MADCOW_5X5, madcow, facts);
    expect(state.position).toEqual(weekDay(3, 'mon'));
    expect(state.completedDays).toEqual(['wed']);
    expect(dayRecordsAt(state, weekDay(2, 'fri')).map((record) => record.status)).toEqual(['skipped']);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(92.69, 2);
  });
});

describe('fold rule 6: jump_to sets the position', () => {
  it('jump_to week 3 Monday moves the position with nothing completed', () => {
    const clock = factClock();
    const state = programStateAt(MADCOW_5X5, madcow, [jumpToFact(clock.next(), weekDay(3, 'mon'))]);
    expect(state.position).toEqual(weekDay(3, 'mon'));
    expect(state.completedDays).toEqual([]);
  });

  it('a later session at an earlier position after jump_to follows rule 4 and keeps the jumped position', () => {
    const clock = factClock();
    const facts = [
      jumpToFact(clock.next(), weekDay(3, 'mon')),
      sessionFact(clock.next(), weekDay(1, 'wed'), madcowDaySets('wed')),
    ];
    expect(programStateAt(MADCOW_5X5, madcow, facts).position).toEqual(weekDay(3, 'mon'));
  });

  it('a late session after jump_to records its outcome for the trigger still pending: a late bench miss resets bench 100 → 90', () => {
    const clock = factClock();
    const enrollment = fiveThreeOneEnrollment();
    const facts = [
      jumpToFact(clock.next(), cyclePosition(1, 3, 'squat')),
      sessionFact(clock.next(), cyclePosition(1, 1, 'bench'), mainSets531('bench', 1, 4)),
      ...cycleSessions(clock, 1, { weeks: [3, 4] }),
    ];
    const state = programStateAt(FIVE_THREE_ONE, enrollment, facts);
    expect(state.position).toEqual(cyclePosition(2, 1, 'squat'));
    expect(refOf(state, 'bench', 'tm')).toBeCloseTo(90, 9);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(145, 9);
  });
});

describe('fold rule 7: mismatched refs and sets with no snapshot are ignored', () => {
  it('a week 4 Monday logged entirely on another exercise is neutral for the squat: top stays 100, no miss', () => {
    const clock = factClock();
    const swapped = madcowDaySets('mon').map((set) =>
      set.exerciseId === 'squat' ? { ...set, exerciseId: 'front-squat' } : set,
    );
    const facts = [
      ...metMadcowWeeks(clock, [1, 2, 3]),
      sessionFact(clock.next(), weekDay(4, 'mon'), swapped),
      ...madcowWeek(clock, 4, { omit: ['mon'] }),
    ];
    const state = programStateAt(MADCOW_5X5, madcow, facts);
    expect(refOf(state, 'squat', 'top')).toBeCloseTo(100, 2);
    expect(missesOf(state, 'squat')).toBe(0);
    expect(refOf(state, 'bench', 'top')).toBeCloseTo(82, 9);
  });

  it('unprescribed extra sets do not change the fold state', () => {
    const clock = factClock();
    const plain = madcowWeek(clock, 1);
    const withExtras = plain.map((fact) =>
      fact.kind === 'session' ? { ...fact, sets: [...fact.sets, unprescribedSet('squat', 40, 2)] } : fact,
    );
    expect(programStateAt(MADCOW_5X5, madcow, withExtras)).toEqual(programStateAt(MADCOW_5X5, madcow, plain));
  });
});

describe('fold rule 8: set_reference applies in server order', () => {
  it('an earlier-server-time set_reference folds before a pending local session: 120 then +2.5 = 122.5', () => {
    const local = {
      ...sessionFact({ id: 'local-1', at: '2026-10-05T07:00:00.000Z' }, linearDay(1, 'a'), linearSquatSets('a')),
      local: true,
    };
    const reference = setReferenceFact({ id: 'event-1', at: '2026-10-05T06:30:00.000Z' }, 'squat', 'tm', 120);
    expect(refOf(programStateAt(LINEAR_AFTER_SESSION, linear, [local, reference]), 'squat', 'tm')).toBeCloseTo(
      122.5,
      9,
    );
  });

  it('a later-server-time set_reference overrides the session increment: 102.5 then 120', () => {
    const session = sessionFact(
      { id: 'session-1', at: '2026-10-05T07:00:00.000Z' },
      linearDay(1, 'a'),
      linearSquatSets('a'),
    );
    const reference = setReferenceFact({ id: 'event-1', at: '2026-10-05T07:30:00.000Z' }, 'squat', 'tm', 120);
    expect(refOf(programStateAt(LINEAR_AFTER_SESSION, linear, [reference, session]), 'squat', 'tm')).toBe(120);
  });

  it('a set_reference for one lift leaves the other lifts unchanged', () => {
    const clock = factClock();
    const state = programStateAt(MADCOW_5X5, madcow, [setReferenceFact(clock.next(), 'squat', 'top', 90)]);
    expect(refOf(state, 'squat', 'top')).toBe(90);
    expect(refOf(state, 'bench', 'top')).toBeCloseTo(74.15, 2);
  });
});

describe('fold rule 9: dedup by id', () => {
  it('an identical copy of a fact changes nothing', () => {
    const clock = factClock();
    const facts = madcowWeek(clock, 1);
    expect(programStateAt(MADCOW_5X5, madcow, [...facts, facts[0]])).toEqual(programStateAt(MADCOW_5X5, madcow, facts));
  });

  it('the server copy beats a local copy with the same id, whichever comes first', () => {
    const stamp = { id: 'session-1', at: '2026-10-05T06:00:00.000Z' };
    const server = sessionFact(stamp, linearDay(1, 'a'), linearSquatSets('a'));
    const staleLocal = sessionFact(stamp, linearDay(1, 'a'), linearSquatSets('a', 3), true);
    expect(refOf(programStateAt(LINEAR_AFTER_SESSION, linear, [staleLocal, server]), 'squat', 'tm')).toBeCloseTo(
      102.5,
      9,
    );
    expect(refOf(programStateAt(LINEAR_AFTER_SESSION, linear, [server, staleLocal]), 'squat', 'tm')).toBeCloseTo(
      102.5,
      9,
    );
  });

  it('orderFacts keeps the server copy of a duplicated id', () => {
    const stamp = { id: 'session-1', at: '2026-10-05T06:00:00.000Z' };
    const server = sessionFact(stamp, linearDay(1, 'a'), linearSquatSets('a'));
    const staleLocal = sessionFact(stamp, linearDay(1, 'a'), linearSquatSets('a', 3), true);
    expect(orderFacts([staleLocal, server])).toEqual([server]);
  });

  it('a pending local session with no server copy still counts', () => {
    const local = sessionFact(
      { id: 'local-1', at: '2026-10-05T06:00:00.000Z' },
      linearDay(1, 'a'),
      linearSquatSets('a'),
      true,
    );
    expect(refOf(programStateAt(LINEAR_AFTER_SESSION, linear, [local]), 'squat', 'tm')).toBeCloseTo(102.5, 9);
  });
});

describe('snapshot honesty', () => {
  const enrollment = fiveThreeOneEnrollment();

  function squatWeekOne(topSetLoggedKg: number): FactSet[] {
    return [
      setAsPrescribed('squat', 'squat-main:0', { weightKg: 90, reps: 5 }),
      setAsPrescribed('squat', 'squat-main:1', { weightKg: 105, reps: 5 }),
      loggedSet(
        'squat',
        { weightKg: topSetLoggedKg, reps: 5 },
        snapshot('squat-main:2', { weightKg: 120, reps: 5, amrap: true, minReps: 5 }),
      ),
    ];
  }

  function cycleWithReference(topSetLoggedKg: number, newTm: number): ProgramFact[] {
    const clock = factClock();
    return [
      sessionFact(clock.next(), cyclePosition(1, 1, 'squat'), squatWeekOne(topSetLoggedKg)),
      ...cycleSessions(clock, 1, { weeks: [1], lifts: ['bench', 'deadlift', 'press'] }),
      setReferenceFact(clock.next(), 'squat', 'tm', newTm),
      ...cycleSessions(clock, 1, { weeks: [2, 3, 4] }),
    ];
  }

  it('judges against the heavier snapshot after a lower set_reference: 110 × 5 at a 120 snapshot is missed although TM 120 would re-prescribe 102.5, so TM 120 resets to 108 and not 125', () => {
    const state = programStateAt(FIVE_THREE_ONE, enrollment, cycleWithReference(110, 120));
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(108, 9);
    expect(refOf(state, 'squat', 'tm')).not.toBeCloseTo(125, 9);
  });

  it('keeps a set met at its snapshot met after a lower set_reference: 120 × 5 at a 120 snapshot, TM 120 then +5 = 125', () => {
    expect(refOf(programStateAt(FIVE_THREE_ONE, enrollment, cycleWithReference(120, 120)), 'squat', 'tm')).toBeCloseTo(
      125,
      9,
    );
  });

  it('judges against the lighter snapshot after a higher set_reference: 120 × 5 at a 120 snapshot is met although TM 160 would re-prescribe 135, so 160 then +5 = 165 and not a reset to 144', () => {
    const state = programStateAt(FIVE_THREE_ONE, enrollment, cycleWithReference(120, 160));
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(165, 9);
    expect(refOf(state, 'squat', 'tm')).not.toBeCloseTo(144, 9);
  });
});
