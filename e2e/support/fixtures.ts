import { type BrowserContext, expect, type Page, type PlaywrightTestOptions, test as base } from '@playwright/test';

export { expect };

interface Fixtures {
  allowedPageErrors: RegExp[];
  newPerson: () => Promise<Page>;
  pageErrors: string[];
}

async function prepareContext(
  context: BrowserContext,
  pageErrors: string[],
  serviceWorkers: PlaywrightTestOptions['serviceWorkers'],
): Promise<void> {
  context.on('page', (page) => page.on('pageerror', (error) => pageErrors.push(error.message)));
  if (serviceWorkers !== 'block') return;
  await context.addInitScript(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register = () =>
      Promise.reject(new DOMException('Service workers are blocked', 'SecurityError'));
  });
}

export const test = base.extend<Fixtures>({
  allowedPageErrors: [[], { option: true }],
  pageErrors: [
    async ({ allowedPageErrors }, use) => {
      const errors: string[] = [];
      await use(errors);
      const unexpected = errors.filter((message) => !allowedPageErrors.some((allowed) => allowed.test(message)));
      expect(unexpected, 'uncaught errors in the page').toEqual([]);
    },
    { auto: true },
  ],
  context: async ({ context, pageErrors, serviceWorkers }, use) => {
    await prepareContext(context, pageErrors, serviceWorkers);
    await use(context);
  },
  newPerson: async ({ browser, pageErrors, serviceWorkers }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext();
      contexts.push(context);
      await prepareContext(context, pageErrors, serviceWorkers);
      return await context.newPage();
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});
