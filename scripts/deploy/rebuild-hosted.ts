import { rebuildScopeFrom, rebuildThrough } from '../function-batch.ts';
import { adminHeaders } from './admin-users.ts';
import { loadDeployConfig, runCli } from './deploy-env.ts';

await runCli(async () => {
  const config = loadDeployConfig();
  const scope = rebuildScopeFrom(process.argv);
  const totals = await rebuildThrough(
    { url: `${config.VITE_SUPABASE_URL}/functions/v1/rebuild-caches`, headers: adminHeaders(config) },
    scope,
    { batchSize: 10, parallelBatches: 4 },
  );
  console.log(
    `Rebuilt ${totals.rebuilt} users (${scope}) on ${config.SUPABASE_PROJECT_REF}; ${totals.missing} had no profile.`,
  );
});
