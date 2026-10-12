import { describe, expect, it } from 'vitest';
import {
  enterKeyHintFor,
  fieldAfter,
  shownNumberText,
  steppedFieldValue,
  stepDirectionForKey,
  typedNumberChange,
} from '../../web/src/lib/number-field-rules.ts';

const reps = { lowest: 1, highest: 100, wholeNumber: true };
const weight = { lowest: 0, highest: 2000, wholeNumber: false };

describe('typing into a number field', () => {
  it('commits a readable value that differs from the committed one', () => {
    expect(typedNumberChange('62,5', 60, weight)).toEqual({ commit: 62.5, typed: { text: '62,5', value: 62.5 } });
  });

  it('commits nothing for an unreadable or unchanged value and keeps the text', () => {
    expect(typedNumberChange('', 60, weight)).toEqual({ commit: null, typed: { text: '', value: 60 } });
    expect(typedNumberChange('60.0', 60, weight)).toEqual({ commit: null, typed: { text: '60.0', value: 60 } });
  });

  it('commits the value clamped to the bounds', () => {
    expect(typedNumberChange('0', 5, reps)).toEqual({ commit: 1, typed: { text: '0', value: 1 } });
  });
});

describe('the text a number field shows', () => {
  it('shows the committed value when nothing is typed or the value changed from outside', () => {
    expect(shownNumberText(null, 60)).toEqual({ text: '60', matchesValue: true });
    expect(shownNumberText({ text: '61', value: 61 }, 62.5)).toEqual({ text: '62.5', matchesValue: true });
  });

  it('keeps typed text that reads as the committed value', () => {
    expect(shownNumberText({ text: '62,5', value: 62.5 }, 62.5)).toEqual({ text: '62,5', matchesValue: true });
  });

  it('flags typed text that does not read as the committed value', () => {
    expect(shownNumberText({ text: '', value: 60 }, 60)).toEqual({ text: '', matchesValue: false });
    expect(shownNumberText({ text: '0', value: 1 }, 1)).toEqual({ text: '0', matchesValue: false });
    expect(shownNumberText({ text: '2.6', value: 3 }, 3)).toEqual({ text: '2.6', matchesValue: false });
  });
});

describe('stepping a number field with the arrow keys', () => {
  it('maps ArrowUp and ArrowDown to a step and ignores other keys', () => {
    expect(stepDirectionForKey('ArrowUp')).toBe(1);
    expect(stepDirectionForKey('ArrowDown')).toBe(-1);
    expect(stepDirectionForKey('Enter')).toBeNull();
  });

  it('steps on the grid of the step like the steppers', () => {
    expect(steppedFieldValue(60, 1, 2.5, weight)).toBe(62.5);
    expect(steppedFieldValue(61, -1, 2.5, weight)).toBe(60);
    expect(steppedFieldValue(5, 1, 1, reps)).toBe(6);
  });

  it('stays within the bounds', () => {
    expect(steppedFieldValue(1, -1, 1, reps)).toBe(1);
    expect(steppedFieldValue(100, 1, 1, reps)).toBe(100);
    expect(steppedFieldValue(1999, 1, 2.5, weight)).toBe(2000);
    expect(steppedFieldValue(1, -1, 2.5, weight)).toBe(0);
  });
});

describe('the Enter key of a number field', () => {
  it('offers next until the last field of its group, which offers done', () => {
    expect(enterKeyHintFor(false)).toBe('next');
    expect(enterKeyHintFor(true)).toBe('done');
  });

  it('moves to the field after the current one, or nowhere from the last', () => {
    const fields = ['weight', 'reps', 'seconds'];
    expect(fieldAfter(fields, 'weight')).toBe('reps');
    expect(fieldAfter(fields, 'reps')).toBe('seconds');
    expect(fieldAfter(fields, 'seconds')).toBeNull();
    expect(fieldAfter(fields, 'metres')).toBeNull();
  });
});
