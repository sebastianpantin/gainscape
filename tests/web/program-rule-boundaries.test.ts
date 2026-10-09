import { describe, expect, it } from 'vitest';
import {
  inputKindLabel,
  pctLabel,
  referenceValueProblem,
  shownReference,
} from '../../web/src/lib/program-enroll-rules.ts';

const LABEL = 'Squat 1RM (kg)';
const OUT_OF_RANGE = 'Squat 1RM (kg) must be above 0 and at most 1000';

describe('reference value problems at the boundaries', () => {
  it.each([
    ['0', OUT_OF_RANGE],
    ['-5', OUT_OF_RANGE],
    ['0.01', null],
    ['1000', null],
    ['1000.01', OUT_OF_RANGE],
    ['NaN', OUT_OF_RANGE],
    ['Infinity', OUT_OF_RANGE],
    ['12abc', OUT_OF_RANGE],
    ['', 'Enter Squat 1RM (kg)'],
    ['   ', 'Enter Squat 1RM (kg)'],
    [' 102.5 ', null],
  ])('reads %j as %j', (raw, expected) => {
    expect(referenceValueProblem(LABEL, raw, 'kg')).toBe(expected);
  });

  it.each([
    ['2205', null],
    ['2205.01', 'Squat 1RM (lb) must be above 0 and at most 2205'],
  ])('caps an lb value at 2205, the 1000 kg cap in pounds: %j reads as %j', (raw, expected) => {
    expect(referenceValueProblem('Squat 1RM (lb)', raw, 'lb')).toBe(expected);
  });

  it('asks for a value that was never typed', () => {
    expect(referenceValueProblem(LABEL, undefined, 'kg')).toBe('Enter Squat 1RM (kg)');
  });
});

describe('percentage labels', () => {
  it.each([
    [0, '0%'],
    [0.5, '50%'],
    [0.125, '12.5%'],
    [1, '100%'],
    [1.025, '102.5%'],
    [1 / 3, '33.3%'],
    [0.666666, '66.7%'],
  ])('labels %s as %s', (fraction, expected) => {
    expect(pctLabel(fraction)).toBe(expected);
  });
});

describe('input kind labels', () => {
  it.each([
    ['oneRm', '1RM'],
    ['tm', 'Training max'],
    ['fiveRm', '5RM'],
    ['e1rm', 'Estimated 1RM'],
    ['workingWeight', 'Working weight'],
  ] as const)('labels %s as %s', (kind, expected) => {
    expect(inputKindLabel(kind)).toBe(expected);
  });
});

describe('shown reference values', () => {
  it.each([
    [0, 0],
    [92.6859, 92.69],
    [283.5, 283.5],
    [1000, 1000],
    [999.996, 1000],
  ])('shows %s as %s', (value, expected) => {
    expect(shownReference(value)).toBe(expected);
  });
});
