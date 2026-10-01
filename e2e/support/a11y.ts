import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
export const TAP_TARGET_PX = 44;
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

export const BETWEEN_SET_CONTROLS = [
  '.tab-bar a[href]',
  'li.set-row input',
  'li.set-row button',
  'li.set-row [role=radio]',
  '.exercise-card .button.dashed',
  '.finish-bar button',
  '.bodyweight-prompt input',
  '.bodyweight-prompt button',
];

export async function expectNoAxeViolations(page: Page, screen: string): Promise<void> {
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const blocking = results.violations
    .filter((violation) => BLOCKING_IMPACTS.has(violation.impact ?? ''))
    .map((violation) => ({
      rule: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(' ')),
    }));
  expect(blocking, `axe violations on ${screen}`).toEqual([]);
}

export async function expectTouchTargets(page: Page, selectors: readonly string[] = BETWEEN_SET_CONTROLS) {
  const { checked, undersized } = await page.evaluate(
    ({ selectors, minimum }) => {
      let checked = 0;
      const found: string[] = [];
      for (const selector of selectors) {
        for (const element of document.querySelectorAll<HTMLElement>(selector)) {
          const box = element.getBoundingClientRect();
          if (box.width === 0 && box.height === 0) continue;
          if (getComputedStyle(element).visibility === 'hidden') continue;
          checked++;
          const hit = element.closest('label')?.getBoundingClientRect() ?? box;
          if (hit.width < minimum || hit.height < minimum) {
            const text = (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 30);
            found.push(`${selector} "${text}" ${Math.round(hit.width)}x${Math.round(hit.height)}`);
          }
        }
      }
      return { checked, undersized: found };
    },
    { selectors, minimum: TAP_TARGET_PX },
  );
  expect(checked, 'controls checked for 44x44').toBeGreaterThan(0);
  expect(undersized, 'controls under 44x44').toEqual([]);
}
