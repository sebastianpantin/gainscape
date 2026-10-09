import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const BACKEND_PREFIXES = [
  'supabase/',
  'tests/integration/',
  'tests/domain/program-fixtures/',
  'web/src/lib/',
  'scripts/',
  'catalog/',
];

const BACKEND_FILES = [
  'Makefile',
  'package.json',
  'package-lock.json',
  'vitest.config.ts',
  'tsconfig.json',
  '.github/workflows/ci.yml',
  'web/src/offline/session-payload.ts',
];

export function isDocumentation(path: string): boolean {
  return path.endsWith('.md') || path.startsWith('docs/');
}

function isBackendInput(path: string): boolean {
  if (isDocumentation(path)) return false;
  return BACKEND_FILES.includes(path) || BACKEND_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function needsBackend(changedPaths: readonly string[]): boolean {
  return changedPaths.length === 0 || changedPaths.some(isBackendInput);
}

export function needsCode(changedPaths: readonly string[]): boolean {
  return changedPaths.length === 0 || !changedPaths.every(isDocumentation);
}

export function changedPathsOutput(changedPaths: readonly string[]): string {
  return `code=${needsCode(changedPaths)}\nbackend=${needsBackend(changedPaths)}\n`;
}

function changedSince(base: string): string[] {
  try {
    return execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { encoding: 'utf8' })
      .split('\n')
      .filter((path) => path !== '');
  } catch {
    return [];
  }
}

if (import.meta.main) {
  const output = changedPathsOutput(changedSince(process.argv[2] ?? 'HEAD^1'));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  process.stdout.write(output);
}
