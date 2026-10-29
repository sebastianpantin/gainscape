import { describe, expect, it, vi } from 'vitest';
import {
  feedbackLabel,
  SET_DONE_VIBRATION_MS,
  setFeedback,
  type SetFeedbackInput,
} from '../../web/src/features/workout/set-feedback-rules.ts';
import type { PreviewRecord } from '../../web/src/features/workout/record-preview.ts';
import type { SetPreview } from '../../web/src/features/workout/xp-preview.ts';

const FIVE_REP_MAX = { kind: 'rep_max' as const, reps: 5, loadKg: 100, previousLoadKg: 95 };

interface FeedbackValues extends Omit<SetFeedbackInput, 'preview' | 'record' | 'becameRecord'> {
  preview: SetPreview;
  record: PreviewRecord | null;
  becameRecord: boolean;
}

function input(overrides: Partial<FeedbackValues> = {}): SetFeedbackInput {
  const values: FeedbackValues = {
    label: 'Set 2',
    wasDone: false,
    isDone: true,
    preview: { xp: 45, basis: 'logged', rir: 2 },
    record: null,
    becameRecord: false,
    vibrate: true,
    sound: true,
    ...overrides,
  };
  return {
    ...values,
    preview: vi.fn(() => values.preview),
    record: vi.fn(() => values.record),
    becameRecord: vi.fn(() => values.becameRecord),
  };
}

describe('setFeedback', () => {
  it('drops the previewed XP and buzzes briefly when a set is marked done', () => {
    expect(setFeedback(input())).toEqual({
      drop: { xpText: '+~45 XP', record: false, announcement: 'Set 2 logged, about 45 XP' },
      vibrationMs: SET_DONE_VIBRATION_MS,
      celebratesRecord: false,
    });
  });

  it('keeps the plain buzz short', () => {
    expect(SET_DONE_VIBRATION_MS.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(15);
  });

  it('pulses the record and celebrates instead of the plain buzz when the logged set is a new record', () => {
    expect(setFeedback(input({ record: FIVE_REP_MAX, becameRecord: true }))).toEqual({
      drop: {
        xpText: '+~45 XP',
        record: true,
        announcement: 'Set 2 logged, about 45 XP. Predicted new 5 rep max',
      },
      vibrationMs: null,
      celebratesRecord: true,
    });
  });

  it('gives no feedback when a set is undone', () => {
    expect(setFeedback(input({ wasDone: true, isDone: false }))).toEqual({
      drop: null,
      vibrationMs: null,
      celebratesRecord: false,
    });
  });

  it('gives no drop when a done set is only edited', () => {
    expect(setFeedback(input({ wasDone: true, isDone: true }))).toEqual({
      drop: null,
      vibrationMs: null,
      celebratesRecord: false,
    });
  });

  it('still celebrates a record reached by editing a done set', () => {
    expect(setFeedback(input({ wasDone: true, record: FIVE_REP_MAX, becameRecord: true }))).toEqual({
      drop: null,
      vibrationMs: null,
      celebratesRecord: true,
    });
  });

  it('stays silent on a planned set that is edited but not done', () => {
    expect(setFeedback(input({ isDone: false }))).toEqual({
      drop: null,
      vibrationMs: null,
      celebratesRecord: false,
    });
  });

  it('never vibrates when vibration is switched off', () => {
    expect(setFeedback(input({ vibrate: false })).vibrationMs).toBeNull();
    expect(setFeedback(input({ vibrate: false, record: FIVE_REP_MAX, becameRecord: true })).vibrationMs).toBeNull();
    expect(setFeedback(input({ vibrate: false })).drop?.xpText).toBe('+~45 XP');
  });

  it('still celebrates a new record with sound alone', () => {
    const soundOnly = input({ vibrate: false, record: FIVE_REP_MAX, becameRecord: true });
    expect(setFeedback(soundOnly).celebratesRecord).toBe(true);
  });

  it('skips the celebration but keeps the record pulse when every cue is switched off', () => {
    const quiet = setFeedback(input({ vibrate: false, sound: false, record: FIVE_REP_MAX, becameRecord: true }));
    expect(quiet.celebratesRecord).toBe(false);
    expect(quiet.drop?.record).toBe(true);
  });

  it('celebrates only the change that makes the record, not a later edit to a set that already held it', () => {
    expect(setFeedback(input({ wasDone: true, record: FIVE_REP_MAX, becameRecord: false })).celebratesRecord).toBe(
      false,
    );
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

  it('names the exercise so logging set 1 of two exercises in a row reads differently', () => {
    const bench = setFeedback(input({ label: feedbackLabel('Barbell Bench Press', 'set', 1) }));
    const squat = setFeedback(input({ label: feedbackLabel('Barbell Back Squat', 'set', 1) }));
    expect(bench.drop?.announcement).toBe('Barbell Bench Press, set 1 logged, about 45 XP');
    expect(squat.drop?.announcement).toBe('Barbell Back Squat, set 1 logged, about 45 XP');
    expect(feedbackLabel('Rower', 'bout', 2)).toBe('Rower, bout 2');
  });

  it('does no preview or record work while a set is typed into before it is done', () => {
    const typing = input({ isDone: false });
    setFeedback(typing);
    expect(typing.preview).not.toHaveBeenCalled();
    expect(typing.record).not.toHaveBeenCalled();
    expect(typing.becameRecord).not.toHaveBeenCalled();
  });

  it('only checks for a new record when a done set is edited, and only with a cue on', () => {
    const editing = input({ wasDone: true });
    setFeedback(editing);
    expect(editing.preview).not.toHaveBeenCalled();
    expect(editing.record).not.toHaveBeenCalled();
    expect(editing.becameRecord).toHaveBeenCalledOnce();
    const soundOnly = input({ wasDone: true, vibrate: false });
    setFeedback(soundOnly);
    expect(soundOnly.becameRecord).toHaveBeenCalledOnce();
    const silent = input({ wasDone: true, vibrate: false, sound: false });
    setFeedback(silent);
    expect(silent.becameRecord).not.toHaveBeenCalled();
  });
});
