import { expect, test } from '@playwright/test';
import { readChangelog } from '../web/build/changelog.ts';
import { openFromProfile, register, uniqueUsername } from './support/app.ts';

const RELEASES = readChangelog();
const NEWEST_VERSION = RELEASES[0].version;

test('Settings shows the newest changelog version', async ({ page }) => {
  await register(page, uniqueUsername('wn_ver'));
  await openFromProfile(page, 'Settings');
  await expect(page.getByText(`Version ${NEWEST_VERSION}`, { exact: true })).toBeVisible();
});
