import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '../..');
const TEMPLATE_DIRECTORY = 'catalog/program-templates';

function templateKeyAllowlistPaths(): RegExp[] {
  const config = readFileSync(join(repoRoot, '.gitleaks.toml'), 'utf8');
  const allowlist = config.split('[[allowlists]]').find((block) => block.includes('^stronglifts_5x5$'));
  const paths = /^paths = \[(.*)\]$/m.exec(allowlist ?? '')?.[1] ?? '';
  return [...paths.matchAll(/'''([^']+)'''/g)].map((match) => new RegExp(match[1]));
}

function allowlisted(path: string): boolean {
  return templateKeyAllowlistPaths().some((pattern) => pattern.test(path));
}

describe('the gitleaks allowlist for the StrongLifts template key', () => {
  it('covers every program template file, including frozen key@version files', () => {
    const files = readdirSync(join(repoRoot, TEMPLATE_DIRECTORY)).filter((file) => file.endsWith('.yaml'));
    expect(files.some((file) => file.includes('@'))).toBe(true);
    for (const file of files) expect(allowlisted(`${TEMPLATE_DIRECTORY}/${file}`), file).toBe(true);
  });

  it('covers a frozen StrongLifts version and the generated seed', () => {
    expect(allowlisted(`${TEMPLATE_DIRECTORY}/stronglifts_5x5@1.yaml`)).toBe(true);
    expect(allowlisted(`${TEMPLATE_DIRECTORY}/stronglifts_5x5@12.yaml`)).toBe(true);
    expect(allowlisted('supabase/seed.sql')).toBe(true);
  });

  it('stays out of other files and directories', () => {
    expect(allowlisted(`${TEMPLATE_DIRECTORY}/stronglifts_5x5@1.yaml.bak`)).toBe(false);
    expect(allowlisted(`${TEMPLATE_DIRECTORY}/nested/stronglifts_5x5.yaml`)).toBe(false);
    expect(allowlisted(`${TEMPLATE_DIRECTORY}/stronglifts_5x5@v1.yaml`)).toBe(false);
    expect(allowlisted('catalog/exercises.yaml')).toBe(false);
    expect(allowlisted('web/src/lib/programs.ts')).toBe(false);
  });
});
