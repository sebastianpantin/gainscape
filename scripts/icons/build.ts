import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng, samePixels } from './png.ts';
import { APP_ICONS, faviconSvg, renderAppIcon } from './render.ts';

const publicDir = join(import.meta.dirname, '../../web/public');
const iconsDir = join(publicDir, 'icons');
const faviconPath = join(publicDir, 'favicon.svg');

function readOrNull(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

function check(): string[] {
  const stale: string[] = [];
  for (const layout of APP_ICONS) {
    const committed = readOrNull(join(iconsDir, layout.file));
    if (!committed || !samePixels(committed, renderAppIcon(layout))) stale.push(`icons/${layout.file}`);
  }
  if (readOrNull(faviconPath)?.toString('utf8') !== faviconSvg()) stale.push('favicon.svg');
  return stale;
}

function write(): void {
  mkdirSync(iconsDir, { recursive: true });
  for (const layout of APP_ICONS) writeFileSync(join(iconsDir, layout.file), encodePng(renderAppIcon(layout)));
  writeFileSync(faviconPath, faviconSvg());
}

if (process.argv.includes('--check')) {
  const stale = check();
  if (stale.length > 0) {
    console.error(`Icons are out of date: ${stale.join(', ')}. Run make icons.`);
    process.exit(1);
  }
  console.log('Icons match the sprites.');
} else {
  write();
  console.log(`Wrote ${APP_ICONS.length} icons and favicon.svg to web/public.`);
}
