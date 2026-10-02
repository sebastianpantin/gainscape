import { adminHeaders } from './admin-users.ts';
import { assertInviteOnly, loadDeployConfig, runCli } from './deploy-env.ts';
import { inviteProblems, oneTimePassword, testerArguments } from './testers.ts';

const DEFAULT_TIMEZONE = 'Europe/Stockholm';

await runCli(async () => {
  const tester = testerArguments(process.env);
  const problems = inviteProblems(tester);
  if (problems.length > 0) throw new Error(`${problems.join('\n')}\nusage: make invite-tester EMAIL=… USERNAME=…`);
  const config = loadDeployConfig();
  await assertInviteOnly(config);
  const password = oneTimePassword();
  const response = await fetch(`${config.VITE_SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders(config),
    body: JSON.stringify({
      email: tester.email,
      password,
      email_confirm: true,
      user_metadata: { username: tester.username, timezone: process.env.TIMEZONE ?? DEFAULT_TIMEZONE },
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { msg?: string; message?: string; error_code?: string };
    throw new Error(
      `creating ${tester.email} failed: ${response.status} ${body.error_code ?? body.msg ?? body.message ?? ''}`,
    );
  }
  console.log(`Invited ${tester.username} <${tester.email}>.`);
  console.log(`One-time password (shown only now): ${password}`);
  console.log('Send it to them privately and ask them to change it under Profile → Settings → Change password.');
});
