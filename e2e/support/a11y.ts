import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const TAP_TARGET_PX = 44;
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

const BETWEEN_SET_CONTROLS = [
  '.tab-bar a[href]',
  'li.set-row input',
  'li.set-row button',
  'li.set-row [role=radio]',
  '.exercise-card .button.dashed',
  '.quick-fill input',
  '.quick-fill button',
  '.finish-bar button',
  '.bodyweight-prompt input',
  '.bodyweight-prompt button',
  'button.term-help',
  '.term-help-panel button',
  '.gz-button',
];

export async function expectNoAxeViolations(page: Page, screen: string): Promise<void> {
  await page.evaluate(() =>
    Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    ),
  );
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

export async function expectRemoveSetButtonsStandApart(page: Page) {
  const crowded = await page.evaluate((minimumGap) => {
    const found: string[] = [];
    for (const remove of document.querySelectorAll<HTMLElement>('li.set-row button[aria-label^="Remove set"]')) {
      const box = remove.getBoundingClientRect();
      const row = remove.closest('li');
      if (row === null) continue;
      for (const neighbour of row.querySelectorAll<HTMLElement>('button, input, [role=radio]')) {
        if (neighbour === remove) continue;
        const other = neighbour.getBoundingClientRect();
        const sharesLine = other.top < box.bottom && other.bottom > box.top;
        const gap = Math.max(other.left - box.right, box.left - other.right);
        if (sharesLine && gap < minimumGap) {
          const name = (neighbour.getAttribute('aria-label') ?? neighbour.textContent ?? '').trim().slice(0, 30);
          found.push(`${remove.getAttribute('aria-label') ?? ''} beside "${name}" ${Math.round(gap)}px`);
        }
      }
    }
    return found;
  }, TAP_TARGET_PX);
  expect(crowded, 'remove set buttons with a control beside them').toEqual([]);
}

export function shownUncovered(element: Locator): Promise<boolean> {
  return element.evaluate((target) => {
    const box = target.getBoundingClientRect();
    const corners = [
      [box.left + 1, box.top + 1],
      [box.right - 1, box.top + 1],
      [box.left + 1, box.bottom - 1],
      [box.right - 1, box.bottom - 1],
    ];
    return corners.every(([x, y]) => target.contains(document.elementFromPoint(x, y)));
  });
}
