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

const WEBKIT_CANCELLED_FETCH_REPORT = / due to access control checks\.$/;

function expectNoPageErrors(pageErrors: string[], browserName: string): void {
  const unexpected =
    browserName === 'webkit'
      ? pageErrors.filter((message) => !WEBKIT_CANCELLED_FETCH_REPORT.test(message))
      : pageErrors;
  expect(unexpected, 'uncaught errors in the page').toEqual([]);
}

export const test = base.extend<Fixtures>({
  context: async ({ context, serviceWorkers, browserName }, use) => {
    const pageErrors = await prepareContext(context, serviceWorkers);
    await use(context);
    expectNoPageErrors(pageErrors, browserName);
  },
  newPerson: async ({ browser, serviceWorkers, browserName }, use) => {
    const people: { context: BrowserContext; pageErrors: string[] }[] = [];
    await use(async () => {
      const context = await browser.newContext();
      people.push({ context, pageErrors: await prepareContext(context, serviceWorkers) });
      return await context.newPage();
    });
    try {
      for (const { pageErrors } of people) expectNoPageErrors(pageErrors, browserName);
    } finally {
      for (const { context } of people) await context.close();
    }
  },
});
