import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { repoRoot, runCli } from './deploy-env.ts';
import { pagesHeaders, unpublishedFiles } from './pages-headers.ts';
import { allowlistedBuildEnvironment, bundleLeaks, strayViteEnvFiles } from './rules.ts';

const PUBLIC_BUILD_VARIABLES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

const distDir = join(repoRoot, 'web/dist');

function filesUnder(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(distDir, join(entry.parentPath, entry.name)));
}

export function buildPages(
  source: Readonly<Record<string, string | undefined>> = process.env,
  configuredSecrets: readonly string[] = [],
): void {
  const env = allowlistedBuildEnvironment(source, PUBLIC_BUILD_VARIABLES);
  const envFiles = strayViteEnvFiles(readdirSync(join(repoRoot, 'web')));
  if (envFiles.length > 0) {
    throw new Error(`refusing to build while web/ holds ${envFiles.join(', ')}; Vite would load them into the bundle`);
  }
  execFileSync(process.execPath, [join(repoRoot, 'node_modules/vite/bin/vite.js'), 'build', 'web'], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });
  for (const file of unpublishedFiles(filesUnder(distDir))) rmSync(join(distDir, file));
  writeFileSync(join(distDir, '_headers'), pagesHeaders(env.VITE_SUPABASE_URL));
  const leaks = bundleLeaks(
    filesUnder(distDir).map((path) => ({ path, content: readFileSync(join(distDir, path), 'latin1') })),
    configuredSecrets,
  );
  if (leaks.length > 0) throw new Error(`refusing to publish a build that contains secrets:\n${leaks.join('\n')}`);
}

if (import.meta.main) {
  await runCli(() => {
    buildPages();
    console.log('Built web/dist for Cloudflare Pages with _headers.');
  });
}
