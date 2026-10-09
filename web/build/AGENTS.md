# build

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-09

## Purpose

Node-side build tooling for the PWA: port resolution shared by Vite and Playwright, the reader of `web/changelog.yaml`, and the Vite plugin that turns the finished `web/dist/` into a precache manifest and compiles the service worker (`sw.js`) from `src/sw/`. It also provides the kill-switch builder used by `make sw-kill-switch`.

## Key Files

| File                       | Description                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ports.ts`                 | `webPort()` (`GAINSCAPE_WEB_PORT`, default 5173) and `previewPort()` (`GAINSCAPE_PREVIEW_PORT`, default web port minus 1000)                                                                                                                                                                                                                                                                              |
| `changelog.ts`             | `readChangelogEntries(path?)` parses and validates `web/changelog.yaml` with `parseChangelog` and keeps each entry's `prs` (for `scripts/changelog/unreleased.ts`). `readChangelog(path?)` strips `prs` through `toBundledReleases` (for the `__CHANGELOG__` define in `vite.config.ts` and for e2e specs). Also exports `CHANGELOG_PATH`.                                                                |
| `service-worker-plugin.ts` | `serviceWorkerPlugin()` (build-only plugin; in `closeBundle` writes `.vite/gainscape-build.json`, hashes the precached files into a `ShellBuild`, then bundles `src/sw/service-worker.ts` as an IIFE `sw.js` with `__SHELL_BUILD__` defined). Also exports `shellBuildFor(outDir)`, `buildKillSwitch(outDir)`, `killSwitchRefusal(outDir, allowLocal)`, `readBuildMarker`, `KILL_SWITCH_ALLOW_LOCAL_FLAG` |

## For AI Agents

### Working In This Directory

- What gets precached is decided by `precacheEntries` in `../src/pwa/shell-rules.ts`, not here. Change the rules there.
- The build id is the first `BUILD_ID_LENGTH` hex chars of the SHA-256 over `shellBuildManifestText`. `sw.js` embeds it, so any asset change yields a new worker and triggers the update flow.
- The build throws if `/index.html` or `/manifest.webmanifest` is missing from the precache list, or if the compiled worker does not contain the build id. Keep those guards.
- `killSwitchRefusal` blocks the kill switch unless the build marker says production mode with a hosted `VITE_SUPABASE_URL`, unless `GAINSCAPE_KILL_SWITCH_ALLOW_LOCAL=1`. Only the e2e suite sets that flag.
- `../../scripts/build-kill-switch.ts`, `../../playwright.config.ts`, `../../playwright.pwa.config.ts` and `../../e2e/support/pwa.ts` import from this directory. Keep exported names stable or update them together.

### Testing Requirements

`tests/web/changelog-file.test.ts` imports `changelog.ts` (the committed file is valid, `prs` stay on the entries and leave the bundle, a file out of order is rejected). No Vitest file imports `ports.ts` or `service-worker-plugin.ts`; they are covered end to end by `../../e2e/pwa/offline.spec.ts`, `update.spec.ts` and `installable.spec.ts` (through `../../e2e/support/pwa.ts`, which calls `shellBuildFor`). Pure rules belong in `src/pwa/shell-rules.ts` with a test in `../../tests/web/shell-rules.test.ts`; put new decision logic there first. Run `make e2e-pwa` (needs the stack and a Chromium).

### Common Patterns

- Inner `vite build` with `configFile: false` and `publicDir: false` compiles each worker entry as a minified IIFE named `gainscapeShell`.
- Functions that touch the filesystem take `outDir` as a parameter so tests can point at any directory.

## Dependencies

### Internal

- `../src/pwa/shell-rules.ts`, `../src/sw/service-worker.ts`, `../src/sw/kill-switch.ts`

### External

- `vite` (`build`, `Plugin`), `node:crypto`, `node:fs`, `node:path`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
