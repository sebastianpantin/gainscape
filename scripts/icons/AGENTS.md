# Icon Renderer

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Renders the pixel-art `LOGO` sprite from `web/src/components/pixel-sprites.ts` into the PWA PNG icons, the iOS launch images and `favicon.svg` in `web/public/`. There is no image library: `png.ts` encodes and decodes RGBA PNGs with `node:zlib`, so output is reproducible and can be freshness-checked. `build.ts` is the CLI (`make icons`, `make icons-check`); `render.ts` holds the layouts (`APP_ICONS`, `SPLASH_SCREENS`).

## Rules and gotchas

- Never hand-edit `web/public/icons/*`, `web/public/splash/*` or `web/public/favicon.svg`; change the sprite or layouts, then `make icons`. `make check` runs `make icons-check`.
- `SPLASH_SCREENS` holds one portrait entry per distinct iOS (CSS width, CSS height, pixel ratio); the PNG is that size times the ratio, so iOS shows it instead of a blank screen. The logo is drawn at an integer scale near 35% of the width, because pixel art blurs at fractional scales. A new entry also needs its link in `web/index.html` (`tests/web/splash.test.ts`).
- Splash images go to `web/public/splash/`, never `icons/`: everything under `icons/` is precached by the service worker, and the launch images are only read by iOS at install and launch.
- Freshness compares decoded pixels (`samePixels`), not raw bytes, and the favicon by exact string.
- The maskable icon keeps the logo inside the safe zone (`MASKABLE_SAFE_RADIUS_FRACTION`, 0.4). `frame: false` on the maskable, apple-touch and favicon layouts is deliberate.
- A new icon file needs an `APP_ICONS` entry and, if the PWA uses it, a manifest entry (`tests/web/manifest.test.ts`).

## Testing

`tests/web/png.test.ts` (encoder, rendering, maskable safe zone, splash logo placement), `tests/web/manifest.test.ts` (committed icons) and `tests/web/splash.test.ts` (committed launch images and their `index.html` links) via `make test-web`, then `make icons` and `make icons-check`. No stack.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
