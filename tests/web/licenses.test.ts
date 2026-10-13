import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '../..');
const licensesDir = join(root, 'web/public/licenses');
const mainSource = readFileSync(join(root, 'web/src/main.tsx'), 'utf8');
const licensesPage = readFileSync(join(licensesDir, 'index.html'), 'utf8');

const importedFamilies = [
  ...new Set([...mainSource.matchAll(/'@fontsource\/([a-z0-9-]+)\//g)].map((match) => match[1])),
];

describe('font licenses', () => {
  it('finds the imported font families', () => {
    expect(importedFamilies.sort()).toEqual(['ibm-plex-mono', 'silkscreen']);
  });

  it.each(importedFamilies)('ships the %s license byte for byte and links it', (family) => {
    const shipped = join(licensesDir, `${family}-OFL.txt`);
    expect(existsSync(shipped)).toBe(true);
    const original = readFileSync(join(root, 'node_modules/@fontsource', family, 'LICENSE'));
    expect(readFileSync(shipped).equals(original)).toBe(true);
    expect(licensesPage).toContain(`href="/licenses/${family}-OFL.txt"`);
    expect(original.toString('utf8')).toContain('SIL Open Font License, Version 1.1');
  });

  it('names the license on the licenses page', () => {
    expect(licensesPage).toContain('SIL Open Font License 1.1');
  });
});
