import { expect, type Locator, type Page } from '@playwright/test';
import { TEST_PASSWORD } from '../../tests/integration/local-stack.ts';
import { createConfirmedAccount } from './db.ts';

export { TEST_PASSWORD } from '../../tests/integration/local-stack.ts';

export const authStorageKey = 'sb-localhost-auth-token';
const draftDatabase = { name: 'gainscape', version: 1, store: 'drafts' };
const fallbackDraftKeyPrefix = 'gainscape.workout-draft.v2.';
const onboardingKeyPrefix = 'gainscape.onboarding.';

interface StoredAuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string };
}

const MAX_USERNAME_LENGTH = 20;

export function uniqueUsername(prefix: string): string {
  const suffix = `_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
  return `${prefix.slice(0, MAX_USERNAME_LENGTH - suffix.length)}${suffix}`;
}

export function definitionOf(scope: Page | Locator, term: string): Locator {
  return scope.getByRole('term').getByText(term, { exact: true }).locator('xpath=following-sibling::dd[1]');
}

export function restTimer(page: Page): Locator {
  return page.getByRole('region', { name: 'Rest timer' });
}

export async function pauseClockNow(page: Page): Promise<void> {
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000);
}

export function nativeDialogsOf(page: Page): string[] {
  const messages: string[] = [];
  page.on('dialog', (dialog) => {
    messages.push(dialog.message());
    void dialog.dismiss();
  });
  return messages;
}

export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function emailOf(username: string): string {
  return `${username}@example.test`;
}

export async function fillRegistration(page: Page, username: string, email = emailOf(username)) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New here? Create an account' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
}

export async function submitRegistration(page: Page, username: string, email = emailOf(username)) {
  await fillRegistration(page, username, email);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
}

export async function skipOnboarding(page: Page, userId: string) {
  await page.evaluate((key) => localStorage.setItem(key, 'done'), `${onboardingKeyPrefix}${userId}`);
}

export async function registerWithoutSigningIn(page: Page, username: string): Promise<string> {
  await page.goto('/');
  const timezone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  return createConfirmedAccount(emailOf(username), username, timezone);
}

export async function register(page: Page, username: string) {
  await skipOnboarding(page, await registerWithoutSigningIn(page, username));
  await submitSignIn(page, emailOf(username));
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
}

export async function submitSignIn(page: Page, email: string, accountPassword = TEST_PASSWORD) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(accountPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

export async function signIn(page: Page, username: string, accountPassword = TEST_PASSWORD) {
  await submitSignIn(page, emailOf(username), accountPassword);
  await expect(page.getByRole('link', { name: 'Train', exact: true })).toBeVisible();
}

export type Tab = 'Train' | 'Skills' | 'Log' | 'Friends' | 'Profile';

export async function openTab(page: Page, tab: Tab) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: tab, exact: true }).click();
}

export async function openFromProfile(page: Page, name: 'Programs' | 'Exercises' | 'Settings') {
  await openTab(page, 'Profile');
  await page.getByRole('main').getByRole('link', { name, exact: true }).click();
}

export async function signOut(page: Page) {
  await openFromProfile(page, 'Settings');
  await page.getByRole('button', { name: 'Sign out' }).click();
}

export function exerciseCard(page: Page, exerciseName: string): Locator {
  return page.locator('section', { has: page.getByRole('heading', { name: exerciseName, exact: true }) });
}

export function setRow(scope: Page | Locator, setNumber: number): Locator {
  return scope.getByRole('listitem', { name: `Set ${setNumber}`, exact: true });
}

export async function openSetOptions(row: Locator, setNumber: number): Promise<void> {
  await row.getByRole('button', { name: `Set ${setNumber} options`, exact: true }).click();
  await expect(row.getByRole('group', { name: `Set ${setNumber} options`, exact: true })).toBeVisible();
}

export function warmupBadge(row: Locator): Locator {
  return row.getByRole('img', { name: 'Warm-up', exact: true });
}

export function setRows(scope: Page | Locator): Locator {
  return scope.getByRole('listitem', { name: /^Set \d+$/ });
}

export function boutRow(scope: Page | Locator, boutNumber: number): Locator {
  return scope.getByRole('listitem', { name: `Bout ${boutNumber}`, exact: true });
}

export function exactRepMaxes(card: Locator): Locator {
  return card
    .getByRole('list', { name: 'Rep maxes', exact: true })
    .getByRole('listitem', { name: /^\d+RM (?!empty$)(?!.*, beaten by a higher-rep set$)/ });
}

export function doneSetButtons(scope: Page | Locator): Locator {
  return scope.getByRole('button', { name: /^Done set \d+$/, pressed: true });
}

export async function pickExercise(page: Page, search: string, exerciseName: string): Promise<Locator> {
  await page.getByLabel('Search exercises').fill(search);
  await page.getByRole('button', { name: new RegExp(`^${exerciseName}\\b`) }).click();
  return exerciseCard(page, exerciseName);
}

export async function addExercise(page: Page, search: string, exerciseName: string): Promise<Locator> {
  const card = await pickExercise(page, search, exerciseName);
  await expect(page.getByRole('heading', { name: exerciseName, exact: true }).first()).toBeVisible();
  return card;
}

export async function chooseFromMenu(page: Page, exerciseName: string, action: string) {
  await page.getByLabel(`Exercise menu for ${exerciseName}`, { exact: true }).click();
  await page.getByRole('button', { name: action, exact: true }).click();
}

export async function logExercise(
  page: Page,
  search: string,
  exerciseName: string,
  sets: { weightKg?: number; reps: number }[],
) {
  const card = await pickExercise(page, search, exerciseName);
  for (let index = 1; index < sets.length; index++) await card.getByRole('button', { name: '+ Add set' }).click();
  for (const [index, set] of sets.entries()) {
    const row = setRow(card, index + 1);
    if (set.weightKg !== undefined) await row.getByRole('spinbutton', { name: /kg/ }).fill(String(set.weightKg));
    await row.getByLabel('reps', { exact: true }).fill(String(set.reps));
    await row.getByRole('radio', { name: 'Hard' }).click();
  }
}

export async function finishWorkout(page: Page) {
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
}

export async function logWorkout(page: Page, logSets: () => Promise<void>) {
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logSets();
  await finishWorkout(page);
}

export async function logBench(page: Page, weightKg = 60) {
  await logWorkout(page, () => logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg, reps: 5 }]));
}

export async function openLatestWorkout(page: Page) {
  await openTab(page, 'Log');
  await page.getByRole('navigation', { name: 'Collection' }).getByRole('link', { name: 'History' }).click();
  await page.getByRole('list', { name: 'Workouts' }).getByRole('link').first().click();
  await expect(page.getByRole('status', { name: 'Workout XP' })).toBeVisible();
}

export function xpValue(text: string | null): number {
  return Number((text ?? '').replace(/[^0-9]/g, ''));
}

type CardioBout =
  | { minutes: number; distance?: number; effort: string }
  | { rounds: number; workS: number; restS: number; effort: string };

export async function logCardio(page: Page, search: string, activityName: string, bouts: CardioBout[]) {
  const card = await pickExercise(page, search, activityName);
  for (let index = 1; index < bouts.length; index++) await card.getByRole('button', { name: '+ Add bout' }).click();
  for (const [index, bout] of bouts.entries()) {
    const row = boutRow(card, index + 1);
    if ('minutes' in bout) {
      await row.getByRole('radio', { name: 'Steady' }).click();
      await row.getByLabel('min', { exact: true }).fill(String(bout.minutes));
      if (bout.distance !== undefined) await row.getByLabel(/^(km|mi)$/).fill(String(bout.distance));
    } else {
      await row.getByRole('radio', { name: 'Intervals' }).click();
      await row.getByLabel('rounds').fill(String(bout.rounds));
      await row.getByLabel('work s').fill(String(bout.workS));
      await row.getByLabel('rest s').fill(String(bout.restS));
    }
    await row.getByRole('radio', { name: bout.effort, exact: true }).click();
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

interface StoredDraftRecord {
  v: number;
  kind: 'draft' | 'synced';
  userId: string;
  updatedAt: number;
  draft?: { sessionId: string; finishedAt: string | null };
  syncedSessionId?: string;
}

export function finishedBenchDraft(sessionId: string, exerciseId: string) {
  const finishedAt = new Date();
  return {
    sessionId,
    startedAt: new Date(finishedAt.getTime() - 30 * 60 * 1000).toISOString(),
    finishedAt: finishedAt.toISOString(),
    programDayId: null,
    programLabel: null,
    exercises: [
      {
        exerciseId,
        name: 'Barbell Bench Press',
        loadType: 'external',
        target: null,
        sets: [
          { id: crypto.randomUUID(), weightKg: 60, reps: 5, effort: { type: 'level', level: 'hard' }, done: true },
        ],
      },
    ],
  };
}

export async function writeStoredDraft(page: Page, userId: string, draft: object): Promise<void> {
  const record = { v: 3, kind: 'draft', userId, updatedAt: Date.now(), draft };
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
