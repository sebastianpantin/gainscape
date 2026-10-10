import { type Locator, type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { nativeDialogsOf, register, uniqueUsername } from './support/app.ts';
import { programEventsOf } from './support/db.ts';
import {
  dayPicker,
  followProgram,
  MADCOW_FIVE_RMS_KG,
  programToday,
  workoutCards,
} from './support/program-enrollment.ts';

const MADCOW = 'Madcow 5x5';
const RPE = 'RPE top set with back-offs';
const SKIP_OFFLINE_TEXT = "You're offline. Skipping a day needs a connection.";

const MADCOW_W1_MONDAY_SQUAT_MARKERS: [string, string][] = [
  ['50%', '10 + 2.5 + 1.25 kg each side'],
  ['62.5%', '15 + 2.5 + 1.25 kg each side'],
  ['75%', '25 kg each side'],
  ['87.5%', '25 + 5 kg each side'],
  ['100%', '25 + 10 + 1.25 kg each side'],
];

function marker(row: Locator, text: string): Locator {
  return row.getByText(text, { exact: true });
}

async function startMadcowMonday(page: Page): Promise<Locator> {
  await register(page, uniqueUsername('pt_mark'));
  await followProgram(page, MADCOW, MADCOW_FIVE_RMS_KG);
  await programToday(page, MADCOW)
    .getByRole('button', { name: `Start: ${MADCOW} — W1 Day 1`, exact: true })
    .click();
  await expect(page.getByText(`${MADCOW} — W1 Day 1`, { exact: true })).toBeVisible();
  return workoutCards(page, 'Back Squat').getByRole('listitem');
}

test('a Madcow W1 Day 1 draft shows each squat set with its percentage and the plates per side', async ({ page }) => {
  const rows = await startMadcowMonday(page);
  await expect(rows).toHaveCount(5);
  for (const [index, [pct, plates]] of MADCOW_W1_MONDAY_SQUAT_MARKERS.entries()) {
    await expect(marker(rows.nth(index), pct), `set ${index + 1} percentage`).toBeVisible();
    await expect(marker(rows.nth(index), plates), `set ${index + 1} plates`).toBeVisible();
    await expect(marker(rows.nth(index), 'adjusted'), `set ${index + 1} not adjusted`).toHaveCount(0);
    await expect(marker(rows.nth(index), 'optional'), `set ${index + 1} not optional`).toHaveCount(0);
  }
});

test('changing a prescribed weight marks the set adjusted and updates its plates', async ({ page }) => {
  const rows = await startMadcowMonday(page);
  const top = rows.nth(4);
  await top.getByRole('spinbutton', { name: 'kg', exact: true }).fill('100');
  await expect(marker(top, 'adjusted')).toBeVisible();
  await expect(marker(top, '25 + 15 kg each side')).toBeVisible();
  await expect(marker(top, '100%')).toBeVisible();
  await expect(marker(rows.nth(3), 'adjusted')).toHaveCount(0);

  await top.getByRole('spinbutton', { name: 'kg', exact: true }).fill('92.5');
  await expect(marker(top, 'adjusted')).toHaveCount(0);
  await expect(marker(top, '25 + 10 + 1.25 kg each side')).toBeVisible();
});

test('the RPE back-off sets of a program draft are marked optional at 95% with their plates', async ({ page }) => {
  await register(page, uniqueUsername('pt_opt'));
  await followProgram(page, RPE, {
    'Squat estimated 1RM (kg)': 200,
    'Bench press estimated 1RM (kg)': 120,
    'Deadlift estimated 1RM (kg)': 240,
  });
  await programToday(page, RPE)
    .getByRole('button', { name: `Start: ${RPE} — W1 Day 1`, exact: true })
    .click();
  await expect(page.getByText(`${RPE} — W1 Day 1`, { exact: true })).toBeVisible();

  const [topCard, backOffCard] = [workoutCards(page, 'Back Squat').nth(0), workoutCards(page, 'Back Squat').nth(1)];
  const topSet = topCard.getByRole('listitem').first();
  await expect(marker(topSet, '86.3%')).toBeVisible();
  await expect(marker(topSet, '3×25 + 1.25 kg each side')).toBeVisible();
  await expect(marker(topSet, 'optional')).toHaveCount(0);

  const backOffs = backOffCard.getByRole('listitem');
  await expect(backOffs).toHaveCount(5);
  for (let index = 0; index < 5; index++) {
    await expect(marker(backOffs.nth(index), '95%')).toBeVisible();
    await expect(marker(backOffs.nth(index), 'optional')).toBeVisible();
    await expect(marker(backOffs.nth(index), '2×25 + 20 + 2.5 kg each side')).toBeVisible();
  }
});

test('skip the suggested day through an in-app confirmation: it leaves the picker and the next day is suggested', async ({
  page,
}) => {
  const username = uniqueUsername('pt_skip');
  await register(page, username);
  const nativeDialogs = nativeDialogsOf(page);
  await followProgram(page, MADCOW, MADCOW_FIVE_RMS_KG);
  const today = programToday(page, MADCOW);
  await expect(dayPicker(today).getByRole('radio', { name: 'W1 Day 1', exact: true })).toBeChecked();

  const skip = today.getByRole('button', { name: 'Skip W1 Day 1', exact: true });
  await skip.click();
  const dialog = page.getByRole('dialog', { name: 'Skip W1 Day 1?', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(dayPicker(today).getByRole('radio', { name: 'W1 Day 1', exact: true })).toBeChecked();
  expect(await programEventsOf(username)).toEqual([]);

  await skip.click();
  await dialog.getByRole('button', { name: 'Skip day', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(dayPicker(today).getByRole('radio')).toHaveCount(2);
  await expect(dayPicker(today).getByRole('radio', { name: 'W1 Day 1', exact: true })).toHaveCount(0);
  await expect(dayPicker(today).getByRole('radio', { name: 'W1 Day 2', exact: true })).toBeChecked();
  await expect(today.getByRole('button', { name: `Start: ${MADCOW} — W1 Day 2`, exact: true })).toBeVisible();
  await expect(today.getByRole('button', { name: 'Skip W1 Day 2', exact: true })).toBeVisible();
  expect(await programEventsOf(username)).toEqual([
    { kind: 'skip_day', payload: { position: { week: 1, day: 'mon' } } },
  ]);
  expect(nativeDialogs).toEqual([]);
});

test('skip a picked day other than the suggested one and keep the suggestion', async ({ page }) => {
  const username = uniqueUsername('pt_skpf');
  await register(page, username);
  await followProgram(page, MADCOW, MADCOW_FIVE_RMS_KG);
  const today = programToday(page, MADCOW);
  await dayPicker(today).getByRole('radio', { name: 'W1 Day 3', exact: true }).click();

  await today.getByRole('button', { name: 'Skip W1 Day 3', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Skip W1 Day 3?', exact: true })
    .getByRole('button', { name: 'Skip day', exact: true })
    .click();
  await expect(dayPicker(today).getByRole('radio', { name: 'W1 Day 3', exact: true })).toHaveCount(0);
  await expect(dayPicker(today).getByRole('radio')).toHaveCount(2);
  await expect(dayPicker(today).getByRole('radio', { name: 'W1 Day 1', exact: true })).toBeChecked();
  expect(await programEventsOf(username)).toEqual([
    { kind: 'skip_day', payload: { position: { week: 1, day: 'fri' } } },
  ]);
});

test('skipping a day offline is disabled with the offline text', async ({ context, page }) => {
  await register(page, uniqueUsername('pt_skoff'));
  await followProgram(page, MADCOW, MADCOW_FIVE_RMS_KG);
  const today = programToday(page, MADCOW);
  const skip = today.getByRole('button', { name: 'Skip W1 Day 1', exact: true });
  await expect(skip).toBeEnabled();

  await context.setOffline(true);
  await expect(today.getByText(SKIP_OFFLINE_TEXT, { exact: true })).toBeVisible();
  await expect(skip).toBeDisabled();
  await expect(today.getByRole('button', { name: `Start: ${MADCOW} — W1 Day 1`, exact: true })).toBeEnabled();

  await context.setOffline(false);
  await expect(today.getByText(SKIP_OFFLINE_TEXT, { exact: true })).toHaveCount(0);
  await expect(skip).toBeEnabled();
});
