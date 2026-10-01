# Icon Renderer

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Renders the pixel-art `LOGO` sprite from `web/src/components/pixel-sprites.ts` into the PWA PNG icons and `favicon.svg` in `web/public/`. It has no image library: `png.ts` encodes and decodes RGBA PNGs with `node:zlib`, so output is byte-reproducible and can be freshness-checked.

## Key Files

| File        | Description                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build.ts`  | CLI. `make icons` writes `web/public/icons/*` and `web/public/favicon.svg`; `make icons-check` (`--check`) compares pixel data and exits 1 listing stale files.                                   |
| `render.ts` | `APP_ICONS` layouts (`icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon-180.png`, `favicon-32.png`), `renderAppIcon`, `renderSprite`, `faviconSvg`, `spriteSvg`, `parseColor`. |
| `png.ts`    | `encodePng`, `decodePng`, `readChunks`, `scanlines`, `samePixels`, `PNG_SIGNATURE`. Uses RGBA 8-bit, filter 0, deflate level 9.                                                                   |

## For AI Agents

### Working In This Directory

- Never hand-edit `web/public/icons/*` or `web/public/favicon.svg`; change the sprite or layouts, then run `make icons`. `make check` runs `make icons-check`.
- Freshness compares decoded pixels (`samePixels`), not raw file bytes, and the favicon by exact string.
- The maskable icon must keep the logo inside the safe zone (`MASKABLE_SAFE_RADIUS_FRACTION`, 0.4); `frame: false` on maskable, apple-touch and favicon layouts is deliberate.
- A new icon file needs an entry in `APP_ICONS` and, if the PWA uses it, an entry in the web manifest (checked by `tests/web/manifest.test.ts`).

### Testing Requirements

- `tests/web/png.test.ts` covers `png.ts` and `render.ts` (including maskable safe zone); `tests/web/manifest.test.ts` decodes the committed icons. Run with `make test-web`, then `make icons` and `make icons-check`. Add the failing test in `tests/web/png.test.ts`.
- `build.ts` itself has no direct test; `make icons-check` is its check. No local stack needed.

### Common Patterns

- Named constants for PNG fields and layout fractions; pure functions returning `RgbaImage` (`{ width, height, rgba }`).
- Nearest-pixel scaling by integer `scale`, centered with `Math.floor`.

## Dependencies

### Internal

- `../../web/src/components/pixel-sprites.ts` (`LOGO`, `APP_ICON_BACKGROUND`, `APP_ICON_FRAME`, `Sprite`), `../../web/public/`

### External

- `node:zlib`, `node:fs`, `node:path`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
