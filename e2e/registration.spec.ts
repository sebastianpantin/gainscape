import { type Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { emailOf, fillRegistration, register, uniqueUsername } from './support/app.ts';
import { usernameOfEmail } from './support/db.ts';

const USERNAME_TAKEN = 'That username is taken.';

async function reportUsernameAvailable(page: Page) {
  await page.route('**/rest/v1/rpc/username_available', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'true' }),
  );
}

test('registering a taken username is refused before any account is created', async ({ page, newPerson }) => {
  const taken = uniqueUsername('rg_tk');
  await register(page, taken);

  const latecomer = await newPerson();
  const latecomerEmail = `${uniqueUsername('rg_lt')}@example.test`;
  await fillRegistration(latecomer, taken, latecomerEmail);
  const signUps: string[] = [];
  latecomer.on('request', (request) => {
    if (request.url().includes('/auth/v1/signup')) signUps.push(request.url());
  });
  const availabilityCheck = latecomer.waitForResponse('**/rest/v1/rpc/username_available');
  await latecomer.getByRole('button', { name: 'Create account' }).click();
  expect(await (await availabilityCheck).json()).toBe(false);

  await expect(latecomer.getByRole('alert')).toHaveText(USERNAME_TAKEN);
  expect(signUps).toEqual([]);
  await expect(latecomer.getByRole('heading', { name: 'Check your email' })).toHaveCount(0);
  expect(await usernameOfEmail(latecomerEmail)).toBeNull();
  expect(await usernameOfEmail(emailOf(taken))).toBe(taken);
});

test('a username taken between the check and the sign-up is refused by the sign-up', async ({ page, newPerson }) => {
  const taken = uniqueUsername('rg_rc');
  await register(page, taken);

  const latecomer = await newPerson();
  const latecomerEmail = `${uniqueUsername('rg_lr')}@example.test`;
  await reportUsernameAvailable(latecomer);
  await fillRegistration(latecomer, taken, latecomerEmail);
  const signUp = latecomer.waitForResponse('**/auth/v1/signup**');
  await latecomer.getByRole('button', { name: 'Create account' }).click();
  expect((await signUp).ok()).toBe(false);

  await expect(latecomer.getByRole('alert')).toHaveText(USERNAME_TAKEN);
  await expect(latecomer.getByRole('heading', { name: 'Check your email' })).toHaveCount(0);
  expect(await usernameOfEmail(latecomerEmail)).toBeNull();
  expect(await usernameOfEmail(emailOf(taken))).toBe(taken);
});
