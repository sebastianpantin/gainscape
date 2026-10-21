import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changedPathsOutput, needsBackend, needsCode, needsUi } from '../../scripts/ci-changes.ts';

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
    'web/src/lib/history/history-rules.ts',
    'web/src/offline/session-payload.ts',
    'scripts/local-stack.ts',
    'catalog/exercises.yaml',
    'Makefile',
    'package.json',
    'package-lock.json',
    '.nvmrc',
    'vitest.config.ts',
    'tsconfig.json',
    'tsconfig.base.json',
    'tsconfig.node.json',
    'tsconfig.web.json',
    'tsconfig.domain.json',
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
    expect(closure).toContain('web/src/lib/history/history-rules.ts');
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

describe('which pull requests run the browser smoke tests', () => {
  it.each([
    'web/src/features/workout/WorkoutScreen.tsx',
    'web/src/lib/history/history-rules.ts',
    'web/src/offline/draft-format.ts',
    'web/index.html',
    'web/vite.config.ts',
    'web/build/ports.ts',
    'web/public/manifest.webmanifest',
    'e2e/history.spec.ts',
    'e2e/support/app.ts',
    'playwright.config.ts',
    'tsconfig.json',
    'tsconfig.base.json',
    'tsconfig.web.json',
    'tsconfig.node.json',
    'tsconfig.domain.json',
    'supabase/functions/complete-session/index.ts',
    'supabase/migrations/20261007000029_029_weekly_goals.sql',
    'catalog/exercises.yaml',
    'scripts/local-stack.ts',
    'Makefile',
    'package.json',
    'package-lock.json',
    '.nvmrc',
    '.github/workflows/ci.yml',
  ])('runs them for a change to %s', (path) => {
    expect(needsUi([path])).toBe(true);
  });

  it.each([
    'tests/domain/xp.test.ts',
    'tests/integration/account.test.ts',
    'tests/web/weekly-goal-rules.test.ts',
    'scripts/balance/report.ts',
    'supabase/tests/16_weekly_goals.test.sql',
    'e2e/pwa/offline.spec.ts',
    'e2e/AGENTS.md',
    'docs/deploy.md',
    '.github/workflows/e2e.yml',
    'eslint.config.js',
    'web/changelog.yaml',
  ])('skips them for a change only to %s', (path) => {
    expect(needsUi([path])).toBe(false);
  });

  it('runs them for a changelog entry that ships with a screen change', () => {
    expect(needsUi(['web/changelog.yaml', 'web/src/features/workout/WorkoutScreen.tsx'])).toBe(true);
  });

  it('runs them when the changed paths are unknown', () => {
    expect(needsUi([])).toBe(true);
  });

  it('covers every file the chromium e2e suite imports at runtime', () => {
    const entries = [...filesUnder('e2e').filter((file) => !/^e2e\/(pwa|pages)\//.test(file)), 'playwright.config.ts'];
    const closure = valueImportClosure(entries);
    expect(closure).toContain('scripts/local-stack.ts');
    expect([...closure].filter((file) => !needsUi([file]))).toEqual([]);
  });
});

describe('the step output', () => {
  it('writes every decision for GitHub', () => {
    expect(changedPathsOutput(['supabase/seed.sql'])).toBe('code=true\nbackend=true\nui=true\n');
    expect(changedPathsOutput(['e2e/history.spec.ts'])).toBe('code=true\nbackend=false\nui=true\n');
    expect(changedPathsOutput(['tests/domain/xp.test.ts'])).toBe('code=true\nbackend=false\nui=false\n');
    expect(changedPathsOutput(['README.md', 'docs/deploy.md'])).toBe('code=false\nbackend=false\nui=false\n');
  });
});
