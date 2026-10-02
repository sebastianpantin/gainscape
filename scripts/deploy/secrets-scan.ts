import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from './deploy-env.ts';
import { GITLEAKS_VERSION, GITLEAKS_RELEASE_URL, gitleaksAsset } from './rules.ts';

const cacheDir = join(repoRoot, 'node_modules/.cache/gitleaks', GITLEAKS_VERSION);
const binary = join(cacheDir, 'gitleaks');
const config = join(repoRoot, '.gitleaks.toml');
const SCAN_FLAGS = ['--config', config, '--redact', '--no-banner', '--ignore-gitleaks-allow', '--exit-code', '1'];
const PLANTED_RULES = ['postgres-url-with-password', 'supabase-secret-key', 'loot-secret', 'supabase-service-role-jwt'];

async function ensureBinary(): Promise<void> {
  if (existsSync(binary)) return;
  const asset = gitleaksAsset(platform(), arch());
  const response = await fetch(`${GITLEAKS_RELEASE_URL}/${asset.name}`);
  if (!response.ok) throw new Error(`downloading ${asset.name} failed: ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  const actual = createHash('sha256').update(archive).digest('hex');
  if (actual !== asset.sha256) throw new Error(`${asset.name} checksum ${actual} does not match ${asset.sha256}`);
  mkdirSync(cacheDir, { recursive: true });
  const staging = mkdtempSync(join(cacheDir, 'extract-'));
  execFileSync('tar', ['-xzf', '-', '-C', staging, 'gitleaks'], { input: archive });
  renameSync(join(staging, 'gitleaks'), binary);
  rmSync(staging, { recursive: true });
}

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function plantedSecrets(): string {
  const password = randomBytes(12).toString('hex');
  const jwt = [base64Url({ alg: 'HS256' }), base64Url({ ref: 'planted', role: 'service_role' }), 'c2lnbmF0dXJl'];
  return [
    `DATABASE=postgresql://postgres.planted:${password}@aws-0-eu.pooler.supabase.com:6543/postgres`,
    `KEY=sb_secret_${randomBytes(16).toString('hex')}`,
    `LOOT_SECRET=${randomBytes(32).toString('hex')}`,
    `SERVICE=${jwt.join('.')}`,
  ].join('\n');
}

function assertRulesCatchPlantedSecrets(): void {
  const folder = mkdtempSync(join(tmpdir(), 'gainscape-gitleaks-'));
  try {
    writeFileSync(join(folder, 'planted.env'), plantedSecrets());
    const report = join(folder, 'report.json');
    spawnSync(binary, [
      'dir',
      folder,
      '--config',
      config,
      '--no-banner',
      '--report-format',
      'json',
      '--report-path',
      report,
    ]);
    const found = new Set(
      (JSON.parse(readFileSync(report, 'utf8')) as { RuleID: string }[]).map((leak) => leak.RuleID),
    );
    const missed = PLANTED_RULES.filter((rule) => !found.has(rule));
    if (missed.length > 0) throw new Error(`the secrets scan no longer catches: ${missed.join(', ')}`);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

function scan(label: string, args: string[]): boolean {
  const result = spawnSync(binary, [...args, ...SCAN_FLAGS], { cwd: repoRoot, stdio: 'inherit' });
  if (result.status !== 0) console.error(`secrets found in ${label}`);
  return result.status === 0;
}

function untrackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

const stagedOnly = process.argv.includes('--staged');
if (existsSync(join(repoRoot, '.gitleaksignore'))) {
  console.error('.gitleaksignore would hide findings; remove it and fix or rotate the secret instead');
  process.exit(1);
}
await ensureBinary();
assertRulesCatchPlantedSecrets();
const results = stagedOnly
  ? [scan('staged changes', ['git', '--pre-commit', '--staged', '.'])]
  : [
      scan('the git history', ['git', '--log-opts=--all', '.']),
      scan('unstaged changes', ['git', '--pre-commit', '.']),
      scan('staged changes', ['git', '--pre-commit', '--staged', '.']),
      ...untrackedFiles().map((file) => scan(`untracked ${file}`, ['dir', file])),
    ];
if (results.includes(false)) process.exit(1);
console.log(
  stagedOnly
    ? 'No secrets in the staged changes.'
    : 'No secrets found in the history, the working tree or untracked files.',
);
