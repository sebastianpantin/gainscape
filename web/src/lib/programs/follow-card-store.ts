import { keyedStore } from '../platform/keyed-store.ts';

const followCardDismissal = keyedStore<boolean>('gainscape.follow-card.', (raw) => JSON.parse(raw ?? 'false') === true);

export function isFollowCardDismissed(storage: Storage | null, userId: string): boolean {
  return followCardDismissal.read(storage, userId);
}

export function dismissFollowCard(storage: Storage | null, userId: string): void {
  followCardDismissal.save(storage, userId, true);
}

export const { forget: forgetFollowCardDismissal } = followCardDismissal;
