import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { readChangelog } from './build/changelog.ts';
import { previewPort, webPort } from './build/ports.ts';
import { serviceWorkerPlugin } from './build/service-worker-plugin.ts';

const localSupabaseApi = `http://127.0.0.1:${process.env.SUPABASE_API_PORT ?? 54321}`;

const supabaseProxy = {
  '/sb': { target: localSupabaseApi, changeOrigin: true, rewrite: (path: string) => path.replace(/^\/sb/, '') },
};

function appBuild(): string {
  try {
    const commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return `${commit} ${new Date().toISOString().slice(0, 10)}`;
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), ...(process.env.GAINSCAPE_PLAIN_HTTP ? [] : [basicSsl()]), serviceWorkerPlugin()],
  resolve: {
    alias: { '@domain': fileURLToPath(new URL('../supabase/functions/_shared/domain', import.meta.url)) },
  },
  define: { __CHANGELOG__: JSON.stringify(readChangelog()), __APP_BUILD__: JSON.stringify(appBuild()) },
  server: {
    host: true,
    port: webPort(),
    fs: { allow: ['..'] },
    proxy: supabaseProxy,
  },
  preview: {
    host: true,
    port: previewPort(),
    strictPort: true,
    proxy: supabaseProxy,
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
