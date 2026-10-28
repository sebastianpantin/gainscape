import { type BrowserContext, expect, type Page, type PlaywrightTestOptions, test as base } from '@playwright/test';

export { expect };

interface Fixtures {
  newPerson: () => Promise<Page>;
}

interface Options {
  finishWindowMs: number;
}

const FINISH_WINDOW_OVERRIDE_KEY = 'gainscape.finish-window-ms';
const REACT_DOM_NESTING_ERROR = /cannot be a descendant of|cannot contain a nested/;

async function prepareContext(
  context: BrowserContext,
  serviceWorkers: PlaywrightTestOptions['serviceWorkers'],
  finishWindowMs: number,
): Promise<string[]> {
  const pageErrors: string[] = [];
  context.on('page', (page) => {
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && REACT_DOM_NESTING_ERROR.test(message.text())) pageErrors.push(message.text());
    });
  });
  await context.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        return;
      }
    },
    { key: FINISH_WINDOW_OVERRIDE_KEY, value: String(finishWindowMs) },
  );
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
  expect(unexpected, 'uncaught errors or React DOM-nesting errors in the page').toEqual([]);
}

export const test = base.extend<Fixtures & Options>({
  finishWindowMs: [0, { option: true }],
  context: async ({ context, serviceWorkers, browserName, finishWindowMs }, use) => {
    const pageErrors = await prepareContext(context, serviceWorkers, finishWindowMs);
    await use(context);
    expectNoPageErrors(pageErrors, browserName);
  },
  newPerson: async ({ browser, serviceWorkers, browserName, finishWindowMs }, use) => {
    const people: { context: BrowserContext; pageErrors: string[] }[] = [];
    await use(async () => {
      const context = await browser.newContext();
      people.push({ context, pageErrors: await prepareContext(context, serviceWorkers, finishWindowMs) });
      return await context.newPage();
    });
    try {
      for (const { pageErrors } of people) expectNoPageErrors(pageErrors, browserName);
    } finally {
      for (const { context } of people) await context.close();
    }
  },
});
