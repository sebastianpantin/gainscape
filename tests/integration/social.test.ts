import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { webCollectionCounts } from './collection-support.ts';
import { aSet, HOUR_MS, payloadAt, postSession } from './loot-support.ts';
import { admin, anon, builtInExerciseId, createTestUser, db, seedRateLimitHits, type TestUser } from './local-stack.ts';

let benchId: string;

beforeAll(async () => {
  benchId = await builtInExerciseId('barbell_bench_press');
});

afterAll(async () => {
  await db.end();
});

async function listFriends(user: TestUser) {
  const { data, error } = await user.client.rpc('list_friends');
  expect(error).toBeNull();
  return (data as { user_id: string; relation: string }[]).map(({ user_id, relation }) => ({ user_id, relation }));
}

describe('send_friend_request', () => {
  it('answers not_found for an unknown username', async () => {
    const user = await createTestUser();
    const { data, error } = await user.client.rpc('send_friend_request', { username: 'nobody_by_this_name' });
    expect(error).toBeNull();
    expect(data).toEqual({ status: 'not_found' });
  });

  it('turns the rate limit into HTTP 429', async () => {
    const [user, target] = await Promise.all([createTestUser(), createTestUser()]);
    await seedRateLimitHits('friend_request_minute', user.id, 30);
    const { error, status } = await user.client.rpc('send_friend_request', { username: target.username });
    expect(status).toBe(429);
    expect(error?.message).toBe('rate_limited');
    const details = JSON.parse(error!.details);
    expect(details.bucket).toBe('friend_request_minute');
    expect(details.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(details.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('runs a full request, accept, list and remove cycle', async () => {
    const [alice, bob] = await Promise.all([createTestUser(), createTestUser()]);
    const sent = await alice.client.rpc('send_friend_request', { username: bob.username });
    expect(sent.data).toEqual({
      status: 'sent',
      friend: { userId: bob.id, username: bob.username, displayName: bob.username, badgeColor: 'gold' },
    });
    expect(await listFriends(bob)).toEqual([{ user_id: alice.id, relation: 'incoming' }]);

    const accepted = await bob.client.rpc('respond_friend_request', { requester_id: alice.id, accept: true });
    expect(accepted.error).toBeNull();
    expect(accepted.data).toMatchObject({ status: 'accepted', friend: { userId: alice.id } });
    expect(await listFriends(alice)).toEqual([{ user_id: bob.id, relation: 'friend' }]);
    expect(await listFriends(bob)).toEqual([{ user_id: alice.id, relation: 'friend' }]);

    const removed = await alice.client.rpc('remove_friend', { other_id: bob.id });
    expect(removed.error).toBeNull();
    expect(await listFriends(alice)).toEqual([]);
    expect(await listFriends(bob)).toEqual([]);
  });

  it('keeps a declined request looking pending to the requester', async () => {
    const [alice, bob] = await Promise.all([createTestUser(), createTestUser()]);
    await alice.client.rpc('send_friend_request', { username: bob.username });
    const declined = await bob.client.rpc('respond_friend_request', { requester_id: alice.id, accept: false });
    expect(declined.data).toMatchObject({ status: 'declined' });
    const again = await alice.client.rpc('send_friend_request', { username: bob.username });
    expect(again.data).toEqual({ status: 'already_pending' });
    expect(await listFriends(alice)).toEqual([{ user_id: bob.id, relation: 'outgoing' }]);
    expect(await listFriends(bob)).toEqual([]);
  });
});

describe('get_profile', () => {
  it("shows a friend's real skill XP and collection counts", async () => {
    const [viewer, friend] = await Promise.all([createTestUser(), createTestUser()]);
    await viewer.client.rpc('send_friend_request', { username: friend.username });
    await friend.client.rpc('respond_friend_request', { requester_id: viewer.id, accept: true });
    await postSession(friend, payloadAt(new Date(Date.now() - HOUR_MS), [aSet(benchId, 0, 60)]));

    const { data, error } = await viewer.client.rpc('get_profile', { target: friend.id });
    expect(error).toBeNull();
    const skills = await db`
      select s.key, coalesce(u.xp, 0)::int as xp
      from public.skills s left join public.user_skills u on u.skill_id = s.id and u.user_id = ${friend.id}`;
    expect(data.skillXp).toEqual(Object.fromEntries(skills.map((row) => [row.key, row.xp])));
    expect(data.skillXp.chest).toBeGreaterThan(0);
    expect(data.collection).toEqual(await webCollectionCounts(friend.id));
    expect(data.relation).toBe('friend');

    const stranger = await createTestUser();
    const hidden = await stranger.client.rpc('get_profile', { target: friend.id });
    expect(hidden.error).toBeNull();
    expect(hidden.data).toBeNull();
  });
});

describe('username_available', () => {
  it('limits each signed-in caller on their own', async () => {
    const user = await createTestUser();
    await seedRateLimitHits('username_check_minute', user.id, 120);
    const limited = await user.client.rpc('username_available', { candidate: 'free_name_here' });
    expect(limited.status).toBe(429);
    expect(limited.error?.message).toBe('rate_limited');

    const other = await createTestUser();
    const fine = await other.client.rpc('username_available', { candidate: 'free_name_here' });
    expect(fine.error).toBeNull();
    const anonymous = await anon.rpc('username_available', { candidate: 'free_name_here' });
    expect(anonymous.error).toBeNull();
  });
});

describe('unconfirmed usernames', () => {
  async function unconfirmedUser(username: string, ageHours: number): Promise<string> {
    const created = await admin.auth.admin.createUser({
      email: `${username}@example.test`,
      password: 'correct-horse-battery',
      email_confirm: false,
      user_metadata: { username, timezone: 'UTC' },
    });
    if (created.error) throw created.error;
    await db`
      update auth.users set email_confirmed_at = null, created_at = now() - make_interval(hours => ${ageHours})
      where id = ${created.data.user.id}`;
    return created.data.user.id;
  }

  function freshName(): string {
    return `u_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  }

  it('holds the username of a recent unconfirmed signup', async () => {
    const username = freshName();
    await unconfirmedUser(username, 1);
    expect((await anon.rpc('username_available', { candidate: username })).data).toBe(false);
    const second = await admin.auth.admin.createUser({
      email: `${username}.second@example.test`,
      password: 'another-password-here',
      email_confirm: true,
      user_metadata: { username, timezone: 'UTC' },
    });
    expect(second.error).not.toBeNull();
  });

  it('releases the username of an unconfirmed signup older than a day', async () => {
    const username = freshName();
    const staleId = await unconfirmedUser(username, 25);
    expect((await anon.rpc('username_available', { candidate: username })).data).toBe(true);
    const claimed = await admin.auth.admin.createUser({
      email: `${username}.owner@example.test`,
      password: 'another-password-here',
      email_confirm: true,
      user_metadata: { username, timezone: 'UTC' },
    });
    expect(claimed.error).toBeNull();
    const [stale] = await db`select count(*)::int as count from auth.users where id = ${staleId}`;
    expect(stale.count).toBe(0);
    const [profile] = await db`select id from public.profiles where username = ${username}`;
    expect(profile.id).toBe(claimed.data.user!.id);
  });

  it('cleans up a stale holder when someone looks the name up', async () => {
    const username = freshName();
    const staleId = await unconfirmedUser(username, 25);
    const seeker = await createTestUser();
    const { data } = await seeker.client.rpc('send_friend_request', { username });
    expect(data).toEqual({ status: 'not_found' });
    const [stale] = await db`select count(*)::int as count from auth.users where id = ${staleId}`;
    expect(stale.count).toBe(0);
  });
});
