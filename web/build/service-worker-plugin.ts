import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { build, type Plugin } from 'vite';
import {
  BUILD_ID_LENGTH,
  precacheEntries,
  SERVICE_WORKER_FILE,
  SHELL_INDEX,
  SHELL_MANIFEST,
  shellBuildManifestText,
  type ShellBuild,
} from '../src/pwa/shell-rules.ts';

const workerEntry = resolve(import.meta.dirname, '../src/sw/service-worker.ts');
const killSwitchEntry = resolve(import.meta.dirname, '../src/sw/kill-switch.ts');
const BUILD_MARKER = '.vite/gainscape-build.json';
const PRODUCTION_MODE = 'production';
export const KILL_SWITCH_ALLOW_LOCAL_FLAG = 'GAINSCAPE_KILL_SWITCH_ALLOW_LOCAL';

export interface BuildMarker {
  mode: string;
  hostedSupabase: boolean;
}

function readBuildMarker(outDir: string): BuildMarker | null {
  try {
    return JSON.parse(readFileSync(join(outDir, BUILD_MARKER), 'utf8')) as BuildMarker;
  } catch {
    return null;
  }
}

export function killSwitchRefusal(outDir: string, allowLocal: boolean): string | null {
  if (!existsSync(join(outDir, 'index.html'))) return 'web/dist/index.html is missing';
  if (allowLocal) return null;
  const marker = readBuildMarker(outDir);
  if (!marker) return `web/dist/${BUILD_MARKER} is missing`;
  if (marker.mode !== PRODUCTION_MODE) return `web/dist was built in ${marker.mode} mode`;
  if (!marker.hostedSupabase) return 'web/dist was built without VITE_SUPABASE_URL';
  return null;
}

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)).split(sep).join('/'));
}

export function shellBuildFor(outDir: string): ShellBuild {
  const files = precacheEntries(listFiles(outDir)).map((path) => ({
    path,
    sha256: sha256(readFileSync(join(outDir, path.slice(1)))),
  }));
  for (const required of [SHELL_INDEX, SHELL_MANIFEST])
    if (!files.some((file) => file.path === required)) throw new Error(`The shell precache list lacks ${required}`);
  return { id: sha256(shellBuildManifestText(files)).slice(0, BUILD_ID_LENGTH), files };
}

async function buildWorker(entry: string, outDir: string, define: Record<string, string>): Promise<string> {
  await build({
    configFile: false,
    publicDir: false,
    logLevel: 'warn',
    define,
    build: {
      outDir,
      emptyOutDir: false,
      copyPublicDir: false,
      minify: true,
      lib: { entry, formats: ['iife'], name: 'gainscapeShell', fileName: () => SERVICE_WORKER_FILE },
    },
  });
  const workerPath = join(outDir, SERVICE_WORKER_FILE);
  if (!existsSync(workerPath)) throw new Error(`${SERVICE_WORKER_FILE} was not built from ${entry}`);
  return readFileSync(workerPath, 'utf8');
}

export async function buildKillSwitch(outDir: string): Promise<string> {
  return buildWorker(killSwitchEntry, outDir, {});
}

export function serviceWorkerPlugin(): Plugin {
  let outDir = '';
  let marker: BuildMarker = { mode: PRODUCTION_MODE, hostedSupabase: false };
  return {
    name: 'gainscape-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      marker = { mode: config.mode, hostedSupabase: Boolean(config.env.VITE_SUPABASE_URL) };
    },
    async closeBundle() {
      mkdirSync(join(outDir, '.vite'), { recursive: true });
      writeFileSync(join(outDir, BUILD_MARKER), `${JSON.stringify(marker)}\n`);
      const shell = shellBuildFor(outDir);
      const worker = await buildWorker(workerEntry, outDir, { __SHELL_BUILD__: JSON.stringify(shell) });
      if (!worker.includes(shell.id)) throw new Error(`${SERVICE_WORKER_FILE} was not built for shell ${shell.id}`);
    },
  };
}
