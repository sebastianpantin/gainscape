import { adminHeaders, findUserByEmail } from './admin-users.ts';
import { ask, loadDeployConfig, runCli } from './deploy-env.ts';
import { testerArguments } from './testers.ts';

await runCli(async () => {
  const { email } = testerArguments(process.env);
  if (!email) throw new Error('usage: make remove-tester EMAIL=…');
  const config = loadDeployConfig();
  const user = await findUserByEmail(config, email);
  const typed = await ask(`This deletes ${email} and all of their data for good. Type the email to confirm: `);
  if (typed.trim().toLowerCase() !== email) throw new Error('not removed');
  const removed = await fetch(`${config.VITE_SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
    method: 'DELETE',
    headers: adminHeaders(config),
  });
  if (!removed.ok) throw new Error(`removing ${email} failed: ${removed.status}`);
  console.log(`Removed ${email} and their data.`);
});
