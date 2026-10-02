import { relative, isAbsolute } from 'node:path';

const OWNER_ONLY_MASK = 0o077;
const DEPLOY_FILE_NAMES = new Set(['deploy.env', '.deploy.env']);
const ALWAYS_PASSED_VARIABLES = ['PATH'];
const CLI_LOGIN_VARIABLES = ['PATH', 'HOME', 'XDG_CONFIG_HOME'];
const VITE_PRODUCTION_ENV_FILES = new Set(['.env', '.env.local', '.env.production', '.env.production.local']);
const POSTGRES_URL_WITH_PASSWORD = /postgres(?:ql)?:\/\/[^:\s/'"`]+:[^@\s'"`]{6,}@/;
const GPG_FINGERPRINT = /^[0-9A-Fa-f]{40}$/;
const SUPABASE_SECRET_KEY = /sb_secret_[A-Za-z0-9_-]{16,}/;
const JWT = /eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g;

export const GITLEAKS_VERSION = '8.30.1';
const GITLEAKS_CHECKSUMS: Record<string, string> = {
  linux_x64: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
  linux_arm64: 'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080',
  darwin_x64: 'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709',
  darwin_arm64: 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
};

function isInside(path: string, folder: string): boolean {
  const fromFolder = relative(folder, path);
  return fromFolder !== '' && !fromFolder.startsWith('..') && !isAbsolute(fromFolder);
}

export interface DeployFileFacts {
  path: string;
  realPath: string;
  isSymlink: boolean;
  mode: number;
  ownerUid: number;
  currentUid: number;
}

export function deployFileProblem(file: DeployFileFacts, repoRoot: string): string | null {
  const { path, realPath, isSymlink, mode, ownerUid, currentUid } = file;
  if (isSymlink) return `${path} is a symlink; use a regular file`;
  if (isInside(realPath, repoRoot)) return `${path} is inside the repo; keep the deploy file outside the repo`;
  if (ownerUid !== currentUid) return `${path} is owned by uid ${ownerUid}, not you`;
  if ((mode & OWNER_ONLY_MASK) !== 0) return `${path} is readable by other users; run chmod 600 ${path}`;
  return null;
}

export function strayViteEnvFiles(names: readonly string[]): string[] {
  return names.filter((name) => VITE_PRODUCTION_ENV_FILES.has(name));
}

export function childEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  extras: Readonly<Record<string, string | undefined>> = {},
): Record<string, string> {
  const entries = [...CLI_LOGIN_VARIABLES.map((name) => [name, env[name]] as const), ...Object.entries(extras)].filter(
    (entry): entry is readonly [string, string] => entry[1] !== undefined,
  );
  return Object.fromEntries(entries);
}

export function inRepoDeployFiles(paths: readonly string[]): string[] {
  return paths.filter((path) => DEPLOY_FILE_NAMES.has(path.split('/').at(-1) ?? ''));
}

export function allowlistedBuildEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  allowed: readonly string[],
): Record<string, string> {
  const unexpected = Object.keys(env).filter((name) => name.startsWith('VITE_') && !allowed.includes(name));
  if (unexpected.length > 0) throw new Error(`refusing to build with ${unexpected.join(', ')} set`);
  const missing = allowed.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`missing ${missing.join(', ')}`);
  const passed = [...ALWAYS_PASSED_VARIABLES, ...allowed].filter((name) => env[name] !== undefined);
  return Object.fromEntries(passed.map((name) => [name, env[name]!]));
}

function hasServiceRoleJwt(content: string): boolean {
  return [...content.matchAll(JWT)].some((match) => {
    try {
      return JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')).role === 'service_role';
    } catch {
      return false;
    }
  });
}

export interface BundleFile {
  path: string;
  content: string;
}

export function bundleLeaks(files: readonly BundleFile[], secrets: readonly string[]): string[] {
  const knownSecrets = secrets.filter((secret) => secret.length > 0);
  return files.flatMap((file) => [
    ...(knownSecrets.some((secret) => file.content.includes(secret))
      ? [`${file.path}: a configured secret value`]
      : []),
    ...(SUPABASE_SECRET_KEY.test(file.content) ? [`${file.path}: an sb_secret_ key`] : []),
    ...(hasServiceRoleJwt(file.content) ? [`${file.path}: a service_role JWT`] : []),
    ...(POSTGRES_URL_WITH_PASSWORD.test(file.content) ? [`${file.path}: a Postgres URL with a password`] : []),
  ]);
}

export function gitleaksAsset(platform: string, arch: string): { name: string; sha256: string } {
  const key = `${platform}_${arch}`;
  const sha256 = GITLEAKS_CHECKSUMS[key];
  if (!sha256) throw new Error(`no pinned gitleaks release for ${platform} ${arch}`);
  return { name: `gitleaks_${GITLEAKS_VERSION}_${key}.tar.gz`, sha256 };
}

export const GITLEAKS_RELEASE_URL = `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}`;

const REQUIRED_DEPLOY_SETTINGS = [
  'CLOUDFLARE_PAGES_PROJECT',
  'GPG_RECIPIENT',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_URL',
] as const;

export type DeployConfig = Partial<Record<string, string>>;

function unquoted(value: string): string {
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.endsWith(quote) ? value.slice(1, -1) : value;
}

export function parseDeployEnv(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator).trim(), unquoted(line.slice(separator + 1).trim())];
      }),
  );
}

function isSecretKey(value: string): boolean {
  return SUPABASE_SECRET_KEY.test(value) || hasServiceRoleJwt(value);
}

export function deployConfigProblems(config: DeployConfig): string[] {
  const missing = REQUIRED_DEPLOY_SETTINGS.filter((name) => !config[name]).map((name) => `missing ${name}`);
  if (missing.length > 0) return missing;
  const problems: string[] = [];
  const expectedUrl = `https://${config.SUPABASE_PROJECT_REF}.supabase.co`;
  if (config.VITE_SUPABASE_URL !== expectedUrl) problems.push(`VITE_SUPABASE_URL must be ${expectedUrl}`);
  if (isSecretKey(config.VITE_SUPABASE_ANON_KEY!)) {
    problems.push('VITE_SUPABASE_ANON_KEY holds a secret key; use the anon (publishable) key');
  }
  if (!hasServiceRoleJwt(config.SUPABASE_SERVICE_ROLE_KEY!)) {
    problems.push('SUPABASE_SERVICE_ROLE_KEY must be the legacy service_role JWT (Settings → API → Legacy API keys)');
  }
  if (!GPG_FINGERPRINT.test(config.GPG_RECIPIENT!))
    problems.push('GPG_RECIPIENT must be a 40-character key fingerprint');
  return problems;
}

export function configuredSecrets(config: DeployConfig): string[] {
  return [config.SUPABASE_SERVICE_ROLE_KEY ?? '', config.SUPABASE_DB_PASSWORD ?? ''];
}

export function linkedRefProblem(configuredRef: string, linkedRef: string | null): string | null {
  if (linkedRef === null) return `the CLI is not linked; run npx supabase link --project-ref ${configuredRef}`;
  if (linkedRef !== configuredRef) return `the CLI is linked to ${linkedRef}, not ${configuredRef}`;
  return null;
}

export interface ReleaseState {
  dirtyPaths: readonly string[];
  head: string;
  originMain: string;
}

export function releaseProblem({ dirtyPaths, head, originMain }: ReleaseState): string | null {
  if (dirtyPaths.length > 0) return `commit or stash these first: ${dirtyPaths.join(', ')}`;
  if (head !== originMain) return 'deploy only what is merged: check out main at origin/main';
  return null;
}

export interface AuthSettings {
  disable_signup?: boolean;
  external?: Record<string, boolean>;
}

export function authSettingsProblems(settings: AuthSettings | null): string[] {
  if (settings === null || typeof settings !== 'object') return ['Auth: could not read the settings'];
  const otherProviders = Object.entries(settings.external ?? {})
    .filter(([provider, enabled]) => enabled && provider !== 'email')
    .map(([provider]) => provider)
    .sort();
  return [
    ...(settings.disable_signup === true ? [] : ['Auth: turn "Allow new users to sign up" off']),
    ...otherProviders.map((provider) => `Auth: turn the ${provider} provider off`),
  ];
}
