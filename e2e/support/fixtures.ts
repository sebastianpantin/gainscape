import { type BrowserContext, expect, type Page, test as base } from '@playwright/test';

export { expect };

interface Fixtures {
  allowedPageErrors: RegExp[];
  newPerson: () => Promise<Page>;
  pageErrors: string[];
}

function collectPageErrors(context: BrowserContext, errors: string[]): void {
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
}

async function rejectServiceWorkerRegistrationLikeABrowser(context: BrowserContext): Promise<void> {
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
    collectPageErrors(context, pageErrors);
    if (serviceWorkers === 'block') await rejectServiceWorkerRegistrationLikeABrowser(context);
    await use(context);
  },
  newPerson: async ({ browser, pageErrors, serviceWorkers }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext();
      contexts.push(context);
      collectPageErrors(context, pageErrors);
      if (serviceWorkers === 'block') await rejectServiceWorkerRegistrationLikeABrowser(context);
      return await context.newPage();
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});
