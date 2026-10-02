import { expect, type Page, test } from '@playwright/test';
import {
  emailOf,
  openFromProfile,
  register,
  signOut,
  submitRegistration,
  submitSignIn,
  TEST_PASSWORD,
  uniqueUsername,
} from './support/app.ts';
import { ageConfirmation, usernameOfEmail } from './support/db.ts';
import {
  authLinkFrom,
  CONFIRM_SUBJECT,
  EMAIL_CHANGE_SUBJECT,
  MAX_FREQUENCY_WAIT_MS,
  RECOVERY_SUBJECT,
  waitForEmail,
} from './support/mailbox.ts';

async function linkTo(email: string, subject: string, since: Date): Promise<string> {
  return authLinkFrom(await waitForEmail(email, { subject, since }));
}

async function choosePassword(page: Page, newPassword: string) {
  await page.getByLabel('New password', { exact: true }).fill(newPassword);
  await page.getByLabel('Repeat new password').fill(newPassword);
}

async function registerThroughEmail(page: Page, username: string): Promise<string> {
  const since = new Date();
  await submitRegistration(page, username);
  const link = await linkTo(emailOf(username), CONFIRM_SUBJECT, since);
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Account confirmed' })).toBeVisible();
  await expect(page).not.toHaveURL(/token_hash/);
  await expect(page.getByTestId('confirmed-username')).toHaveText(username);
  await choosePassword(page, TEST_PASSWORD);
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  return link;
}

test('register and confirm through the emailed link', async ({ page }) => {
  await registerThroughEmail(page, uniqueUsername('au_cf'));
  await expect(page).toHaveURL(/\/$/);
});

test('an unconfirmed sign-in offers to resend the link', async ({ page }) => {
  const username = uniqueUsername('au_rs');
  await submitRegistration(page, username);
  await page.goto('/');
  await page.waitForTimeout(MAX_FREQUENCY_WAIT_MS);
  await submitSignIn(page, emailOf(username));
  await expect(page.getByText('Confirm your email first. We can send the link again.')).toBeVisible();

  const since = new Date();
  await page.getByRole('button', { name: 'Resend email' }).click();
  await expect(page.getByText('We sent the link again.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Resend email \(\d+ s\)/ })).toBeDisabled();
  await page.goto(await linkTo(emailOf(username), CONFIRM_SUBJECT, since));
  await choosePassword(page, TEST_PASSWORD);
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
});

test('forgot password sends a reset link that sets a new password', async ({ page }) => {
  const username = uniqueUsername('au_fp');
  const email = emailOf(username);
  await register(page, username);
  await signOut(page);

  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill(email);
  const since = new Date();
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(`If an account exists for ${email}, we sent a reset link.`)).toBeVisible();

  await page.goto(await linkTo(email, RECOVERY_SUBJECT, since));
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
  await choosePassword(page, 'a-reset-password');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByText('Password changed.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('link', { name: 'Train', exact: true })).toBeVisible();

  await signOut(page);
  await submitSignIn(page, email);
  await expect(page.getByText('Wrong email or password.')).toBeVisible();
  await submitSignIn(page, email, 'a-reset-password');
  await expect(page.getByRole('link', { name: 'Train', exact: true })).toBeVisible();
});

test('an email change needs both links', async ({ page }) => {
  const username = uniqueUsername('au_ec');
  const newEmail = `${username}.new@example.test`;
  await register(page, username);
  await openFromProfile(page, 'Settings');
  await page.getByRole('button', { name: 'Change email' }).click();
  await page.getByLabel('New email').fill(newEmail);
  const since = new Date();
  await page.getByRole('button', { name: 'Send confirmation' }).click();
  await expect(page.getByText(`We sent confirmation links to ${emailOf(username)} and ${newEmail}.`)).toBeVisible();

  for (const address of [emailOf(username), newEmail]) {
    await page.goto(await linkTo(address, EMAIL_CHANGE_SUBJECT, since));
    await expect(page.getByRole('heading', { name: 'Email change confirmed' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('link', { name: 'Train', exact: true })).toBeVisible();
  }

  await signOut(page);
  await submitSignIn(page, newEmail);
  await expect(page.getByRole('link', { name: 'Train', exact: true })).toBeVisible();
  await openFromProfile(page, 'Settings');
  await expect(page.getByTestId('settings-email')).toHaveText(newEmail);
});

test('a used confirmation link is invalid', async ({ page }) => {
  const username = uniqueUsername('au_ex');
  const link = await registerThroughEmail(page, username);
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Account confirmed' })).toBeVisible();
  await expect(page.getByTestId('confirmed-username')).toHaveText(username);
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await signOut(page);
  await page.goto(link);
  await expect(page.getByText('This link is invalid or has expired.')).toBeVisible();
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('a stale link opened by another signed-in user is invalid', async ({ page }) => {
  const link = await registerThroughEmail(page, uniqueUsername('au_sl'));
  await signOut(page);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  const other = uniqueUsername('au_ot');
  await register(page, other);
  await ageConfirmation(emailOf(other), '2 hours');
  await page.goto(link);
  await expect(page.getByText('This link is invalid or has expired.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Account confirmed' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('link', { name: 'Train', exact: true })).toBeVisible();
});

test('a squatter loses the account when the owner confirms the email', async ({ browser }) => {
  const victimName = uniqueUsername('au_vi');
  const squatterName = uniqueUsername('au_sq');
  const victimEmail = emailOf(victimName);

  const squatterContext = await browser.newContext();
  const squatter = await squatterContext.newPage();
  await submitRegistration(squatter, squatterName, victimEmail);
  await squatter.waitForTimeout(MAX_FREQUENCY_WAIT_MS);

  const victimContext = await browser.newContext();
  const victim = await victimContext.newPage();
  const since = new Date();
  await submitRegistration(victim, victimName, victimEmail);
  await victim.goto(await linkTo(victimEmail, CONFIRM_SUBJECT, since));
  await expect(victim.getByTestId('confirmed-username')).toHaveText(squatterName);
  await victim.getByLabel('Username').fill(victimName);
  await choosePassword(victim, 'the-owners-password');
  await victim.getByRole('button', { name: 'Save and continue' }).click();
  await expect(victim.getByRole('button', { name: 'Start workout' })).toBeVisible();
  expect(await usernameOfEmail(victimEmail)).toBe(victimName);

  await squatter.goto('/');
  await submitSignIn(squatter, victimEmail);
  await expect(squatter.getByText('Wrong email or password.')).toBeVisible();

  await victimContext.close();
  await squatterContext.close();
});
