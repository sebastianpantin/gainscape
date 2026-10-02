import { adminHeaders, findUserByEmail } from './admin-users.ts';
import { loadDeployConfig, runCli } from './deploy-env.ts';
import { testerArguments } from './testers.ts';

const BAN_FOR_A_CENTURY = '876000h';

await runCli(async () => {
  const { email } = testerArguments(process.env);
  if (!email) throw new Error('usage: make ban-tester EMAIL=…');
  const config = loadDeployConfig();
  const user = await findUserByEmail(config, email);
  const response = await fetch(`${config.VITE_SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers: adminHeaders(config),
    body: JSON.stringify({ ban_duration: BAN_FOR_A_CENTURY }),
  });
  if (!response.ok) throw new Error(`banning ${email} failed: ${response.status}`);
  console.log(`Banned ${email}. Their data is kept; an access token already issued stays valid for up to an hour.`);
});
