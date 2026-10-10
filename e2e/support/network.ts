import { type Page } from '@playwright/test';

export const INJECTED_FAILURE = 'injected failure';

export function restTable(table: string): RegExp {
  return new RegExp(`/rest/v1/${table}(\\?|$)`);
}

export function rpc(name: string): RegExp {
  return new RegExp(`/rest/v1/rpc/${name}(\\?|$)`);
}

export async function failRequests(page: Page, url: RegExp, method?: 'GET' | 'POST' | 'DELETE'): Promise<void> {
  await page.route(url, (route) =>
    method === undefined || route.request().method() === method
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'XX000', message: INJECTED_FAILURE, details: null, hint: null }),
        })
      : route.fallback(),
  );
}
