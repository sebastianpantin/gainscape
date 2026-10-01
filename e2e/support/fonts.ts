import { expect, type Page } from '@playwright/test';

export const FONT_FAMILIES = ['Pixelify Sans', 'IBM Plex Mono'];

export async function expectFontsLoaded(page: Page): Promise<void> {
  const results = await page.evaluate(async (families) => {
    const loaded: { family: string; statuses: string[] }[] = [];
    for (const family of families) {
      const faces = await document.fonts.load(`16px "${family}"`);
      loaded.push({ family, statuses: faces.map((face) => face.status) });
    }
    return loaded;
  }, FONT_FAMILIES);
  for (const { family, statuses } of results) {
    expect(statuses.length, family).toBeGreaterThan(0);
    expect(
      statuses.every((status) => status === 'loaded'),
      family,
    ).toBe(true);
  }
}
