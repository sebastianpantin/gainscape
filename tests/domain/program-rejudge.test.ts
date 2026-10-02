import { describe, expect, it } from 'vitest';
import { type ProgramState, programStateAt } from '@domain/index.ts';
import { sessionFact } from './program-fixtures/facts.ts';
import { linearDay, linearEnrollment, linearSquatSets } from './program-fixtures/linear_after_session.ts';
import { refOf } from './program-fixtures/prescription-helpers.ts';
import { LINEAR_DELOAD_AFTER_SESSION } from './program-fixtures/review-fixtures.ts';

const enrollment = linearEnrollment(100);

function withoutFactIds(state: ProgramState) {
  return {
    position: state.position,
    completedDays: state.completedDays,
    refs: state.refs,
    consecutiveMisses: state.consecutiveMisses,
    days: state.days,
    history: state.history,
  };
}

const missedSession = (id: string, at: string) => sessionFact({ id, at }, linearDay(1, 'a'), linearSquatSets('a', 3));
const metSession = (id: string, at: string) => sessionFact({ id, at }, linearDay(1, 'a'), linearSquatSets('a'));

describe('an after-session day re-judged from missed to met applies only its final outcome', () => {
  it('missed then met at the same position ends at 100 + 2.5 = 102.5, not 100 × 0.9 + 2.5 = 92.5', () => {
    const facts = [
      missedSession('session-1', '2026-10-05T06:00:00.000Z'),
      metSession('session-2', '2026-10-05T07:00:00.000Z'),
    ];
    expect(refOf(programStateAt(LINEAR_DELOAD_AFTER_SESSION, enrollment, facts), 'squat', 'tm')).toBeCloseTo(102.5, 9);
  });

  it('missed then met ends in exactly the state of a single met session', () => {
    const rejudged = programStateAt(LINEAR_DELOAD_AFTER_SESSION, enrollment, [
      missedSession('session-1', '2026-10-05T06:00:00.000Z'),
      metSession('session-2', '2026-10-05T07:00:00.000Z'),
    ]);
    const singleMet = programStateAt(LINEAR_DELOAD_AFTER_SESSION, enrollment, [
      metSession('session-2', '2026-10-05T07:00:00.000Z'),
    ]);
    expect(withoutFactIds(rejudged)).toEqual(withoutFactIds(singleMet));
  });

  it('a single missed session deloads 100 → 90', () => {
    const state = programStateAt(LINEAR_DELOAD_AFTER_SESSION, enrollment, [
      missedSession('session-1', '2026-10-05T06:00:00.000Z'),
    ]);
    expect(refOf(state, 'squat', 'tm')).toBeCloseTo(90, 9);
  });

  it('met then missed keeps the best set per ref and ends in exactly the state of a single met session', () => {
    const merged = programStateAt(LINEAR_DELOAD_AFTER_SESSION, enrollment, [
      metSession('session-1', '2026-10-05T06:00:00.000Z'),
      missedSession('session-2', '2026-10-05T07:00:00.000Z'),
    ]);
    const singleMet = programStateAt(LINEAR_DELOAD_AFTER_SESSION, enrollment, [
      metSession('session-1', '2026-10-05T06:00:00.000Z'),
    ]);
    expect(withoutFactIds(merged)).toEqual(withoutFactIds(singleMet));
  });
});
