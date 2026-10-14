import { describe, expect, it } from 'vitest';
import {
  minutesUntil,
  rateLimitedMessage,
  retryAfterSeconds,
  withFriendlyRateLimit,
  tryAgainIn,
  waitText,
} from '../../web/src/lib/platform/rate-limit.ts';
import {
  type FeedItem,
  feedBadge,
  feedBadgeKind,
  feedCursor,
  feedText,
  type HiscoreRow,
  rankHiscores,
  recentFriendActivity,
  relativeTime,
  requestedUsername,
  sendRequestText,
  skillMetric,
  socialErrorMessage,
} from '../../web/src/lib/social/social-rules.ts';

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

const run = {
  exerciseName: 'Running',
  kind: 'cardio',
  paceUnit: 'per_km',
  recordKinds: 'distance,pace,duration',
  countedWorkS: 2160,
  previousCountedWorkS: 1800,
};

describe('feedText for cardio records', () => {
  it('writes every record kind of a bout in the viewer units', () => {
    const pr = item('pr', { ...run, distanceM: 6000, paceSPerKm: 300, weightsHidden: false });
    expect(feedText(pr, 'kg')).toEqual({ headline: 'New Running record: 6 km · 5:00 /km · 36 min' });
    expect(feedText(pr, 'lb')).toEqual({ headline: 'New Running record: 3.73 mi · 8:03 /mi · 36 min' });
  });

  it('writes only the kinds the bout set', () => {
    const pr = item('pr', { ...run, recordKinds: 'duration', distanceM: null, paceSPerKm: null, weightsHidden: false });
    expect(feedText(pr, 'kg')).toEqual({ headline: 'New Running record: 36 min' });
  });

  it('writes pool distances in metres or yards', () => {
    const swim = item('pr', {
      ...run,
      exerciseName: 'Swimming',
      paceUnit: 'per_100m',
      recordKinds: 'distance',
      distanceM: 1500,
      weightsHidden: false,
    });
    expect(feedText(swim, 'kg').headline).toBe('New Swimming record: 1500 m');
    expect(feedText(swim, 'lb').headline).toBe('New Swimming record: 1640 yd');
  });

  it('writes a carry record in metres for every unit setting', () => {
    const carry = item('pr', {
      exerciseName: 'Farmers Carry',
      kind: 'cardio',
      paceUnit: null,
      recordKinds: 'distance',
      distanceM: 40,
      previousDistanceM: 30,
      weightsHidden: false,
    });
    expect(feedText(carry, 'kg').headline).toBe('New Farmers Carry record: 40 m');
    expect(feedText(carry, 'lb').headline).toBe('New Farmers Carry record: 40 m');
  });

  it('writes a hold record as a duration', () => {
    const hang = item('pr', {
      exerciseName: 'Dead Hang',
      kind: 'cardio',
      paceUnit: null,
      recordKinds: 'duration',
      countedWorkS: 45,
      weightsHidden: false,
    });
    expect(feedText(hang, 'lb').headline).toBe('New Dead Hang record: 45 s');
  });

  it('says who hid the distance and keeps the duration', () => {
    expect(feedText(item('pr', { ...run, weightsHidden: true }), 'kg')).toEqual({
      headline: 'New Running record: 36 min',
      detail: 'Distance hidden by mira',
    });
  });
});

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

  it('does not claim hidden weights when the record details are missing', () => {
    expect(feedText(item('pr', {}), 'kg')).toEqual({ headline: 'New exercise record' });
    expect(feedText(item('pr', { ...bench, weightsHidden: false }), 'kg')).toEqual({
      headline: 'New 5RM Barbell Bench Press',
    });
  });

  it('copes with missing fields', () => {
    expect(feedText(item('pr', { weightsHidden: false }), 'kg').headline).toBe('New exercise record');
    expect(feedText(item('level_up', {}), 'kg').headline).toBe('Levelled up a skill');
    expect(feedText(item('level_99', { to: 99 }), 'kg').headline).toBe('Reached level 99!');
    expect(feedText(item('drop', {}), 'kg')).toEqual({ headline: 'Found an item' });
    expect(feedBadge(item('drop', {}))).toBe('DROP');
    expect(feedBadge(item('level_up', {}))).toBe('LVL');
  });

  it('labels badges', () => {
    expect(feedBadge(item('pr', {}))).toBe('PR');
    expect(feedBadge(item('drop', { rarity: 'legendary' }))).toBe('LEG');
    expect(feedBadge(item('drop', { rarity: 'rare' }))).toBe('RARE');
    expect(feedBadge(item('level_up', { to: 70 }))).toBe('70');
    expect(feedBadge(item('level_99', { to: 99 }))).toBe('99');
  });

  it('writes drops with their rarity', () => {
    expect(feedText(item('drop', { itemName: 'Titan gloves', rarity: 'rare' }), 'kg')).toEqual({
      headline: 'Found Titan gloves',
      detail: 'Rare drop',
    });
  });
});

describe('feedText for quests', () => {
  const quest = { questId: 'quest-1', questKey: 'x_marks_the_squat', questName: 'X Marks the Squat' };

  it('names the completed quest and the levels its XP reached', () => {
    const levelUps = [
      { skill: 'legs', skillName: 'Legs', from: 14, to: 15 },
      { skill: 'core', skillName: 'Core', from: 4, to: 5 },
    ];
    expect(feedText(item('quest', { ...quest, questPoints: 1, levelUps }), 'kg')).toEqual({
      headline: 'Completed the quest X Marks the Squat',
      detail: 'Reached level 15 Legs and level 5 Core',
    });
  });

  it('has no detail when the quest XP reached no new level', () => {
    expect(feedText(item('quest', { ...quest, questPoints: 1, levelUps: [] }), 'kg')).toEqual({
      headline: 'Completed the quest X Marks the Squat',
    });
  });

  it('copes with a missing name and malformed level ups', () => {
    expect(feedText(item('quest', { levelUps: [{ skillName: 'Legs' }, 'x'] }), 'kg')).toEqual({
      headline: 'Completed a quest',
    });
  });

  it('labels the quest badge', () => {
    expect(feedBadge(item('quest', quest))).toBe('QP');
    expect(feedBadgeKind({ type: 'quest' })).toBe('quest');
  });
});

describe('feedBadgeKind', () => {
  it('groups both level events under one badge style', () => {
    expect(feedBadgeKind({ type: 'level_up' })).toBe('level');
    expect(feedBadgeKind({ type: 'level_99' })).toBe('level');
    expect(feedBadgeKind({ type: 'pr' })).toBe('pr');
    expect(feedBadgeKind({ type: 'drop' })).toBe('drop');
  });
});

describe('recentFriendActivity', () => {
  const entry = (eventId: string, isOwn = false): FeedItem => ({ ...item('pr', bench), eventId, isOwn });

  it("keeps the newest friends' events, skipping your own and repeats", () => {
    const feed = [entry('a'), entry('own', true), entry('b'), entry('a'), entry('c'), entry('d')];
    expect(recentFriendActivity(feed, 3).map((event) => event.eventId)).toEqual(['a', 'b', 'c']);
  });

  it('is empty without friend events', () => {
    expect(recentFriendActivity([entry('own', true)], 3)).toEqual([]);
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
      [row('cara', { legs: 1250 }), row('abe', { legs: 1200 }), row('bea', { legs: 1200 }), row('dan', { legs: 0 })],
      skills,
      skillMetric('legs'),
    );
    expect(ranked.map((entry) => entry.row.username)).toEqual(['cara', 'abe', 'bea', 'dan']);
    expect(ranked[0].value).toBe(ranked[1].value);
  });

  it('computes total and combat from the domain', () => {
    const [top] = rankHiscores([row('abe', { chest: 980, legs: 980, core: 0 })], skills, 'total');
    expect(top.value).toBe(10 + 10 + 1);
    const [combat] = rankHiscores([row('abe', { chest: 0, legs: 0, core: 0 })], skills, 'combat');
    expect(combat.value).toBe(3);
  });

  it('breaks combat ties by the XP of combat skills only', () => {
    const withCardio = [...skills, { key: 'endurance', combatWeight: 0 }];
    const ranked = rankHiscores(
      [row('abe', { chest: 100, endurance: 50_000 }), row('bea', { chest: 200 })],
      withCardio,
      'combat',
    );
    expect(ranked[0].value).toBe(ranked[1].value);
    expect(ranked.map((entry) => entry.row.username)).toEqual(['bea', 'abe']);
  });

  it('still breaks total ties by the XP of every skill', () => {
    const withCardio = [...skills, { key: 'endurance', combatWeight: 0 }];
    const ranked = rankHiscores(
      [row('bea', { chest: 200 }), row('abe', { chest: 100, endurance: 150 })],
      withCardio,
      'total',
    );
    expect(ranked[0].value).toBe(ranked[1].value);
    expect(ranked.map((entry) => entry.row.username)).toEqual(['abe', 'bea']);
  });

  it('breaks collection percent ties by the exact ratio, then by filled slots', () => {
    const ranked = rankHiscores(
      [row('abe', {}, 99, 200), row('bea', {}, 50, 100), row('cid', {}, 10, 20)],
      skills,
      'collection',
    );
    expect(ranked.map((entry) => entry.value)).toEqual([50, 50, 50]);
    expect(ranked.map((entry) => entry.row.username)).toEqual(['bea', 'cid', 'abe']);
  });

  it('ranks collection percent and treats an empty collection as 0', () => {
    const ranked = rankHiscores([row('abe', {}, 0, 0), row('bea', {}, 5, 20)], skills, 'collection');
    expect(ranked.map((entry) => [entry.row.username, entry.value])).toEqual([
      ['bea', 25],
      ['abe', 0],
    ]);
  });
});

describe('social helpers', () => {
  it('builds the next feed cursor from the last item', () => {
    expect(feedCursor(item('pr', {}))).toEqual({ beforeAt: '2026-09-30T10:00:00.000Z', beforeId: 'event-1' });
  });

  it('reads a typed username without padding, case or a leading @', () => {
    expect(requestedUsername('  @Iron_Otter ')).toBe('iron_otter');
    expect(requestedUsername('iron@otter')).toBe('iron@otter');
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
    expect(tryAgainIn(90 * 60)).toBe('Try again in 90 min.');
    expect(tryAgainIn(3 * 3600)).toBe('Try again in 3 hours.');
    expect(waitText(91 * 60)).toBe('2 hours');
  });
});

describe('rateLimitedMessage', () => {
  it('turns a database rate limit into a wait message', () => {
    expect(rateLimitedMessage({ code: 'PT429', details: '{"bucket":"craft_minute","retryAfterSeconds":40}' })).toBe(
      'Too many changes in a short time. Try again in 1 min.',
    );
  });

  it('ignores every other error', () => {
    expect(rateLimitedMessage({ code: '23505', details: null })).toBeNull();
    expect(rateLimitedMessage(new Error('Failed to fetch'))).toBeNull();
    expect(rateLimitedMessage(null)).toBeNull();
  });
});

describe('withFriendlyRateLimit', () => {
  it('replaces a database rate limit with the wait message and keeps other errors as they are', () => {
    const limited = withFriendlyRateLimit({
      code: 'PT429',
      message: 'rate_limited',
      details: '{"retryAfterSeconds":7200}',
    });
    expect(limited.message).toBe('Too many changes in a short time. Try again in 2 hours.');
    const other = { code: '42501', message: 'permission denied' };
    expect(withFriendlyRateLimit(other)).toBe(other);
  });
});
