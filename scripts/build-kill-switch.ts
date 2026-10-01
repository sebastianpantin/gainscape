import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildKillSwitch } from '../web/build/service-worker-plugin.ts';

const distDir = join(import.meta.dirname, '../web/dist');

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('web/dist/index.html is missing. Run your production build first, then make sw-kill-switch.');
  process.exit(1);
}
await buildKillSwitch(distDir);
console.log('web/dist/sw.js is now the kill switch: it deletes the shell caches, unregisters and reloads every tab.');
