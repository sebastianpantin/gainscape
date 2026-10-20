import { type Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.ts';
import { finishWorkout, logCardio, logExercise, register, uniqueUsername } from '../support/app.ts';
import { authStorageKey } from '../../web/src/lib/platform/auth-restore.ts';
import { localStackStatus } from '../../scripts/local-stack.ts';

const VIOLATION_PREFIX = 'csp-violation:';
const pagesSessionKey = authStorageKey(localStackStatus().API_URL);

async function collectViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.startsWith(VIOLATION_PREFIX) || /Content Security Policy/i.test(text)) violations.push(text.slice(0, 200));
  });
  await page.addInitScript((prefix) => {
    document.addEventListener('securitypolicyviolation', (event) =>
      console.log(`${prefix} ${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}`),
    );
  }, VIOLATION_PREFIX);
  return violations;
}

test('the Pages build runs a whole workout without a single CSP violation', async ({ page }) => {
  const violations = await collectViolations(page);
  await register(page, uniqueUsername('csp'), pagesSessionKey);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', 'Barbell Bench Press', [{ weightKg: 60, reps: 5 }]);
  await logCardio(page, 'running', 'Running', [{ minutes: 30, distance: 5, effort: 'Moderate' }]);
  await finishWorkout(page);
  await page.goto('/skills');
  await expect(page.getByRole('heading', { level: 1, name: 'Skills' })).toBeVisible();
  expect(violations).toEqual([]);
});

test('the Pages headers protect the app shell and cache only hashed assets', async ({ request }) => {
  const shell = await request.get('/');
  expect(shell.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(shell.headers()['x-content-type-options']).toBe('nosniff');
  expect(shell.headers()['cache-control']).toBe('no-cache');
  expect((await request.get('/sw.js')).headers()['cache-control']).toBe('no-cache');
  const html = await shell.text();
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(html)![1];
  expect((await request.get(script)).headers()['cache-control']).toBe('public, max-age=31536000, immutable');
});

test('a deep link loads the app and no agent docs are published', async ({ request }) => {
  const deepLink = await request.get('/collection/history');
  expect(deepLink.status()).toBe(200);
  expect(await deepLink.text()).toContain('<div id="root">');
  expect(await (await request.get('/AGENTS.md')).text()).not.toContain('# ');
});
