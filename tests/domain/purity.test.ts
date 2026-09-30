import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const domainDir = join(import.meta.dirname, '../../supabase/functions/_shared/domain');
const domainFiles = readdirSync(domainDir).filter((file) => file.endsWith('.ts'));
const importSpecifier = /(?:(?:import|export)[^'"]*from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g;
const runtimeSpecificGlobals = /\b(Deno|process|window|document|localStorage|require)\b\s*[.(]/;

describe('domain purity', () => {
  it.each(domainFiles)('%s only imports sibling .ts files', (file) => {
    const source = readFileSync(join(domainDir, file), 'utf8');
    const specifiers = [...source.matchAll(importSpecifier)].map((match) => match[1]);
    for (const specifier of specifiers) {
      expect(specifier, `${file} imports ${specifier}`).toMatch(/^\.\/[\w-]+\.ts$/);
    }
  });

  it.each(domainFiles)('%s uses no runtime-specific globals', (file) => {
    const code = readFileSync(join(domainDir, file), 'utf8').replace(importSpecifier, '');
    expect(code).not.toMatch(runtimeSpecificGlobals);
  });
});
