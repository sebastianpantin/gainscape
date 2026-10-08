import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changedPathsOutput, needsBackend, needsCode } from '../../scripts/ci-changes.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const DOMAIN_ALIAS = '@domain/';
const DOMAIN_DIR = 'supabase/functions/_shared/domain/';
const VALUE_IMPORT = /^\s*(?:import|export)\s+(?!type\s)(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;

function filesUnder(directory: string): string[] {
  return readdirSync(join(ROOT, directory), { recursive: true, encoding: 'utf8' })
    .map((path) => join(directory, path))
    .filter((path) => /\.(ts|mjs)$/.test(path));
}

function resolvedImport(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith(DOMAIN_ALIAS)) return DOMAIN_DIR + specifier.slice(DOMAIN_ALIAS.length);
  if (!specifier.startsWith('.')) return null;
  const path = relative(ROOT, resolve(ROOT, dirname(fromFile), specifier));
  return existsSync(join(ROOT, path)) ? path : null;
}

function valueImportClosure(entries: readonly string[]): Set<string> {
  const reached = new Set<string>();
  const pending = [...entries];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (reached.has(file)) continue;
    reached.add(file);
    for (const [, specifier] of readFileSync(join(ROOT, file), 'utf8').matchAll(VALUE_IMPORT)) {
      const target = resolvedImport(file, specifier);
      if (target) pending.push(target);
    }
  }
  return reached;
}

describe('which pull requests run the backend job', () => {
  it.each([
    'supabase/migrations/20261007000029_029_weekly_goals.sql',
    'supabase/functions/_shared/domain/xp.ts',
    'supabase/tests/16_weekly_goals.test.sql',
    'supabase/seed.sql',
    'tests/integration/account.test.ts',
    'tests/domain/program-fixtures/gzclp.ts',
    'web/src/lib/history-rules.ts',
    'web/src/offline/session-payload.ts',
    'scripts/local-stack.ts',
    'catalog/exercises.yaml',
    'Makefile',
    'package.json',
    'package-lock.json',
    'vitest.config.ts',
    'tsconfig.json',
    '.github/workflows/ci.yml',
  ])('runs for a change to %s', (path) => {
    expect(needsBackend([path])).toBe(true);
  });

  it.each([
    'web/src/features/workout/WorkoutScreen.tsx',
    'web/src/components/Switch.tsx',
    'web/src/sw/service-worker.ts',
    'web/src/offline/draft-format.ts',
    'tests/web/weekly-goal-rules.test.ts',
    'tests/domain/xp.test.ts',
    'tests/balance/balance-bands.test.ts',
    'e2e/weekly-goal.spec.ts',
    '.github/workflows/e2e.yml',
    'eslint.config.js',
    'docs/deploy.md',
    'supabase/AGENTS.md',
  ])('skips for a change only to %s', (path) => {
    expect(needsBackend([path])).toBe(false);
  });

  it('runs when any one changed path needs it', () => {
    expect(needsBackend(['web/src/features/workout/WorkoutScreen.tsx', 'supabase/seed.sql'])).toBe(true);
  });

  it('runs when the changed paths are unknown', () => {
    expect(needsBackend([])).toBe(true);
  });

  it('covers every file the integration tests and stack scripts import at runtime', () => {
    const entries = [
      ...filesUnder('tests/integration'),
      'scripts/ci-web-env.mjs',
      'scripts/assert-local-db.mjs',
      'scripts/ensure-loot-secret.mjs',
      'scripts/wait-for-functions.mjs',
      'vitest.config.ts',
    ];
    const closure = valueImportClosure(entries);
    expect(closure).toContain('web/src/lib/history-rules.ts');
    expect(closure).toContain(`${DOMAIN_DIR}index.ts`);
    expect([...closure].filter((file) => !needsBackend([file]))).toEqual([]);
  });
});

describe('which pull requests run the code checks', () => {
  it.each(['README.md', 'web/src/lib/AGENTS.md', 'docs/deploy.md', 'docs/production-auth.md'])(
    'skips them for a change only to %s',
    (path) => {
      expect(needsCode([path])).toBe(false);
    },
  );

  it.each(['web/src/app.tsx', 'supabase/seed.sql', 'catalog/exercises.yaml', '.github/workflows/ci.yml'])(
    'runs them for a change to %s',
    (path) => {
      expect(needsCode([path])).toBe(true);
    },
  );

  it('runs them when any changed path is code, or the changed paths are unknown', () => {
    expect(needsCode(['README.md', 'web/src/app.tsx'])).toBe(true);
    expect(needsCode([])).toBe(true);
  });
});

describe('the step output', () => {
  it('writes both decisions for GitHub', () => {
    expect(changedPathsOutput(['supabase/seed.sql'])).toBe('code=true\nbackend=true\n');
    expect(changedPathsOutput(['e2e/history.spec.ts'])).toBe('code=true\nbackend=false\n');
    expect(changedPathsOutput(['README.md', 'docs/deploy.md'])).toBe('code=false\nbackend=false\n');
  });
});
