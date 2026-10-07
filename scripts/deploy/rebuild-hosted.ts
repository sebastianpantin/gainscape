import { adminHeaders, allUserIds } from './admin-users.ts';
import { loadDeployConfig, runCli } from './deploy-env.ts';

await runCli(async () => {
  const config = loadDeployConfig();
  const headers = adminHeaders(config);
  const ids = await allUserIds(config);
  for (const id of ids) {
    const response = await fetch(`${config.VITE_SUPABASE_URL}/functions/v1/rebuild-caches`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId: id }),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`rebuild of ${id} failed: ${response.status} ${body}`);
    console.log(`rebuilt ${id}: ${body}`);
  }
  console.log(`Rebuilt ${ids.length} users on ${config.SUPABASE_PROJECT_REF}.`);
});
