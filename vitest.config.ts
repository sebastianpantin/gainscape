import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const INTEGRATION_FILES_SHARING_GLOBAL_STATE = ['auth-email', 'catalog', 'crafting', 'loot', 'rate-limits'].map(
  (name) => `tests/integration/${name}.test.ts`,
);
const INTEGRATION_WORKERS = 4;

export default defineConfig({
  resolve: {
    alias: { '@domain': fileURLToPath(new URL('./supabase/functions/_shared/domain', import.meta.url)) },
  },
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/{balance,catalog,deploy,domain,web}/**/*.test.ts'],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          exclude: INTEGRATION_FILES_SHARING_GLOBAL_STATE,
          maxWorkers: INTEGRATION_WORKERS,
          sequence: { groupOrder: 1 },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration-serial',
          include: INTEGRATION_FILES_SHARING_GLOBAL_STATE,
          fileParallelism: false,
          sequence: { groupOrder: 2 },
        },
      },
    ],
  },
});
