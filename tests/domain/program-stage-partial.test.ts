import { describe, expect, it } from 'vitest';
import { type FactSet, programStateAt, type ReferenceState } from '@domain/index.ts';
import { factClock, sessionFact } from './program-fixtures/facts.ts';
import { followProgram, loggedAsPrescribed, resolveAt } from './program-fixtures/follow.ts';
import { GZCLP, gzclpEnrollment } from './program-fixtures/gzclp.ts';
import { refOf } from './program-fixtures/prescription-helpers.ts';

const kg = gzclpEnrollment();

function squatT1SetsAtStage(stage: number, refs: ReferenceState['refs'], loggedCount: number): FactSet[] {
  const resolved = resolveAt(GZCLP, kg, { refs, stages: { 'squat-t1': stage } }, { index: 0 });
  return loggedAsPrescribed(resolved.filter((slot) => slot.slotId === 'a1-squat-t1')).slice(0, loggedCount);
}

describe('a partially logged stages slot is judged against every set of the prescribed stage', () => {
  it('a stale 5×3 session with only 4 of the 5 sets logged, while the state is at 6×2, is a miss', () => {
    const clock = factClock();
    const { facts, state } = followProgram(GZCLP, kg, clock, [{ missedLifts: ['squat-t1'] }, {}, {}, {}]);
    expect(state.stages['squat-t1']).toBe(1);
    const stale = squatT1SetsAtStage(0, state.refs, 4);
    const after = programStateAt(GZCLP, kg, [...facts, sessionFact(clock.next(), { index: 4 }, stale)]);
    expect(after.days.at(-1)?.outcomes['squat-t1']).toBe('missed');
    expect(refOf(after, 'squat-t1', 'workingWeight')).toBe(100);
  });

  it('a 6×2 session with only 5 of the 6 sets logged, while the state is at 5×3, is a miss', () => {
    const clock = factClock();
    const refs = programStateAt(GZCLP, kg, []).refs;
    const fiveOfSix = squatT1SetsAtStage(1, refs, 5);
    const state = programStateAt(GZCLP, kg, [sessionFact(clock.next(), { index: 0 }, fiveOfSix)]);
    expect(state.days[0].outcomes['squat-t1']).toBe('missed');
    expect(refOf(state, 'squat-t1', 'workingWeight')).toBe(100);
  });
});
