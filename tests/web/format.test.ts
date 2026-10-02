import { describe, expect, it } from 'vitest';
import { formatLoad } from '../../web/src/lib/format.ts';

describe('formatLoad', () => {
  it('shows an external load in the chosen unit, kilograms by default', () => {
    expect(formatLoad(100, 'external')).toBe('100 kg');
    expect(formatLoad(100, 'external', 'lb')).toBe('220.5 lb');
  });

  it('marks added weight on bodyweight exercises with a plus', () => {
    expect(formatLoad(20, 'bodyweight_plus', 'kg')).toBe('+20 kg');
    expect(formatLoad(20, 'bodyweight_plus', 'lb')).toBe('+44.1 lb');
  });

  it('shows a bodyweight load as a plain weight', () => {
    expect(formatLoad(0, 'bodyweight', 'kg')).toBe('0 kg');
  });
});
