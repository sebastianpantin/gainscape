import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCatalogData } from './load.ts';
import {
  loadProgramTemplates,
  programTemplateLockProblems,
  readProgramTemplateLock,
  renderProgramTemplates,
} from './program-templates.ts';
import { renderSeed } from './sql.ts';
import { CatalogValidationError, validateCatalog } from './validate.ts';

export const SEED_PATH = join(import.meta.dirname, '../../supabase/seed.sql');

export function generateSeed(): string {
  const catalog = loadCatalogData();
  validateCatalog(catalog);
  const programTemplates = loadProgramTemplates();
  const lockProblems = programTemplateLockProblems(programTemplates, readProgramTemplateLock());
  if (lockProblems.length > 0) throw new CatalogValidationError(lockProblems);
  return renderSeed(catalog, [renderProgramTemplates(programTemplates)]);
}

if (import.meta.main) {
  const seed = generateSeed();
  if (process.argv.includes('--check')) {
    if (readFileSync(SEED_PATH, 'utf8') !== seed) {
      console.error('supabase/seed.sql is out of date; run `make catalog`');
      process.exit(1);
    }
    console.log('supabase/seed.sql matches the catalog.');
  } else {
    writeFileSync(SEED_PATH, seed);
    console.log('Wrote supabase/seed.sql.');
  }
}
