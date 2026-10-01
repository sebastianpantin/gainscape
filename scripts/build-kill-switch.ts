import { join } from 'node:path';
import {
  buildKillSwitch,
  KILL_SWITCH_ALLOW_LOCAL_FLAG,
  killSwitchRefusal,
} from '../web/build/service-worker-plugin.ts';

const distDir = join(import.meta.dirname, '../web/dist');

const refusal = killSwitchRefusal(distDir, process.env[KILL_SWITCH_ALLOW_LOCAL_FLAG] === '1');
if (refusal) {
  console.error(
    `Refusing to build the kill switch: ${refusal}. Run your production build (mode production, VITE_SUPABASE_URL set) first, then make sw-kill-switch.`,
  );
  process.exit(1);
}
await buildKillSwitch(distDir);
console.log('web/dist/sw.js is now the kill switch: it deletes the shell caches, unregisters and reloads every tab.');
