import { describe, expect, it } from 'vitest';
import { minutesUntil, retryAfterSeconds, tryAgainIn } from '../../web/src/lib/rate-limit.ts';
import {
  collectionPercent,
  type FeedItem,
  feedCursor,
  feedText,
  type HiscoreRow,
  rankHiscores,
  relativeTime,
  sendRequestText,
  socialErrorMessage,
} from '../../web/src/lib/social-rules.ts';

function item(type: FeedItem['type'], payload: Record<string, unknown>): FeedItem {
  return {
    eventId: 'event-1',
    userId: 'user-1',
    username: 'mira',
    displayName: 'Mira',
    badgeColor: 'gold',
    type,
    occurredAt: '2026-09-30T10:00:00.000Z',
    payload,
    gzCount: 0,
    gzGiven: false,
    isOwn: false,
  };
}

const bench = { exerciseName: 'Barbell Bench Press', loadType: 'external', kind: 'rep_max', reps: 5 };
const dip = { exerciseName: 'Weighted Dip', loadType: 'bodyweight_plus', kind: 'rep_max', reps: 5 };

describe('feedText', () => {
  it('writes rep-max PRs in kg and lb', () => {
    const pr = item('pr', { ...bench, loadKg: 80, weightsHidden: false });
    expect(feedText(pr, 'kg')).toEqual({ headline: 'New 5RM Barbell Bench Press: 80 kg' });
    expect(feedText(pr, 'lb')).toEqual({ headline: 'New 5RM Barbell Bench Press: 176.4 lb' });
  });

  it('says who hid the weights', () => {
    expect(feedText(item('pr', { ...bench, weightsHidden: true }), 'kg')).toEqual({
      headline: 'New 5RM Barbell Bench Press',
      detail: 'Weights hidden by mira',
    });
  });

  it('writes bodyweight-plus PRs with and without the total', () => {
    expect(feedText(item('pr', { ...dip, loadKg: 20, totalLoadKg: 100, weightsHidden: false }), 'kg').headline).toBe(
      'New 5RM Weighted Dip: +20 kg (100 kg total)',
    );
    expect(feedText(item('pr', { ...dip, loadKg: 20, weightsHidden: false }), 'kg').headline).toBe(
      'New 5RM Weighted Dip: +20 kg',
    );
    expect(feedText(item('pr', { ...dip, loadKg: 20, totalLoadKg: 100, weightsHidden: false }), 'lb').headline).toBe(
      'New 5RM Weighted Dip: +44.1 lb (220.5 lb total)',
    );
  });

  it('writes bodyweight rep records in reps', () => {
    const pullUp = { exerciseName: 'Pull-up', loadType: 'bodyweight', kind: 'bodyweight_reps', reps: 15 };
    expect(feedText(item('pr', { ...pullUp, weightsHidden: true }), 'kg').headline).toBe('New Pull-up record: 15 reps');
    expect(feedText(item('pr', { ...pullUp, weightsHidden: false }), 'lb').headline).toBe(
      'New Pull-up record: 15 reps',
    );
  });

  it('writes level events', () => {
    expect(feedText(item('level_up', { skillName: 'Legs', from: 69, to: 70 }), 'kg').headline).toBe(
      'Reached level 70 Legs',
    );
    expect(feedText(item('level_99', { skillName: 'Legs', from: 98, to: 99 }), 'lb').headline).toBe(
      'Reached level 99 Legs!',
    );
  });

  it('writes drops with their rarity', () => {
    expect(feedText(item('drop', { itemName: 'Titan gloves', rarity: 'rare' }), 'kg')).toEqual({
      headline: 'Found Titan gloves',
      detail: 'Rare drop',
    });
  });
});

describe('rankHiscores', () => {
  const skills = [
    { key: 'chest', combatWeight: 2 },
    { key: 'legs', combatWeight: 2 },
    { key: 'core', combatWeight: 1 },
  ];
  const row = (username: string, skillXp: Record<string, number>, filled = 0, total = 0): HiscoreRow => ({
    userId: username,
    username,
    displayName: username,
    badgeColor: 'gold',
    isSelf: false,
    skillXp,
    collectionFilled: filled,
    collectionTotal: total,
  });

  it('breaks level ties by XP, then by username', () => {
    const ranked = rankHiscores(
      [row('cara', { legs: 1300 }), row('abe', { legs: 1200 }), row('bea', { legs: 1200 }), row('dan', { legs: 0 })],
      skills,
      'legs',
    );
    expect(ranked.map((entry) => entry.row.username)).toEqual(['cara', 'abe', 'bea', 'dan']);
    expect(ranked[0].value).toBe(ranked[1].value);
  });

  it('computes total and combat from the domain', () => {
    const [top] = rankHiscores([row('abe', { chest: 1154, legs: 1154, core: 0 })], skills, 'total');
    expect(top.value).toBe(10 + 10 + 1);
    const [combat] = rankHiscores([row('abe', { chest: 0, legs: 0, core: 0 })], skills, 'combat');
    expect(combat.value).toBe(3);
  });

  it('ranks collection percent and treats an empty collection as 0', () => {
    const ranked = rankHiscores([row('abe', {}, 0, 0), row('bea', {}, 5, 20)], skills, 'collection');
    expect(ranked.map((entry) => [entry.row.username, entry.value])).toEqual([
      ['bea', 25],
      ['abe', 0],
    ]);
    expect(collectionPercent(0, 0)).toBe(0);
  });
});

describe('social helpers', () => {
  it('builds the next feed cursor from the last item', () => {
    expect(feedCursor(item('pr', {}))).toEqual({ beforeAt: '2026-09-30T10:00:00.000Z', beforeId: 'event-1' });
  });

  it('describes request outcomes without revealing declines', () => {
    expect(sendRequestText('sent', 'bea')).toBe('Request sent to bea');
    expect(sendRequestText('already_pending', 'bea')).toBe('Request sent to bea');
    expect(sendRequestText('accepted', 'bea')).toBe('You and bea are now friends');
    expect(sendRequestText('not_found', 'bea')).toBe('No one with that username.');
    expect(sendRequestText('self', 'bea')).toBe("That's you.");
    expect(sendRequestText('limit_reached', 'bea')).toBe('Friend limit reached.');
  });

  it('maps RPC errors to messages', () => {
    expect(socialErrorMessage({ message: 'rate_limited' })).toBe('Slow down a little and try again.');
    expect(socialErrorMessage({ message: 'event_not_found' })).toBe('That post is no longer visible.');
    expect(socialErrorMessage({ message: 'request_not_found' })).toBe('That request is gone.');
    expect(socialErrorMessage({ message: 'boom' })).toBe('Something went wrong. Try again.');
  });

  it('shows relative times', () => {
    const now = Date.parse('2026-09-30T12:00:00.000Z');
    expect(relativeTime('2026-09-30T11:59:30.000Z', now)).toBe('just now');
    expect(relativeTime('2026-09-30T11:30:00.000Z', now)).toBe('30 min');
    expect(relativeTime('2026-09-30T10:00:00.000Z', now)).toBe('2 h');
    expect(relativeTime('2026-09-29T10:00:00.000Z', now)).toBe('yesterday');
    expect(relativeTime('2026-09-26T12:00:00.000Z', now)).toBe('4 days');
  });

  it('reads Retry-After details and rounds minutes up', () => {
    expect(retryAfterSeconds({ bucket: 'x', retryAfterSeconds: 90 })).toBe(90);
    expect(retryAfterSeconds('{"bucket":"x","retryAfterSeconds":30}')).toBe(30);
    expect(retryAfterSeconds(undefined)).toBe(null);
    expect(minutesUntil(90)).toBe(2);
    expect(minutesUntil(5)).toBe(1);
    expect(tryAgainIn(90)).toBe('Try again in 2 min.');
    expect(tryAgainIn(null)).toBe('Try again in a few minutes.');
  });
});
