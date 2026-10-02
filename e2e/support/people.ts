import { type BrowserContext, type Page, test as base } from '@playwright/test';

export const test = base.extend<{ newPerson: () => Promise<Page> }>({
  newPerson: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext();
      contexts.push(context);
      return await context.newPage();
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});
