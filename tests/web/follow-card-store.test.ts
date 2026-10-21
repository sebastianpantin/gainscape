import { describe, expect, it } from 'vitest';
import { dismissFollowCard, isFollowCardDismissed } from '../../web/src/lib/programs/follow-card-store.ts';
import { MemoryStorage } from './memory-storage.ts';

const USER = 'user-a';
const OTHER_USER = 'user-b';

class BrokenStorage extends MemoryStorage {
  getItem(): string | null {
    throw new Error('storage unavailable');
  }

  setItem(): void {
    throw new Error('storage unavailable');
  }
}

describe('follow a program card dismissal on this device', () => {
  it('is not dismissed until you dismiss it', () => {
    expect(isFollowCardDismissed(new MemoryStorage(), USER)).toBe(false);
  });

  it('remembers the dismissal', () => {
    const storage = new MemoryStorage();
    dismissFollowCard(storage, USER);
    expect(isFollowCardDismissed(storage, USER)).toBe(true);
  });

  it("keeps one user's dismissal apart from another user's on the same device", () => {
    const storage = new MemoryStorage();
    dismissFollowCard(storage, USER);
    expect(isFollowCardDismissed(storage, OTHER_USER)).toBe(false);
  });

  it('shows the card when the stored value is not valid JSON', () => {
    const storage = new MemoryStorage();
    dismissFollowCard(storage, USER);
    for (let index = 0; index < storage.length; index += 1) storage.setItem(storage.key(index)!, '{not json');
    expect(isFollowCardDismissed(storage, USER)).toBe(false);
  });

  it('shows the card and does not throw when storage is unavailable or throws', () => {
    expect(() => dismissFollowCard(null, USER)).not.toThrow();
    expect(isFollowCardDismissed(null, USER)).toBe(false);
    const broken = new BrokenStorage();
    expect(() => dismissFollowCard(broken, USER)).not.toThrow();
    expect(isFollowCardDismissed(broken, USER)).toBe(false);
  });
});
