import { expect, type Locator, type Page } from '@playwright/test';
import { exerciseCard, openFromProfile, openTab } from './app.ts';

export const MADCOW_FIVE_RMS_KG: Readonly<Record<string, number>> = {
  'Squat 5RM (kg)': 100,
  'Bench press 5RM (kg)': 80,
  'Barbell row 5RM (kg)': 70,
  'Incline or military press 5RM (kg)': 50,
  'Deadlift 5RM (kg)': 140,
};

export const FIVE_THREE_ONE_ONE_RMS_KG: Readonly<Record<string, number>> = {
  'Squat 1RM (kg)': 100,
  'Bench press 1RM (kg)': 80,
  'Deadlift 1RM (kg)': 140,
  'Overhead press 1RM (kg)': 50,
};

export function powerliftingPrograms(page: Page): Locator {
  return page.getByRole('region', { name: 'Powerlifting programs', exact: true });
}

export function programToday(page: Page, programName: string): Locator {
  return page.getByRole('region', { name: programName, exact: true });
}

export async function openProgramToday(page: Page, programName: string): Promise<Locator> {
  await page.reload();
  await openTab(page, 'Train');
  const today = programToday(page, programName);
  await expect(today).toBeVisible();
  return today;
}

export function prescribedRows(scope: Locator, title: string): Locator {
  return scope.getByRole('list', { name: title, exact: true }).getByRole('listitem');
}

export function dayPicker(scope: Locator): Locator {
  return scope.getByRole('radiogroup', { name: 'Day', exact: true });
}

export function workoutCards(page: Page, exerciseName: string): Locator {
  return exerciseCard(page, exerciseName);
}

export async function fieldValues(fields: Locator): Promise<string[]> {
  return fields.evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement).value));
}

export async function weightsIn(card: Locator): Promise<string[]> {
  return fieldValues(card.getByRole('spinbutton', { name: /^Weight in kg, set \d+$/ }));
}

export async function repsIn(card: Locator): Promise<string[]> {
  return fieldValues(card.getByRole('spinbutton', { name: /^Reps, set \d+$/ }));
}

export async function openManageProgram(page: Page, programName: string): Promise<void> {
  await programToday(page, programName).getByRole('link', { name: 'Manage program', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: programName, exact: true })).toBeVisible();
}

export function cycleSummary(page: Page, cycle: number): Locator {
  return page.getByRole('region', { name: `Cycle ${cycle} complete`, exact: true });
}

export async function openEnrollForm(page: Page, programName: string): Promise<void> {
  await openFromProfile(page, 'Programs');
  const follow = powerliftingPrograms(page).getByRole('link', { name: `Follow ${programName}`, exact: true });
  await expect(follow).toBeVisible();
  await follow.click();
  await expect(page.getByRole('heading', { level: 1, name: `Follow ${programName}`, exact: true })).toBeVisible();
}

export async function fillProgramInputs(page: Page, inputs: Readonly<Record<string, number>>): Promise<void> {
  for (const [label, value] of Object.entries(inputs))
    await page.getByLabel(label, { exact: true }).fill(String(value));
}

export async function startFollowing(page: Page, programName: string): Promise<void> {
  await page.getByRole('button', { name: 'Start following', exact: true }).click();
  await expect(programToday(page, programName)).toBeVisible();
}

export async function followProgram(
  page: Page,
  programName: string,
  inputs: Readonly<Record<string, number>>,
): Promise<void> {
  await openEnrollForm(page, programName);
  await fillProgramInputs(page, inputs);
  await startFollowing(page, programName);
}

export async function markEverySetDone(page: Page): Promise<void> {
  const doneButtons = page.getByRole('main').getByRole('button', { name: /^Done set \d+$/ });
  const count = await doneButtons.count();
  for (let index = 0; index < count; index++) {
    const button = doneButtons.nth(index);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
}

export async function openExerciseChoices(page: Page): Promise<void> {
  const choices = page.getByText('Change exercises', { exact: true });
  const disclosure = page.locator('details').filter({ has: choices });
  if (!(await disclosure.evaluate((details) => (details as HTMLDetailsElement).open))) await choices.click();
}

export async function bindExercise(page: Page, liftName: string, exerciseName: string): Promise<void> {
  await openExerciseChoices(page);
  await page.getByLabel(`${liftName} exercise`, { exact: true }).selectOption({ label: exerciseName });
}

export function repeated(row: string, count: number): string[] {
  return Array.from({ length: count }, () => row);
}

export function ownProgram(page: Page, programName: string): Locator {
  return page.getByRole('region', { name: 'Your programs' }).getByRole('listitem').filter({ hasText: programName });
}

async function addPlannedExercise(page: Page, search: string, exerciseName: string): Promise<Locator> {
  const day = page.getByRole('region', { name: 'Day 1', exact: true });
  await day.getByLabel('Search exercises').fill(search);
  await day.getByRole('button', { name: new RegExp(`^${exerciseName}\\b`) }).click();
  return day
    .getByRole('list')
    .first()
    .getByRole('listitem')
    .filter({ has: page.getByText(exerciseName, { exact: true }) });
}

export async function createSquatAndBenchProgram(page: Page, programName: string): Promise<void> {
  await openFromProfile(page, 'Programs');
  await page.getByRole('button', { name: 'New program' }).click();
  await page.getByLabel('Program name').fill(programName);
  const squat = await addPlannedExercise(page, 'Back Squat', 'Back Squat');
  await squat.getByLabel('Sets').fill('5');
  await squat.getByLabel('Reps min').fill('5');
  await squat
    .getByRole('radiogroup', { name: 'Back Squat progression' })
    .getByRole('radio', { name: 'Add weight' })
    .click();
  await squat
    .getByRole('radiogroup', { name: 'Back Squat increment' })
    .getByRole('radio', { name: '2.5 kg', exact: true })
    .click();
  await squat.getByLabel('Reps', { exact: true }).fill('5');
  const bench = await addPlannedExercise(page, 'Bench Press', 'Barbell Bench Press');
  await bench.getByLabel('Sets').fill('3');
  await bench.getByLabel('Reps min').fill('8');
  await bench.getByLabel('Reps max').fill('8');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(ownProgram(page, programName)).toBeVisible();
}

export async function openOwnProgramFollowForm(page: Page, programName: string): Promise<void> {
  await openFromProfile(page, 'Programs');
  await ownProgram(page, programName).getByRole('button', { name: 'Follow', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Follow ${programName}`, exact: true })).toBeVisible();
}
