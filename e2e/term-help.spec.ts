import { type Locator, type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { GLOSSARY } from '../web/src/lib/ui/glossary.ts';
import { expectNoAxeViolations, expectTouchTargets } from './support/a11y.ts';
import {
  addExercise,
  finishWorkout,
  logExercise,
  logWorkout,
  openFromProfile,
  openTab,
  register,
  uniqueUsername,
} from './support/app.ts';
import {
  FIVE_THREE_ONE_ONE_RMS_KG,
  fillProgramInputs,
  openEnrollForm,
  programToday,
  startFollowing,
  workoutCards,
} from './support/program-enrollment.ts';

const BENCH = 'Barbell Bench Press';
const ROW = 'Barbell Row';

type EffortMode = 'Simple' | 'RIR' | 'RPE';

function helpButton(scope: Page | Locator, question: string): Locator {
  return scope.getByRole('button', { name: question, exact: true });
}

async function panelOf(page: Page, button: Locator): Promise<Locator> {
  return page.locator(`[id="${await button.getAttribute('aria-controls')}"]`);
}

async function docBox(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('element is not rendered');
  const scrollY = await locator.page().evaluate(() => window.scrollY);
  const toHalfPixel = (value: number) => Math.round(value * 2) / 2;
  return {
    x: toHalfPixel(box.x),
    y: toHalfPixel(box.y + scrollY),
    width: toHalfPixel(box.width),
    height: toHalfPixel(box.height),
  };
}

async function settled<T>(read: () => Promise<T>): Promise<T> {
  let previous = await read();
  await expect
    .poll(async () => {
      const current = await read();
      const same = JSON.stringify(current) === JSON.stringify(previous);
      previous = current;
      return same;
    })
    .toBe(true);
  return previous;
}

async function chooseEffortMode(page: Page, mode: EffortMode) {
  await openFromProfile(page, 'Settings');
  const choice = page
    .getByRole('radiogroup', { name: 'How you rate effort' })
    .getByRole('radio', { name: mode, exact: true });
  await choice.click();
  await expect(choice).toHaveAttribute('aria-checked', 'true');
  await openTab(page, 'Train');
}

async function startBenchWorkout(page: Page, prefix: string, mode: EffortMode) {
  await register(page, uniqueUsername(prefix));
  if (mode !== 'Simple') await chooseEffortMode(page, mode);
  await page.getByRole('button', { name: 'Start workout' }).click();
  await addExercise(page, 'bench', BENCH);
}

async function waitForPreviewsSettled(page: Page) {
  await expect(page.getByText('first time').first()).toBeVisible();
}

test('the RIR help opens a panel at the top that moves nothing and leaves Finish reachable', async ({ page }) => {
  await startBenchWorkout(page, 'th_rir', 'RIR');
  const help = helpButton(page, GLOSSARY.rir.question);
  await expect(help).toBeVisible();
  const radio = page.getByRole('radio', { name: 'RIR 2', exact: true });
  await radio.scrollIntoViewIfNeeded();
  const radioBefore = await settled(() => docBox(radio));
  const finish = page.getByRole('button', { name: 'Finish workout' });
  await expect(finish).toBeInViewport();

  await help.click();
  const panel = await panelOf(page, help);
  await expect(panel).toBeVisible();
  await expect(panel.getByText(GLOSSARY.rir.definition, { exact: true })).toBeVisible();
  expect(await docBox(radio)).toEqual(radioBefore);
  const panelBox = await panel.boundingBox();
  const finishBox = await finish.boundingBox();
  if (panelBox === null || finishBox === null) throw new Error('panel or Finish is not rendered');
  expect(panelBox.y + panelBox.height).toBeLessThan(finishBox.y);
  await expect(finish).toBeInViewport();

  await panel.getByRole('button', { name: 'Got it' }).click();
  await expect(panel).toBeHidden();

  await help.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('RPE mode explains RPE and not RIR for a first-time lift', async ({ page }) => {
  await startBenchWorkout(page, 'th_rpe', 'RPE');
  await waitForPreviewsSettled(page);
  await expect(helpButton(page, GLOSSARY.rpe.question)).toBeVisible();
  await expect(page.getByRole('button', { name: /^What is RIR/ })).toHaveCount(0);
});

test('Simple mode shows no workout help for a first-time lift', async ({ page }) => {
  await startBenchWorkout(page, 'th_sim', 'Simple');
  await waitForPreviewsSettled(page);
  await expect(page.getByRole('radiogroup', { name: 'Effort' })).toBeVisible();
  await expect(helpButton(page, GLOSSARY.sessionRpe.question)).toBeVisible();
  await expect(page.getByRole('button', { name: /^What is (RIR|RPE|e1RM|a rep max|an AMRAP)/ })).toHaveCount(0);
});

test('logging and rating sets never moves or changes the workout help', async ({ page }) => {
  await register(page, uniqueUsername('th_stl'));
  await logWorkout(page, () => logExercise(page, 'bench', BENCH, [{ weightKg: 60, reps: 5 }]));
  await openTab(page, 'Train');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await addExercise(page, 'bench', BENCH);
  const bench = workoutCards(page, BENCH);
  await bench.getByRole('button', { name: '+ Add set' }).click();
  await expect(bench.getByText('est. RIR 3').first()).toBeVisible();
  const help = helpButton(page, GLOSSARY.rir.question);
  await expect(help).toBeVisible();

  const heading = page.getByRole('heading', { name: BENCH, exact: true });
  const readHelpLayout = async () => ({
    boxes: [await docBox(help), await docBox(heading)],
    names: await page
      .getByRole('button', { name: /^What is / })
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
  });
  const before = await settled(readHelpLayout);
  expect(before.names).toEqual([GLOSSARY.rir.question, GLOSSARY.repMax.question, GLOSSARY.sessionRpe.question]);

  const doneSetTwo = bench.getByRole('button', { name: 'Done set 2' });
  await expect(doneSetTwo).toHaveAttribute('aria-pressed', 'false');
  await doneSetTwo.click();
  await expect(doneSetTwo).toHaveAttribute('aria-pressed', 'true');
  expect(await readHelpLayout()).toEqual(before);

  await doneSetTwo.click();
  await expect(doneSetTwo).toHaveAttribute('aria-pressed', 'false');
  expect(await readHelpLayout()).toEqual(before);

  const easy = bench.getByRole('radio', { name: 'Easy', exact: true }).first();
  await easy.click();
  await expect(easy).toHaveAttribute('aria-checked', 'true');
  expect(await readHelpLayout()).toEqual(before);

  await help.click();
  await expect(await panelOf(page, help)).toBeVisible();
});

test('session RPE has its own help and keeps its label', async ({ page }) => {
  await startBenchWorkout(page, 'th_srp', 'Simple');
  const help = helpButton(page, GLOSSARY.sessionRpe.question);
  await help.click();
  const panel = await panelOf(page, help);
  await expect(panel.getByText(GLOSSARY.sessionRpe.definition, { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByRole('combobox', { name: 'Session RPE (optional)' })).toBeVisible();
});

test('a superset explains itself once, and RIR is explained once for the whole workout', async ({ page }) => {
  await startBenchWorkout(page, 'th_ss', 'RIR');
  await addExercise(page, 'barbell row', ROW);
  await page.getByLabel(`Exercise menu for ${BENCH}`, { exact: true }).click();
  await page.getByRole('button', { name: 'Superset with next', exact: true }).click();
  const superset = page.getByRole('region', { name: `Superset: ${BENCH} and ${ROW}` });
  await expect(superset).toBeVisible();
  await waitForPreviewsSettled(page);

  await expect(helpButton(superset, GLOSSARY.superset.question)).toHaveCount(1);
  await expect(helpButton(superset, GLOSSARY.rir.question)).toHaveCount(0);
  await expect(helpButton(page, GLOSSARY.rir.question)).toHaveCount(1);
});

test('the workout with a help panel open is accessible and its controls are 44px', async ({ page }) => {
  await startBenchWorkout(page, 'th_ax', 'RIR');
  const help = helpButton(page, GLOSSARY.rir.question);
  await help.click();
  await expect(await panelOf(page, help)).toBeVisible();
  await expectNoAxeViolations(page, 'workout with the RIR help open');
  await expectTouchTargets(page);
});

test('an AMRAP set names its badge and explains AMRAP', async ({ page }) => {
  await register(page, uniqueUsername('th_amr'));
  await openEnrollForm(page, '5/3/1');
  await fillProgramInputs(page, FIVE_THREE_ONE_ONE_RMS_KG);
  await startFollowing(page, '5/3/1');
  await programToday(page, '5/3/1').getByRole('button', { name: 'Start: 5/3/1 — C1 W1 Day 1', exact: true }).click();

  const squat = workoutCards(page, 'Back Squat').first();
  await expect(squat.getByRole('img', { name: '5+, as many reps as possible' })).toBeVisible();
  const help = helpButton(page, GLOSSARY.amrap.question);
  await help.click();
  await expect((await panelOf(page, help)).getByText(GLOSSARY.amrap.definition, { exact: true })).toBeVisible();
});

test('the 5/3/1 enroll form explains 1RM and training max, but not 5RM', async ({ page }) => {
  await register(page, uniqueUsername('th_enr'));
  await openEnrollForm(page, '5/3/1');
  const startingWeights = page.getByRole('region', { name: 'Starting weights' });
  await expect(helpButton(startingWeights, GLOSSARY.oneRm.question)).toBeVisible();
  const help = helpButton(startingWeights, GLOSSARY.trainingMax.question);
  await expect(help).toBeVisible();
  await expect(helpButton(page, GLOSSARY.fiveRm.question)).toHaveCount(0);

  await help.click();
  await expect((await panelOf(page, help)).getByText(GLOSSARY.trainingMax.definition, { exact: true })).toBeVisible();
});

test('the manage program screen explains the training max beside its training weights', async ({ page }) => {
  await register(page, uniqueUsername('th_mng'));
  await openEnrollForm(page, '5/3/1');
  await fillProgramInputs(page, FIVE_THREE_ONE_ONE_RMS_KG);
  await startFollowing(page, '5/3/1');
  await programToday(page, '5/3/1').getByRole('link', { name: 'Manage program', exact: true }).click();
  const trainingWeights = page.getByRole('region', { name: 'Training weights' });
  await expect(helpButton(trainingWeights, GLOSSARY.trainingMax.question)).toBeVisible();
  await expect(page.getByLabel('Squat training max (kg)', { exact: true })).toBeVisible();
});

test('a logged lift explains e1RM and rep maxes on its progress screen', async ({ page }) => {
  await register(page, uniqueUsername('th_prg'));
  await page.getByRole('button', { name: 'Start workout' }).click();
  await logExercise(page, 'bench', BENCH, [{ weightKg: 60, reps: 5 }]);
  await finishWorkout(page);
  await openTab(page, 'Collection');
  await page.getByRole('link', { name: `${BENCH} progress` }).click();
  await expect(page.getByRole('heading', { level: 1, name: BENCH })).toBeVisible();

  await expect(helpButton(page, GLOSSARY.repMax.question)).toBeVisible();
  const help = helpButton(page, GLOSSARY.e1rm.question);
  await help.click();
  await expect((await panelOf(page, help)).getByText(GLOSSARY.e1rm.definition, { exact: true })).toBeVisible();
});

test('an unlogged lift explains rep maxes but not e1RM on its progress screen', async ({ page }) => {
  await startBenchWorkout(page, 'th_npg', 'Simple');
  await page.getByRole('link', { name: `${BENCH} progress` }).click();
  await expect(page.getByRole('heading', { level: 1, name: BENCH })).toBeVisible();
  await expect(page.getByText('Log this exercise to see your progress.')).toBeVisible();

  await expect(helpButton(page, GLOSSARY.repMax.question)).toBeVisible();
  await expect(page.getByRole('button', { name: /^What is e1RM/ })).toHaveCount(0);
});
