import { expect, test } from './support/fixtures.ts';
import { openTab } from './support/app.ts';
import { levelUpHeadline, registerWithFriend, seedChestLevelUps } from './support/friendship.ts';

const FEED_PAGE_SIZE = 20;
const SEEDED_LEVELS = Array.from({ length: FEED_PAGE_SIZE + 5 }, (_, index) => index + 2);

test('load more reveals older friend posts beyond the first feed page', async ({ page }) => {
  const { bobName } = await registerWithFriend(page, 'page');
  await seedChestLevelUps(bobName, SEEDED_LEVELS);
  const newest = Math.max(...SEEDED_LEVELS);
  const oldest = Math.min(...SEEDED_LEVELS);

  await openTab(page, 'Friends');
  const posts = page.getByRole('list', { name: 'Feed' }).getByRole('listitem');
  await expect(posts.first()).toContainText(levelUpHeadline(newest));
  await expect(posts).toHaveCount(FEED_PAGE_SIZE);
  await expect(posts.filter({ hasText: levelUpHeadline(oldest) })).toHaveCount(0);

  await page.getByRole('button', { name: 'Load more' }).click();

  await expect(posts).toHaveCount(SEEDED_LEVELS.length);
  await expect(posts.last()).toContainText(levelUpHeadline(oldest));
  await expect(posts.last()).toContainText(`${bobName} @${bobName}`);
  await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
});
