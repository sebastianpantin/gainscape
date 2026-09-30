import { expect, type Page } from '@playwright/test';

export const password = 'correct-horse-battery';

const authStorageKey = 'sb-localhost-auth-token';
const draftDatabase = { name: 'gainscape', version: 1, store: 'drafts' };
const fallbackDraftKeyPrefix = 'gainscape.workout-draft.v2.';

export interface StoredAuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string };
}

export async function register(page: Page, username: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(`${username}@example.test`);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
}

export async function signIn(page: Page, username: string) {
  await page.getByLabel('Email').fill(`${username}@example.test`);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

export async function logExercise(
  page: Page,
  search: string,
  exerciseName: string,
  sets: { weightKg?: number; reps: number }[],
) {
  await page.getByLabel('Search exercises').fill(search);
  await page.getByRole('button', { name: new RegExp(`^${exerciseName}\\b`) }).click();
  const card = page.locator('section', { has: page.getByRole('heading', { name: exerciseName, exact: true }) });
  for (let index = 1; index < sets.length; index++) await card.getByRole('button', { name: '+ Add set' }).click();
  const rows = card.locator('li.set-row');
  for (const [index, set] of sets.entries()) {
    const row = rows.nth(index);
    if (set.weightKg !== undefined) await row.getByLabel(/kg/).fill(String(set.weightKg));
    await row.getByLabel('reps').fill(String(set.reps));
    await row.getByRole('radio', { name: 'Hard' }).click();
  }
}

export async function readSession(page: Page): Promise<StoredAuthSession> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), authStorageKey);
  if (!raw) throw new Error('No stored auth session');
  return JSON.parse(raw);
}

export async function writeSession(page: Page, changes: Partial<StoredAuthSession>): Promise<void> {
  const session = { ...(await readSession(page)), ...changes };
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [authStorageKey, JSON.stringify(session)]);
}

export interface StoredDraftRecord {
  v: 2;
  kind: 'draft' | 'synced';
  userId: string;
  updatedAt: number;
  draft?: { sessionId: string; finishedAt: string | null };
  syncedSessionId?: string;
}

export async function writeStoredDraft(page: Page, userId: string, draft: object): Promise<void> {
  const record = { v: 2, kind: 'draft', userId, updatedAt: Date.now(), draft };
  await page.evaluate(
    ({ database, record }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(database.name, database.version);
        request.onupgradeneeded = () => request.result.createObjectStore(database.store, { keyPath: 'userId' });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction(database.store, 'readwrite');
          transaction.objectStore(database.store).put(record);
          transaction.oncomplete = () => {
            request.result.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    { database: draftDatabase, record },
  );
}

export async function readStoredDraft(page: Page, userId: string): Promise<StoredDraftRecord | null> {
  return page.evaluate(
    ({ database, userId }) =>
      new Promise<StoredDraftRecord | null>((resolve, reject) => {
        const request = indexedDB.open(database.name, database.version);
        request.onupgradeneeded = () => request.result.createObjectStore(database.store, { keyPath: 'userId' });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const read = request.result.transaction(database.store, 'readonly').objectStore(database.store).get(userId);
          read.onsuccess = () => {
            request.result.close();
            resolve(read.result ?? null);
          };
          read.onerror = () => reject(read.error);
        };
      }),
    { database: draftDatabase, userId },
  );
}

export async function readFallbackDraft(page: Page, userId: string): Promise<StoredDraftRecord | null> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), `${fallbackDraftKeyPrefix}${userId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function breakIndexedDbOpen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (localStorage.getItem('e2e.break-indexeddb') !== '1') return;
    IDBFactory.prototype.open = () => {
      throw new DOMException('IndexedDB is disabled for this test', 'SecurityError');
    };
  });
}

export async function setIndexedDbBroken(page: Page, broken: boolean): Promise<void> {
  await page.evaluate((value) => {
    if (value) localStorage.setItem('e2e.break-indexeddb', '1');
    else localStorage.removeItem('e2e.break-indexeddb');
  }, broken);
}

export async function muteDraftBroadcasts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const NativeBroadcastChannel = window.BroadcastChannel;
    window.BroadcastChannel = class extends NativeBroadcastChannel {
      constructor(name: string) {
        super(name === 'gainscape.drafts' ? `e2e.muted.${name}` : name);
      }
    };
  });
}
