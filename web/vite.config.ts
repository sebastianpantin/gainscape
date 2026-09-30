import { fileURLToPath } from 'node:url';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const localSupabaseApi = `http://127.0.0.1:${process.env.SUPABASE_API_PORT ?? 54321}`;
const webPort = Number(process.env.GAINSCAPE_WEB_PORT ?? 5173);

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), basicSsl()],
  resolve: {
    alias: { '@domain': fileURLToPath(new URL('../supabase/functions/_shared/domain', import.meta.url)) },
  },
  server: {
    host: true,
    port: webPort,
    fs: { allow: ['..'] },
    proxy: {
      '/sb': { target: localSupabaseApi, changeOrigin: true, rewrite: (path) => path.replace(/^\/sb/, '') },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
