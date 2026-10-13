# Icon Renderer

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Renders the pixel-art `LOGO` sprite from `web/src/components/pixel-sprites.ts` into the PWA PNG icons and `favicon.svg` in `web/public/`. There is no image library: `png.ts` encodes and decodes RGBA PNGs with `node:zlib`, so output is reproducible and can be freshness-checked. `build.ts` is the CLI (`make icons`, `make icons-check`); `render.ts` holds the layouts (`APP_ICONS`).

## Rules and gotchas

- Never hand-edit `web/public/icons/*` or `web/public/favicon.svg`; change the sprite or layouts, then `make icons`. `make check` runs `make icons-check`.
- Freshness compares decoded pixels (`samePixels`), not raw bytes, and the favicon by exact string.
- The maskable icon keeps the logo inside the safe zone (`MASKABLE_SAFE_RADIUS_FRACTION`, 0.4). `frame: false` on the maskable, apple-touch and favicon layouts is deliberate.
- A new icon file needs an `APP_ICONS` entry and, if the PWA uses it, a manifest entry (`tests/web/manifest.test.ts`).

## Testing

`tests/web/png.test.ts` (encoder, rendering, maskable safe zone) and `tests/web/manifest.test.ts` (committed icons) via `make test-web`, then `make icons` and `make icons-check`. No stack.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
