import { type Locator, type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { definitionOf, logExercise, logWorkout, openTab, register, uniqueUsername } from './support/app.ts';
import { seedQuestProgress } from './support/db.ts';

const INITIATION = 'X Marks the Squat';
const HEAVY_SINGLE = 'The Restless Squat';

async function openQuests(page: Page) {
  await openTab(page, 'Skills');
  await page.getByRole('link', { name: 'Quests', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Quests' })).toBeVisible();
}

function group(page: Page, title: string) {
  return page.getByRole('region', { name: title, exact: true });
}

function questCard(page: Page | Locator, name: string) {
  return page.getByRole('article', { name, exact: true });
}

async function unfold(page: Page, title: string) {
  await group(page, title)
    .getByText(new RegExp(`^Show \\d+ ${title.toLowerCase()} quests?$`))
    .click();
}

test('start a quest, finish it with a workout and see it on the reveal, the profile and the feed', async ({ page }) => {
  const username = uniqueUsername('quest');
  await register(page, username);
  await openQuests(page);

  await expect(definitionOf(page.getByRole('main'), 'Quest points')).toHaveText('0');
  await expect(questCard(group(page, 'Available'), INITIATION)).toBeVisible();
  await expect(questCard(group(page, 'Locked'), HEAVY_SINGLE)).toBeHidden();
  await unfold(page, 'Locked');
  const locked = questCard(group(page, 'Locked'), HEAVY_SINGLE);
  await expect(locked.getByRole('list', { name: 'Requirements' })).toContainText('Not met Legs level 15 (now 1)');
  await expect(locked.getByRole('list', { name: 'Requirements' })).toContainText(`Not met Complete ${INITIATION}`);
  await expect(locked.getByRole('button', { name: /^Start/ })).toHaveCount(0);

  const available = questCard(page, INITIATION);
  await expect(available.getByRole('list', { name: 'Rewards' })).toContainText('800 Legs XP');
  await expect(available).toContainText(`Unlocks ${HEAVY_SINGLE}`);
  await available.getByRole('button', { name: `Start ${INITIATION}` }).click();
  await expect(page.getByRole('status').getByText(`Started ${INITIATION}`, { exact: true })).toBeVisible();

  const started = questCard(group(page, 'In progress'), INITIATION);
  await expect(started.getByRole('list', { name: 'Steps' })).toContainText('Now Train Back Squat in 2 workouts');
  await expect(started).toContainText('0 / 2 workouts');
  await expect(started.getByRole('progressbar', { name: `${INITIATION} step 1 progress` })).toBeVisible();

  await seedQuestProgress(username, 'x_marks_the_squat', { stepIndex: 1, stepProgress: 90 });
  await openTab(page, 'Train');
  await logWorkout(page, () => logExercise(page, 'squat', 'Back Squat', [{ weightKg: 60, reps: 10 }]));

  const reveal = page.getByRole('region', { name: 'Quests' });
  await expect(reveal).toContainText(`Quest complete: ${INITIATION}`);
  await expect(reveal).toContainText('+1 quest point · +800 Legs XP, +200 Core XP');
  await expect(reveal.getByRole('list', { name: 'Level ups from quests' })).toContainText('Legs');

  await reveal.getByRole('link', { name: 'See quests' }).click();
  await unfold(page, 'Completed');
  await expect(questCard(group(page, 'Completed'), INITIATION)).toBeVisible();
  await expect(definitionOf(page.getByRole('main'), 'Quest points')).toHaveText('1');

  await openTab(page, 'Profile');
  await expect(definitionOf(page.getByRole('region', { name: 'Profile' }), 'Quest points')).toHaveText('1');

  await openTab(page, 'Friends');
  await expect(page.getByText(`Completed the quest ${INITIATION}`, { exact: true })).toBeVisible();
});

test('offline the saved quests show and no quest can start', async ({ context, page }) => {
  await register(page, uniqueUsername('quest_off'));
  await openQuests(page);
  await expect(questCard(page, INITIATION).getByRole('button', { name: `Start ${INITIATION}` })).toBeEnabled();

  await context.setOffline(true);
  await openTab(page, 'Skills');
  await page.getByRole('link', { name: 'Quests', exact: true }).click();
  await expect(page.getByRole('main').getByText('Offline: using your saved quests.', { exact: true })).toBeVisible();
  const card = questCard(page, INITIATION);
  await expect(card.getByRole('button', { name: `Start ${INITIATION}` })).toBeDisabled();
  await expect(card).toContainText('Connect to start this quest.');
  await context.setOffline(false);
});

test('a refused start says which requirement is missing', async ({ page }) => {
  await register(page, uniqueUsername('quest_err'));
  await openQuests(page);
  await page.route('**/functions/v1/start-quest', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'quest_requirements_not_met', details: { missing: [{ kind: 'missing_quest' }] } }),
    }),
  );
  const card = questCard(page, INITIATION);
  await card.getByRole('button', { name: `Start ${INITIATION}` }).click();
  await expect(card.getByRole('alert')).toHaveText("You don't meet this quest's requirements yet.");
  await expect(card.getByRole('button', { name: `Start ${INITIATION}` })).toBeEnabled();
});
