# build

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Node-side build tooling for the PWA: port resolution shared by Vite and Playwright (`ports.ts`), the reader of `web/changelog.yaml` (`changelog.ts`), and the Vite plugin that hashes the finished `web/dist/` into a precache manifest and compiles `sw.js` from `src/sw/` (`service-worker-plugin.ts`). It also builds the kill switch for `make sw-kill-switch`.

## Rules and gotchas

- What gets precached is decided by `precacheEntries` in `../src/pwa/shell-rules.ts`, not here.
- The build id is the first `BUILD_ID_LENGTH` hex chars of the SHA-256 over the shell manifest text. `sw.js` embeds it, so any asset change yields a new worker and triggers the update flow.
- The build throws if `/index.html` or `/manifest.webmanifest` is missing from the precache list or the compiled worker lacks the build id. Keep those guards.
- `killSwitchRefusal` blocks the kill switch unless the build marker says production mode with a hosted `VITE_SUPABASE_URL`, or `GAINSCAPE_KILL_SWITCH_ALLOW_LOCAL=1`. Only the e2e suite sets that flag.
- `changelog.ts` keeps each entry's `prs` for `scripts/changelog/unreleased.ts` and strips them from the bundle. It is loaded by plain Node (`make deploy`), without Vite's `@domain` alias.
- `scripts/build-kill-switch.ts`, the Playwright configs and `e2e/support/pwa.ts` import from here. Keep exported names stable or update them together.
- Functions that touch the filesystem take `outDir` as a parameter.

## Testing

- `tests/web/changelog-file.test.ts` covers `changelog.ts`; `tests/deploy/changelog-node-load.test.ts` the plain Node load.
- `ports.ts` and the plugin are covered end to end by `e2e/pwa/` (`make e2e-pwa`, stack). Put new decision logic in `src/pwa/shell-rules.ts` with a test in `tests/web/shell-rules.test.ts` first.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
