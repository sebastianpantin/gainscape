import { expect, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db } from '../../tests/integration/local-stack.ts';
import { emailOf, openTab, register, uniqueUsername } from './app.ts';
import { createConfirmedAccount } from './db.ts';

export async function befriend(username: string, otherUsername: string): Promise<void> {
  await db`
    insert into public.friendships (requester_id, addressee_id, status, responded_at)
    select a.id, b.id, 'accepted', now()
    from public.profiles a, public.profiles b
    where a.username = ${username} and b.username = ${otherUsername}`;
}

export async function friendshipStatus(username: string, otherUsername: string): Promise<string | null> {
  const [row] = await db`
    select f.status::text as status
    from public.friendships f
    join public.profiles a on a.id = f.requester_id
    join public.profiles b on b.id = f.addressee_id
    where (a.username = ${username} and b.username = ${otherUsername})
       or (a.username = ${otherUsername} and b.username = ${username})`;
  return row?.status ?? null;
}

export async function showsBodyweight(username: string): Promise<boolean> {
  const [row] = await db`select show_bodyweight from public.profiles where username = ${username}`;
  return row.show_bodyweight;
}

export function levelUpHeadline(level: number): string {
  return `Reached level ${level} Chest`;
}

export async function seedChestLevelUps(username: string, levels: number[]): Promise<void> {
  await db.begin(async (tx) => {
    const [profile] = await tx`select id from public.profiles where username = ${username}`;
    const sessionId = randomUUID();
    const startedAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await tx`
      insert into public.sessions
        (id, user_id, started_at, ended_at, local_date, timezone, balance_version, derived_balance_version, summary)
      values (${sessionId}, ${profile.id}, ${startedAt}, ${startedAt}, current_date, 'UTC', 1, 1, '{}')`;
    for (const level of levels) {
      const occurredAt = new Date(startedAt.getTime() + level * 60 * 1000);
      await tx`
        insert into public.events (user_id, session_id, event_key, type, occurred_at, payload)
        values (${profile.id}, ${sessionId}, ${`level:chest-${level}`}, 'level_up', ${occurredAt},
                ${tx.json({ skill: 'chest', from: level - 1, to: level })})`;
    }
  });
}

export async function registerWithFriend(page: Page, prefix: string): Promise<{ aliceName: string; bobName: string }> {
  const aliceName = uniqueUsername(`${prefix}_a`);
  const bobName = uniqueUsername(`${prefix}_b`);
  await createConfirmedAccount(emailOf(bobName), bobName, 'UTC');
  await register(page, aliceName);
  await befriend(aliceName, bobName);
  return { aliceName, bobName };
}

export async function openFriendProfile(page: Page, friendName: string): Promise<void> {
  await openTab(page, 'Friends');
  await page
    .getByRole('list', { name: 'Friends list' })
    .getByRole('link', { name: new RegExp(friendName) })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: friendName, exact: true })).toBeVisible();
}

export function friendsAlert(page: Page): Locator {
  return page.getByRole('main').getByRole('alert');
}
