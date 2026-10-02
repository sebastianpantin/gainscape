import { loadDeployConfig, runCli } from './deploy-env.ts';

const PAGE_SIZE = 500;

await runCli(async () => {
  const config = loadDeployConfig();
  const headers = {
    Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: config.SUPABASE_SERVICE_ROLE_KEY!,
    'Content-Type': 'application/json',
  };
  let rebuilt = 0;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await fetch(
      `${config.VITE_SUPABASE_URL}/rest/v1/profiles?select=id&order=created_at,id&limit=${PAGE_SIZE}&offset=${offset}`,
      { headers },
    );
    if (!page.ok) throw new Error(`listing profiles failed: ${page.status}`);
    const users = (await page.json()) as { id: string }[];
    for (const { id } of users) {
      const response = await fetch(`${config.VITE_SUPABASE_URL}/functions/v1/rebuild-caches`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId: id }),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`rebuild of ${id} failed: ${response.status} ${body}`);
      console.log(`rebuilt ${id}: ${body}`);
      rebuilt += 1;
    }
    if (users.length < PAGE_SIZE) break;
  }
  console.log(`Rebuilt ${rebuilt} users on ${config.SUPABASE_PROJECT_REF}.`);
});
