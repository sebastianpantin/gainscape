import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestUser, db, type TestUser } from './local-stack.ts';

let owner: TestUser;
let stranger: TestUser;

const currentYear = new Date().getFullYear();

beforeAll(async () => {
  owner = await createTestUser();
  stranger = await createTestUser();
});

afterAll(async () => {
  await db.end();
});

describe('public profile fields', () => {
  it('lets the owner set bio, focus, training since and badge color', async () => {
    const { error } = await owner.client
      .from('profiles')
      .update({ bio: 'Chasing a 200 kg squat.', training_focus: 'strength', training_since: 2019, badge_color: 'blue' })
      .eq('id', owner.id);
    expect(error).toBeNull();
    const [row] =
      await db`select bio, training_focus, training_since, badge_color from public.profiles where id = ${owner.id}`;
    expect(row).toEqual({
      bio: 'Chasing a 200 kg squat.',
      training_focus: 'strength',
      training_since: 2019,
      badge_color: 'blue',
    });
  });

  it('defaults the badge color to gold', async () => {
    const [row] = await db`select badge_color from public.profiles where id = ${stranger.id}`;
    expect(row.badge_color).toBe('gold');
  });

  it.each([
    ['a bio over 80 characters', { bio: 'x'.repeat(81) }],
    ['a bio with a control character', { bio: 'line\nbreak' }],
    ['an unknown training focus', { training_focus: 'cardio' }],
    ['training since a future year', { training_since: currentYear + 1 }],
    ['training since before 1950', { training_since: 1949 }],
  ])('rejects %s', async (_, change) => {
    const { error } = await owner.client.from('profiles').update(change).eq('id', owner.id);
    expect(error).not.toBeNull();
  });

  it("does not change another user's profile", async () => {
    await stranger.client.from('profiles').update({ bio: 'hijacked' }).eq('id', owner.id);
    const [row] = await db`select bio from public.profiles where id = ${owner.id}`;
    expect(row.bio).not.toBe('hijacked');
  });
});

describe('private body fields', () => {
  it('lets the owner set height and birth year', async () => {
    const { error } = await owner.client
      .from('profile_private')
      .update({ height_cm: 181.5, birth_year: 1990 })
      .eq('user_id', owner.id);
    expect(error).toBeNull();
    const { data } = await owner.client.from('profile_private').select('height_cm, birth_year').eq('user_id', owner.id);
    expect(data).toEqual([{ height_cm: 181.5, birth_year: 1990 }]);
  });

  it('hides height and birth year from other users', async () => {
    const { data, error } = await stranger.client
      .from('profile_private')
      .select('height_cm, birth_year')
      .eq('user_id', owner.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it.each([
    ['a height under 100 cm', { height_cm: 99 }],
    ['a height over 250 cm', { height_cm: 251 }],
    ['a birth year less than 13 years ago', { birth_year: currentYear - 12 }],
    ['a birth year before 1900', { birth_year: 1899 }],
  ])('rejects %s', async (_, change) => {
    const { error } = await owner.client.from('profile_private').update(change).eq('user_id', owner.id);
    expect(error).not.toBeNull();
  });

  it('accepts a birth year exactly 13 years ago', async () => {
    const { error } = await owner.client
      .from('profile_private')
      .update({ birth_year: currentYear - 13 })
      .eq('user_id', owner.id);
    expect(error).toBeNull();
  });

  it('does not let clients reset the timezone cooldown directly', async () => {
    const { error } = await owner.client
      .from('profile_private')
      .update({ timezone_changed_at: '2000-01-01T00:00:00Z' })
      .eq('user_id', owner.id);
    expect(error).not.toBeNull();
  });

  it('still does not let clients write the timezone directly', async () => {
    const { error } = await owner.client
      .from('profile_private')
      .update({ timezone: 'Asia/Tokyo' })
      .eq('user_id', owner.id);
    expect(error).not.toBeNull();
  });
});

describe('set_timezone', () => {
  let traveller: TestUser;

  beforeAll(async () => {
    traveller = await createTestUser('Europe/Stockholm');
  });

  it('changes the timezone and records when', async () => {
    const { data, error } = await traveller.client.rpc('set_timezone', { candidate: 'America/New_York' });
    expect(error).toBeNull();
    expect(typeof data).toBe('string');
    const [row] = await db`
      select timezone, timezone_changed_at from public.profile_private where user_id = ${traveller.id}`;
    expect(row.timezone).toBe('America/New_York');
    expect(row.timezone_changed_at).not.toBeNull();
  });

  it('refuses a second change within 7 days and says when the next is allowed', async () => {
    const { error } = await traveller.client.rpc('set_timezone', { candidate: 'Asia/Tokyo' });
    expect(error?.message).toBe('timezone_change_too_soon');
    expect(error?.details).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const [row] = await db`select timezone from public.profile_private where user_id = ${traveller.id}`;
    expect(row.timezone).toBe('America/New_York');
  });

  it('allows a change once 7 days have passed', async () => {
    await db`
      update public.profile_private set timezone_changed_at = now() - interval '8 days'
      where user_id = ${traveller.id}`;
    const { error } = await traveller.client.rpc('set_timezone', { candidate: 'Asia/Tokyo' });
    expect(error).toBeNull();
  });

  it('treats choosing the current timezone as a no-op that keeps the cooldown free', async () => {
    const fresh = await createTestUser('Europe/Stockholm');
    const { error } = await fresh.client.rpc('set_timezone', { candidate: 'Europe/Stockholm' });
    expect(error).toBeNull();
    const [row] = await db`select timezone_changed_at from public.profile_private where user_id = ${fresh.id}`;
    expect(row.timezone_changed_at).toBeNull();
  });

  it.each(['posix/Europe/Stockholm', 'localtime', 'Factory'])('rejects the signup-excluded zone %s', async (zone) => {
    const fresh = await createTestUser();
    const { error } = await fresh.client.rpc('set_timezone', { candidate: zone });
    expect(error?.message).toBe('invalid_timezone');
  });

  it('accepts UTC', async () => {
    const fresh = await createTestUser('Europe/Stockholm');
    const { error } = await fresh.client.rpc('set_timezone', { candidate: 'UTC' });
    expect(error).toBeNull();
  });

  it('rejects an unknown timezone name', async () => {
    const fresh = await createTestUser();
    const { error } = await fresh.client.rpc('set_timezone', { candidate: 'Mars/Olympus_Mons' });
    expect(error?.message).toBe('invalid_timezone');
  });

  it("only ever changes the caller's own timezone", async () => {
    const [before] = await db`select timezone from public.profile_private where user_id = ${owner.id}`;
    const fresh = await createTestUser();
    await fresh.client.rpc('set_timezone', { candidate: 'Pacific/Auckland' });
    const [after] = await db`select timezone from public.profile_private where user_id = ${owner.id}`;
    expect(after.timezone).toBe(before.timezone);
  });
});
