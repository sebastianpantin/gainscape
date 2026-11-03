import { describe, expect, it } from 'vitest';
import {
  addToast,
  MAX_SHOWN_TOASTS,
  type ShownToast,
  toastDurationMs,
  toastsAfterLeaving,
} from '../../web/src/lib/ui/toast-rules.ts';

function toast(id: number, withAction: boolean): ShownToast {
  return {
    id,
    text: `Toast ${id}`,
    action: withAction ? { label: 'Undo', onAct: () => undefined } : null,
    raisedFromKeyboard: false,
  };
}

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

  it('never times out an action toast raised from the keyboard, so Undo stays reachable by tabbing', () => {
    expect(toastDurationMs('Removed set 2 of Barbell Bench Press.', true, true)).toBeNull();
    expect(toastDurationMs('Saved', false, true)).toBe(5000);
  });
});

describe('addToast', () => {
  it('keeps an earlier Undo when another toast follows', () => {
    expect(addToast([toast(1, true)], toast(2, true)).map((shown) => shown.id)).toEqual([1, 2]);
  });

  it('replaces an earlier plain message, which has nothing left to act on', () => {
    expect(addToast([toast(1, false), toast(2, true)], toast(3, false)).map((shown) => shown.id)).toEqual([2, 3]);
  });

  it(`shows at most ${MAX_SHOWN_TOASTS}, dropping the oldest`, () => {
    const shown = Array.from({ length: MAX_SHOWN_TOASTS }, (_, index) => toast(index + 1, true));
    const next = addToast(shown, toast(MAX_SHOWN_TOASTS + 1, true));
    expect(next).toHaveLength(MAX_SHOWN_TOASTS);
    expect(next[0].id).toBe(2);
    expect(next.at(-1)?.id).toBe(MAX_SHOWN_TOASTS + 1);
  });
});

describe('toastsAfterLeaving', () => {
  it('drops toasts whose action belongs to the screen left behind and keeps plain messages', () => {
    const plain = toast(1, false);
    expect(toastsAfterLeaving([plain, toast(2, true)])).toEqual([plain]);
  });

  it('keeps the same list when nothing changes', () => {
    const shown = [toast(1, false)];
    expect(toastsAfterLeaving(shown)).toBe(shown);
  });
});
