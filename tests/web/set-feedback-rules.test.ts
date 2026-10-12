import { describe, expect, it } from 'vitest';
import {
  NEW_RECORD_VIBRATION_MS,
  SET_DONE_VIBRATION_MS,
  setFeedback,
  type SetFeedbackInput,
} from '../../web/src/features/workout/set-feedback-rules.ts';

const FIVE_REP_MAX = { kind: 'rep_max' as const, reps: 5, loadKg: 100, previousLoadKg: 95 };

function input(overrides: Partial<SetFeedbackInput> = {}): SetFeedbackInput {
  return {
    label: 'Set 2',
    wasDone: false,
    isDone: true,
    preview: { xp: 45, basis: 'logged', rir: 2 },
    record: null,
    becameRecord: false,
    vibrate: true,
    ...overrides,
  };
}

describe('setFeedback', () => {
  it('drops the previewed XP and buzzes briefly when a set is marked done', () => {
    expect(setFeedback(input())).toEqual({
      drop: { xpText: '+~45 XP', record: false, announcement: 'Set 2 logged, about 45 XP' },
      vibrationMs: SET_DONE_VIBRATION_MS,
    });
  });

  it('keeps the plain buzz short', () => {
    expect(SET_DONE_VIBRATION_MS.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(15);
  });

  it('pulses the record and uses the record buzz when the logged set is a new record', () => {
    expect(setFeedback(input({ record: FIVE_REP_MAX, becameRecord: true }))).toEqual({
      drop: {
        xpText: '+~45 XP',
        record: true,
        announcement: 'Set 2 logged, about 45 XP. Predicted new 5 rep max',
      },
      vibrationMs: NEW_RECORD_VIBRATION_MS,
    });
  });

  it('gives no feedback when a set is undone', () => {
    expect(setFeedback(input({ wasDone: true, isDone: false }))).toEqual({ drop: null, vibrationMs: null });
  });

  it('gives no drop when a done set is only edited', () => {
    expect(setFeedback(input({ wasDone: true, isDone: true }))).toEqual({ drop: null, vibrationMs: null });
  });

  it('still buzzes for a record reached by editing a done set', () => {
    expect(setFeedback(input({ wasDone: true, record: FIVE_REP_MAX, becameRecord: true }))).toEqual({
      drop: null,
      vibrationMs: NEW_RECORD_VIBRATION_MS,
    });
  });

  it('stays silent on a planned set that is edited but not done', () => {
    expect(setFeedback(input({ isDone: false }))).toEqual({ drop: null, vibrationMs: null });
  });

  it('never vibrates when vibration is switched off', () => {
    expect(setFeedback(input({ vibrate: false })).vibrationMs).toBeNull();
    expect(setFeedback(input({ vibrate: false, record: FIVE_REP_MAX, becameRecord: true })).vibrationMs).toBeNull();
    expect(setFeedback(input({ vibrate: false })).drop?.xpText).toBe('+~45 XP');
  });

  it('announces without a floating number when the XP is unknown', () => {
    expect(setFeedback(input({ preview: { xp: 0, basis: 'unknown', rir: null } })).drop).toEqual({
      xpText: null,
      record: false,
      announcement: 'Set 2 logged',
    });
  });

  it('announces a warm-up without a floating number', () => {
    expect(setFeedback(input({ preview: { xp: 0, basis: 'warmup', rir: null } })).drop).toEqual({
      xpText: null,
      record: false,
      announcement: 'Set 2 logged, warm-up',
    });
  });

  it('announces a set past the effort window without a floating number', () => {
    expect(setFeedback(input({ preview: { xp: 0, basis: 'logged', rir: 5 } })).drop).toEqual({
      xpText: null,
      record: false,
      announcement: 'Set 2 logged, no XP',
    });
  });

  it('uses the row label it is given', () => {
    expect(setFeedback(input({ label: 'Bout 1' })).drop?.announcement).toBe('Bout 1 logged, about 45 XP');
  });
});
