import { type ChildProcess, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { databaseCliEnvironment, loadDeployConfig, repoRoot, runCli, supabaseBin } from './deploy-env.ts';
import type { DeployConfig } from './rules.ts';

const OWNER_ONLY_FOLDER = 0o700;
const DUMPS = [
  { name: 'roles', args: ['--role-only'] },
  { name: 'schema', args: [] },
  { name: 'data', args: ['--data-only', '--use-copy'] },
];

function exitCode(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
}

async function encryptedDump(config: DeployConfig, folder: string, stamp: string, name: string, args: string[]) {
  const output = join(folder, `${stamp}-${name}.sql.gpg`);
  const partial = `${output}.partial`;
  const dump = spawn(supabaseBin, ['db', 'dump', '--linked', ...args], {
    cwd: repoRoot,
    env: databaseCliEnvironment(config),
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const gpg = spawn(
    'gpg',
    ['--batch', '--yes', '--encrypt', '--recipient', config.GPG_RECIPIENT!, '--output', partial],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  gpg.stdin.on('error', () => dump.kill());
  dump.stdout.pipe(gpg.stdin);
  try {
    const [dumpCode, gpgCode] = await Promise.all([exitCode(dump), exitCode(gpg)]);
    if (dumpCode !== 0 || gpgCode !== 0) {
      throw new Error(`the ${name} dump failed (supabase db dump exited ${dumpCode}, gpg exited ${gpgCode})`);
    }
    renameSync(partial, output);
    return output;
  } catch (error) {
    dump.kill();
    gpg.kill();
    if (existsSync(partial)) rmSync(partial);
    throw error;
  }
}

await runCli(async () => {
  const config = loadDeployConfig();
  const folder = join(homedir(), 'gainscape-backups');
  mkdirSync(folder, { recursive: true });
  chmodSync(folder, OWNER_ONLY_FOLDER);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const { name, args } of DUMPS) console.log(`wrote ${await encryptedDump(config, folder, stamp, name, args)}`);
  console.log(`Backup done. Only the private key ${config.GPG_RECIPIENT} can read it.`);
});
