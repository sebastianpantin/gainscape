import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  exerciseCard,
  nativeDialogsOf,
  openFromProfile,
  openTab,
  readSession,
  readStoredDraft,
  register,
  setRow,
  uniqueUsername,
} from './support/app.ts';
import { programCount, programPlanOf, sessionRow, setCount } from './support/db.ts';
import { ownProgram } from './support/program-enrollment.ts';

function day(page: Page, position: number) {
  return page.getByRole('region', { name: `Day ${position}`, exact: true });
}

function plannedExercises(page: Page, position: number) {
  return day(page, position).getByRole('list').first().getByRole('listitem');
}

function plannedExercise(page: Page, position: number, name: string) {
  return plannedExercises(page, position).filter({ has: page.getByText(name, { exact: true }) });
}

async function planLines(username: string, programName: string) {
  const plan = await programPlanOf(username, programName);
  return plan.map(
    (row) => `${row.day_name} ${row.exercise_key} ${row.target_sets}×${row.target_reps_min}-${row.target_reps_max}`,
  );
}

async function copyTemplate(page: Page, templateName: string) {
  await openFromProfile(page, 'Programs');
  await page
    .getByRole('listitem')
    .filter({ hasText: templateName })
    .getByRole('button', { name: 'Use this template' })
    .click();
  await expect(page.getByRole('heading', { name: 'Edit program' })).toBeVisible();
}

test('create a program from scratch, add Squat 5×5, save, it lists under Your programs', async ({ page }) => {
  const username = uniqueUsername('pn');
  await register(page, username);
  await openFromProfile(page, 'Programs');
  await expect(page.getByText('Create a program or copy a template.')).toBeVisible();
  await page.getByRole('button', { name: 'New program' }).click();

  await expect(page.getByRole('heading', { name: 'New program' })).toBeVisible();
  await expect(day(page, 1).getByLabel('Day name')).toHaveValue('Day 1');
  await expect(plannedExercises(page, 1)).toHaveCount(0);
  await page.getByLabel('Program name').fill('Squat Focus');
  await day(page, 1).getByLabel('Search exercises').fill('Back Squat');
  await day(page, 1)
    .getByRole('button', { name: /^Back Squat\b/ })
    .click();
  const squat = plannedExercise(page, 1, 'Back Squat');
  await squat.getByLabel('Sets').fill('5');
  await squat.getByLabel('Reps min').fill('5');
  await squat.getByLabel('Reps max').fill('5');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page).toHaveURL(/\/programs$/);
  await expect(ownProgram(page, 'Squat Focus')).toContainText('Day 1');
  await expect.poll(() => planLines(username, 'Squat Focus')).toEqual(['Day 1 back_squat 5×5-5']);
});

test('the exercise picker offers lifts but no holds, since a program plans sets of reps', async ({ page }) => {
  await register(page, uniqueUsername('ph'));
  await openFromProfile(page, 'Programs');
  await page.getByRole('button', { name: 'New program' }).click();
  const search = day(page, 1).getByLabel('Search exercises');
  await search.fill('Back Squat');
  await expect(day(page, 1).getByRole('button', { name: /^Back Squat\b/ })).toBeVisible();
  await search.fill('Dead Hang');
  await expect(day(page, 1).getByRole('button', { name: /^Dead Hang\b/ })).toHaveCount(0);
  await search.fill('Farmers Carry');
  await expect(day(page, 1).getByRole('button', { name: /^Farmers Carry\b/ })).toHaveCount(0);
});

test('set Squat to add 2.5 kg after each workout, save, reopen and keep it', async ({ page }) => {
  const username = uniqueUsername('pp');
  await register(page, username);
  await copyTemplate(page, 'Full Body 2x');
  const squat = plannedExercise(page, 1, 'Back Squat');
  const progression = squat.getByRole('radiogroup', { name: 'Back Squat progression' });

  await expect(progression.getByRole('radio', { name: 'Last weight' })).toHaveAttribute('aria-checked', 'true');
  await expect(
    plannedExercise(page, 2, 'Hanging Leg Raise').getByRole('radiogroup', { name: /progression$/ }),
  ).toHaveCount(0);
  await squat.getByLabel('Reps min').fill('5');
  await progression.getByRole('radio', { name: 'Add weight' }).click();
  const increment = squat.getByRole('radiogroup', { name: 'Back Squat increment' });
  await expect(increment.getByRole('radio')).toHaveText(['1.25 kg', '2.5 kg', '5 kg']);
  await increment.getByRole('radio', { name: '5 kg', exact: true }).click();
  await expect(squat.getByLabel('Increment (kg)')).toHaveValue('5');
  await squat.getByLabel('Increment (kg)').fill('2.5');
  await expect(increment.getByRole('radio', { name: '2.5 kg', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(squat.getByLabel('Reps min')).toHaveCount(0);
  await expect(squat.getByLabel('Reps', { exact: true })).toHaveValue('5');
  await squat.getByLabel('Sets').fill('5');
  await page.getByLabel('Program name').fill('FB Linear');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(ownProgram(page, 'FB Linear')).toBeVisible();
  await expect
    .poll(async () => (await programPlanOf(username, 'FB Linear')).find((row) => row.exercise_key === 'back_squat'))
    .toMatchObject({
      target_sets: 5,
      target_reps_min: 5,
      target_reps_max: 5,
      progression: 'linear',
      increment_kg: 2.5,
      increment_lb: 5,
    });

  await ownProgram(page, 'FB Linear').getByRole('link', { name: 'Edit' }).click();
  const reopened = plannedExercise(page, 1, 'Back Squat');
  await expect(
    reopened.getByRole('radiogroup', { name: 'Back Squat progression' }).getByRole('radio', { name: 'Add weight' }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    reopened
      .getByRole('radiogroup', { name: 'Back Squat increment' })
      .getByRole('radio', { name: '2.5 kg', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(reopened.getByLabel('Increment (kg)')).toHaveValue('2.5');
  await expect(reopened.getByLabel('Reps', { exact: true })).toHaveValue('5');
});

test('a fixed weight keeps the rep range and says when the weight is set', async ({ page }) => {
  const username = uniqueUsername('pr');
  await register(page, username);
  await copyTemplate(page, 'Full Body 2x');
  const squat = plannedExercise(page, 1, 'Back Squat');
  await squat
    .getByRole('radiogroup', { name: 'Back Squat progression' })
    .getByRole('radio', { name: 'Fixed weight' })
    .click();
  await expect(squat.getByText('You set the weight when you follow this program.')).toBeVisible();
  await expect(squat.getByLabel('Reps max')).toHaveValue('8');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/programs$/);
  await expect
    .poll(async () => (await programPlanOf(username, 'Full Body 2x')).find((row) => row.exercise_key === 'back_squat'))
    .toMatchObject({ target_reps_min: 5, target_reps_max: 8, progression: 'fixed', increment_kg: null });
});

test('add, rename, reorder and remove days and exercises, then edit the saved program again', async ({ page }) => {
  const username = uniqueUsername('pe');
  await register(page, username);
  await copyTemplate(page, 'Full Body 2x');

  await page.getByLabel('Program name').fill('My FB');
  await page.getByRole('button', { name: '+ Add day' }).click();
  await expect(day(page, 3).getByLabel('Day name')).toHaveValue('Day 3');
  await day(page, 3).getByLabel('Day name').fill('Day C');
  await day(page, 3).getByLabel('Search exercises').fill('Deadlift');
  await day(page, 3)
    .getByRole('button', { name: /^Deadlift\b/ })
    .click();
  const addedDeadlift = plannedExercise(page, 3, 'Deadlift');
  await addedDeadlift.getByLabel('Sets').fill('5');
  await addedDeadlift.getByLabel('Reps min').fill('3');
  await addedDeadlift.getByLabel('Reps max').fill('5');

  await day(page, 3).getByRole('button', { name: 'Up', exact: true }).click();
  await expect(day(page, 2).getByLabel('Day name')).toHaveValue('Day C');
  await day(page, 1).getByRole('button', { name: 'Remove day', exact: true }).click();
  await expect(day(page, 3)).toHaveCount(0);
  await expect(day(page, 1).getByRole('button', { name: 'Up', exact: true })).toBeDisabled();
  await expect(day(page, 2).getByRole('button', { name: 'Down', exact: true })).toBeDisabled();

  await day(page, 2).getByRole('button', { name: 'Move Pull-up up' }).click();
  await day(page, 2).getByRole('button', { name: 'Remove Hanging Leg Raise' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(ownProgram(page, 'My FB')).toContainText('Day C · Day B');
  await expect
    .poll(() => planLines(username, 'My FB'))
    .toEqual([
      'Day C deadlift 5×3-5',
      'Day B deadlift 3×3-6',
      'Day B pull_up 3×5-10',
      'Day B overhead_press 3×6-10',
      'Day B leg_press 3×10-15',
    ]);

  await ownProgram(page, 'My FB').getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByLabel('Program name')).toHaveValue('My FB');
  await expect(day(page, 1).getByLabel('Day name')).toHaveValue('Day C');
  await expect(plannedExercise(page, 1, 'Deadlift').getByLabel('Sets')).toHaveValue('5');
  await expect(plannedExercises(page, 2)).toHaveCount(4);

  await page.getByLabel('Program name').fill('My FB 2');
  await day(page, 2).getByRole('button', { name: 'Up', exact: true }).click();
  await expect(day(page, 2).getByLabel('Day name')).toHaveValue('Day C');
  await plannedExercise(page, 2, 'Deadlift').getByLabel('Reps max').fill('8');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(ownProgram(page, 'My FB 2')).toContainText('Day B · Day C');
  await expect.poll(() => programCount(username)).toBe(1);
  await expect
    .poll(() => planLines(username, 'My FB 2'))
    .toEqual([
      'Day B deadlift 3×3-6',
      'Day B pull_up 3×5-10',
      'Day B overhead_press 3×6-10',
      'Day B leg_press 3×10-15',
      'Day C deadlift 5×3-8',
    ]);

  await openTab(page, 'Train');
  await expect(page.getByRole('button', { name: /^My FB 2 — / })).toHaveText([/My FB 2 — Day B/, /My FB 2 — Day C/]);
});

test('delete a program through the confirmation and keep the workout logged from it', async ({ page }) => {
  const username = uniqueUsername('pd');
  await register(page, username);
  const { user } = await readSession(page);
  await copyTemplate(page, 'Upper / Lower');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(ownProgram(page, 'Upper / Lower')).toBeVisible();

  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Upper / Lower — Upper' }).click();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  const nothingTicked = page.getByRole('dialog', { name: '18 planned sets not done' });
  await expect(nothingTicked.getByRole('button', { name: 'Mark done and finish' })).toBeVisible();
  await expect(nothingTicked.getByRole('button', { name: 'Finish without them' })).toHaveCount(0);
  await nothingTicked.getByRole('button', { name: 'Cancel' }).click();
  await expect(nothingTicked).toHaveCount(0);
  await setRow(exerciseCard(page, 'Barbell Bench Press'), 1).getByRole('radio', { name: 'Hard' }).click();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page
    .getByRole('dialog', { name: '17 planned sets not done' })
    .getByRole('button', { name: 'Mark done and finish' })
    .click();
  await expect(page.getByRole('heading', { name: 'Workout complete!' })).toBeVisible();
  const sessionId = (await readStoredDraft(page, user.id))!.syncedSessionId!;
  await expect.poll(async () => (await sessionRow(sessionId)).program_day_id).not.toBeNull();
  await expect.poll(() => setCount(sessionId)).toBe(18);

  await openFromProfile(page, 'Programs');
  const nativeDialogs = nativeDialogsOf(page);
  await ownProgram(page, 'Upper / Lower').getByRole('button', { name: 'Delete' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete Upper / Lower?', exact: true });
  await expect(confirmation).toContainText('Past workouts keep their sets.');
  await expect(confirmation).not.toContainText("You're following this program.");
  await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(ownProgram(page, 'Upper / Lower')).toHaveCount(0);
  expect(nativeDialogs).toEqual([]);
  await expect.poll(() => programCount(username)).toBe(0);
  await expect.poll(async () => (await sessionRow(sessionId)).program_day_id).toBeNull();
  expect(await setCount(sessionId)).toBe(18);

  await openTab(page, 'Train');
  await expect(page.getByText('No programs yet.')).toBeVisible();
});

test('a target can be cleared and retyped, and reps min above reps max is explained before saving', async ({
  page,
}) => {
  await register(page, uniqueUsername('pt'));
  await copyTemplate(page, 'Full Body 2x');
  const squat = plannedExercise(page, 1, 'Back Squat');
  const sets = squat.getByLabel('Sets');

  await sets.fill('');
  await expect(sets).toHaveValue('');
  await sets.pressSequentially('4');
  await expect(sets).toHaveValue('4');
  await sets.fill('');
  await squat.getByLabel('Reps min').click();
  await expect(sets).toHaveValue('4');

  await squat.getByLabel('Reps min').fill('12');
  await squat.getByLabel('Reps max').fill('8');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText("Back Squat on Day A: reps min can't be above reps max.");
  await expect(page).toHaveURL(/\/programs\/[0-9a-f-]+$/);

  await squat.getByLabel('Reps max').fill('15');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/programs$/);
});
