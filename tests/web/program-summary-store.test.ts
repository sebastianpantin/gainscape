import { describe, expect, it } from 'vitest';
import { dismissSummary, isSummaryDismissed } from '../../web/src/lib/programs/program-summary-store.ts';
import { MemoryStorage } from './memory-storage.ts';

const USER = 'user-a';
const OTHER_USER = 'user-b';
const CYCLE_1 = 'enrollment-531:C1 W4';
const CYCLE_2 = 'enrollment-531:C2 W4';

class BrokenStorage extends MemoryStorage {
  getItem(): string | null {
    throw new Error('storage unavailable');
  }

  setItem(): void {
    throw new Error('storage unavailable');
  }
}

describe('summary dismissal on this device', () => {
  it('shows a summary nobody dismissed', () => {
    expect(isSummaryDismissed(new MemoryStorage(), USER, CYCLE_1)).toBe(false);
  });

  it('remembers a dismissed summary', () => {
    const storage = new MemoryStorage();
    dismissSummary(storage, USER, CYCLE_1);
    expect(isSummaryDismissed(storage, USER, CYCLE_1)).toBe(true);
  });

  it('still shows the summary of a later rollover after an earlier one was dismissed', () => {
    const storage = new MemoryStorage();
    dismissSummary(storage, USER, CYCLE_1);
    expect(isSummaryDismissed(storage, USER, CYCLE_2)).toBe(false);
  });

  it('keeps earlier dismissals when another summary is dismissed', () => {
    const storage = new MemoryStorage();
    dismissSummary(storage, USER, CYCLE_1);
    dismissSummary(storage, USER, CYCLE_2);
    expect(isSummaryDismissed(storage, USER, CYCLE_1)).toBe(true);
  });

  it("keeps one user's dismissals apart from another user's on the same device", () => {
    const storage = new MemoryStorage();
    dismissSummary(storage, USER, CYCLE_1);
    expect(isSummaryDismissed(storage, OTHER_USER, CYCLE_1)).toBe(false);
  });

  it('shows the summary when the stored dismissals are not valid JSON', () => {
    const storage = new MemoryStorage();
    dismissSummary(storage, USER, CYCLE_1);
    for (let index = 0; index < storage.length; index += 1) storage.setItem(storage.key(index)!, '{not json');
    expect(isSummaryDismissed(storage, USER, CYCLE_1)).toBe(false);
  });

  it('shows the summary and does not throw when storage is unavailable', () => {
    expect(() => dismissSummary(null, USER, CYCLE_1)).not.toThrow();
    expect(isSummaryDismissed(null, USER, CYCLE_1)).toBe(false);
  });

  it('shows the summary and does not throw when storage throws', () => {
    const storage = new BrokenStorage();
    expect(() => dismissSummary(storage, USER, CYCLE_1)).not.toThrow();
    expect(isSummaryDismissed(storage, USER, CYCLE_1)).toBe(false);
  });
});
