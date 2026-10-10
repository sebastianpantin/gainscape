import { type BrowserContext, expect, type Page, type PlaywrightTestOptions, test as base } from '@playwright/test';

export { expect };

interface Fixtures {
  newPerson: () => Promise<Page>;
}

async function prepareContext(
  context: BrowserContext,
  serviceWorkers: PlaywrightTestOptions['serviceWorkers'],
): Promise<string[]> {
  const pageErrors: string[] = [];
  context.on('page', (page) => page.on('pageerror', (error) => pageErrors.push(error.message)));
  if (serviceWorkers === 'block') {
    await context.addInitScript(() => {
      if (!('serviceWorker' in navigator)) return;
      navigator.serviceWorker.register = () =>
        Promise.reject(new DOMException('Service workers are blocked', 'SecurityError'));
    });
  }
  return pageErrors;
}

function expectNoPageErrors(pageErrors: string[]): void {
  expect(pageErrors, 'uncaught errors in the page').toEqual([]);
}

export const test = base.extend<Fixtures>({
  context: async ({ context, serviceWorkers }, use) => {
    const pageErrors = await prepareContext(context, serviceWorkers);
    await use(context);
    expectNoPageErrors(pageErrors);
  },
  newPerson: async ({ browser, serviceWorkers }, use) => {
    const people: { context: BrowserContext; pageErrors: string[] }[] = [];
    await use(async () => {
      const context = await browser.newContext();
      people.push({ context, pageErrors: await prepareContext(context, serviceWorkers) });
      return await context.newPage();
    });
    try {
      for (const { pageErrors } of people) expectNoPageErrors(pageErrors);
    } finally {
      for (const { context } of people) await context.close();
    }
  },
});
