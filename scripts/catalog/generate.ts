import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCatalogData } from './load.ts';
import { renderSeed } from './sql.ts';
import { validateCatalog } from './validate.ts';

export const SEED_PATH = join(import.meta.dirname, '../../supabase/seed.sql');

export function generateSeed(): string {
  const catalog = loadCatalogData();
  validateCatalog(catalog);
  return renderSeed(catalog);
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
