import { describe, expect, it } from 'vitest';
import { toastDurationMs } from '../../web/src/lib/ui/toast-rules.ts';

describe('toastDurationMs', () => {
  it('shows a short message for five seconds', () => {
    expect(toastDurationMs('Saved')).toBe(5000);
  });

  it('gives longer messages more reading time, up to a cap', () => {
    expect(toastDurationMs('x'.repeat(60))).toBe(6000);
    expect(toastDurationMs('x'.repeat(400))).toBe(9000);
  });

  it('keeps a toast with an action up for at least twelve seconds so it can be reached', () => {
    expect(toastDurationMs('Removed set 2 of Barbell Bench Press.', true)).toBe(12000);
    expect(toastDurationMs('Saved', false)).toBe(5000);
  });
});
