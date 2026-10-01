import { join } from 'node:path';
import { buildKillSwitch } from '../web/build/service-worker-plugin.ts';

const distDir = join(import.meta.dirname, '../web/dist');
await buildKillSwitch(distDir);
console.log('web/dist/sw.js is now the kill switch: it deletes the shell caches, unregisters and reloads every tab.');
