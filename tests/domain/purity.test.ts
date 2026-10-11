import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const domainDir = join(import.meta.dirname, '../../supabase/functions/_shared/domain');
const domainFiles = readdirSync(domainDir).filter((file) => file.endsWith('.ts'));
const importSpecifier = /(?:(?:import|export)[^'"]*from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g;
const runtimeSpecificGlobals = /\b(Deno|process|window|document|localStorage|require)\b\s*[.(]/;

const siblingImport = /^(?:import|export)\s+(type\s+)?([^'"]*?)\s*from\s+'\.\/([\w-]+\.ts)'/gm;

interface SiblingImport {
  file: string;
  typeOnly: boolean;
}

function isTypeOnly(typeKeyword: string | undefined, clause: string): boolean {
  if (typeKeyword) return true;
  const named = /^\{([^}]*)\}$/.exec(clause.trim());
  if (!named) return false;
  const specifiers = named[1]
    .split(',')
    .map((specifier) => specifier.trim())
    .filter(Boolean);
  return specifiers.length > 0 && specifiers.every((specifier) => specifier.startsWith('type '));
}

function siblingImportsOf(file: string): SiblingImport[] {
  const source = readFileSync(join(domainDir, file), 'utf8');
  return [...source.matchAll(siblingImport)].map((match) => ({
    file: match[3],
    typeOnly: isTypeOnly(match[1], match[2]),
  }));
}

function importCycles(files: readonly string[], followTypeImports: boolean): string[][] {
  const finished = new Set<string>();
  const cycles: string[][] = [];
  const visit = (file: string, path: readonly string[]): void => {
    const cycleStart = path.indexOf(file);
    if (cycleStart >= 0) cycles.push([...path.slice(cycleStart), file]);
    if (cycleStart >= 0 || finished.has(file)) return;
    for (const imported of siblingImportsOf(file)) {
      if (files.includes(imported.file) && (followTypeImports || !imported.typeOnly)) {
        visit(imported.file, [...path, file]);
      }
    }
    finished.add(file);
  };
  for (const file of files) visit(file, []);
  return cycles;
}

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

  it('has no runtime import cycles among domain files', () => {
    expect(importCycles(domainFiles, false)).toEqual([]);
  });

  it('has no import cycles among the program engine files, type imports included', () => {
    const programFiles = domainFiles.filter((file) => file.startsWith('program-'));
    expect(importCycles(programFiles, true)).toEqual([]);
  });
});
