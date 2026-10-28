import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOKEN_COLORS } from '../../web/src/lib/ui/token-colors.ts';
import { token, tokens } from './token-contrast.ts';

const webSrc = join(import.meta.dirname, '../../web/src');
const tokenValues = new Set([...tokens.values()].map((hex) => hex.toLowerCase()));

describe('token colours in TypeScript', () => {
  it.each(Object.entries(TOKEN_COLORS))('--color-%s matches tokens.css', (name, hex) => {
    expect(hex).toBe(token(`color-${name}`).toLowerCase());
  });

  it.each(['lib/profile/profile-rules.ts', 'lib/collection/item-rules.ts'])(
    '%s reads token colours from TOKEN_COLORS instead of copying them',
    (file) => {
      const literals = [...readFileSync(join(webSrc, file), 'utf8').matchAll(/'(#[0-9a-f]{3,6})'/gi)].map((match) =>
        match[1].toLowerCase(),
      );
      expect(literals.filter((hex) => tokenValues.has(hex))).toEqual([]);
    },
  );
});
