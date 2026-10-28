import { expect, test } from '../support/fixtures.ts';
import { register, uniqueUsername } from '../support/app.ts';
import { authStorageKey } from '../../web/src/lib/platform/auth-restore.ts';
import { localStackStatus } from '../../scripts/local-stack.ts';

const pagesSessionKey = authStorageKey(localStackStatus().API_URL);

test('the production build leaves out the design gallery', async ({ page }) => {
  await register(page, uniqueUsername('pages_ds'), pagesSessionKey);
  await page.goto('/design');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Design' })).toHaveCount(0);
});
