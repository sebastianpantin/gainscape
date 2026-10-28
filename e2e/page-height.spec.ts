import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { logBench, openFromProfile, openTab, register, uniqueUsername } from './support/app.ts';

const QUESTS_MAX_HEIGHT_PX = 4150;
const WHATS_NEW_MAX_HEIGHT_PX = 6400;

test.use({ viewport: { width: 412, height: 915 } });

function pageHeight(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollHeight);
}

test('Quests keeps locked and completed quests folded, so the page stays within half its old height', async ({
  page,
}) => {
  await register(page, uniqueUsername('ph_quests'));
  await logBench(page);
  await openTab(page, 'Skills');
  await page.getByRole('link', { name: 'Quests', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Available', exact: true })).toBeVisible();

  expect(await pageHeight(page)).toBeLessThanOrEqual(QUESTS_MAX_HEIGHT_PX);
  await expect(page.getByRole('main').locator('.button.primary')).toHaveCount(1);
});

test("What's new folds releases older than the latest two, so the page stays within half its old height", async ({
  page,
}) => {
  await register(page, uniqueUsername('ph_news'));
  await openFromProfile(page, 'Settings');
  await page.getByRole('main').getByRole('link', { name: "What's new", exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: "What's new" })).toBeVisible();

  expect(await pageHeight(page)).toBeLessThanOrEqual(WHATS_NEW_MAX_HEIGHT_PX);
});
