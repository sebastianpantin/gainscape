import { rebuildScopeFrom, rebuildThrough } from './function-batch.ts';
import { currentStackEnvMismatch, localStackStatus } from './local-stack.ts';

const mismatch = currentStackEnvMismatch();
if (mismatch) {
  console.error(mismatch);
  process.exit(1);
}

const localStack = localStackStatus();
const scope = rebuildScopeFrom(process.argv);
try {
  const totals = await rebuildThrough(
    { url: `${localStack.FUNCTIONS_URL}/rebuild-caches`, headers: { apikey: localStack.SECRET_KEY } },
    scope,
    { batchSize: 25, parallelBatches: 8 },
  );
  console.log(`Rebuilt ${totals.rebuilt} users (${scope}); ${totals.missing} had no profile.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
