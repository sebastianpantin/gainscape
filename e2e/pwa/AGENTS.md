# e2e/pwa

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Playwright specs for installed-app behaviour: manifest installability, the service worker's offline shell, never caching Supabase traffic, the update flow with hash verification, and the kill switch. They run against `vite preview` of a built app (`web/dist`) over plain http with service workers allowed (`../../playwright.pwa.config.ts`).

## Map

- `installable.spec.ts`, `offline.spec.ts`, `update.spec.ts`. Helpers are in `../support/pwa.ts` (`waitForController`, `cachedPaths`, `builtShell`, `markPageOffline`, `replaceBuildId`, `restoreServiceWorker`).

## Rules and gotchas

- Config: 120 s timeout, one worker, no retries locally and one on CI (`runSettings`), `serviceWorkers: 'allow'`, `GAINSCAPE_PLAIN_HTTP=1`, `reuseExistingServer: false` so a stale preview is never reused.
- These tests use whatever is in `web/dist`. `make e2e-pwa` runs `make build-local` first; when running one file directly, rebuild after any change to `web/src`, `web/build/service-worker-plugin.ts` or `web/src/pwa/`.
- Specs rewrite the built service worker. Every spec that does must restore it in `test.afterEach` (`restoreServiceWorker(original)`), or later runs break.
- Go offline with `context.setOffline(true)` plus CDP `markPageOffline` on cold pages, so a freshly opened page is offline too. Call `waitForController(page)` first so the worker controls the page.
- Offline screen opens are timed against `OFFLINE_TAB_BUDGET_MS` (3 s), so a screen that waits on the network offline fails (the old behaviour waited 7 to 8 s on postgrest-js GET retries). Wait for the new screen's `main` element, not any heading, or a stale screen passes.
- The worker must never store or answer Supabase traffic, and files that do not match their hashes must never replace the shell.
- Several tests set 180 to 240 s timeouts because they wait for worker install, update and activation.

## Testing

- Needs the stack (`make start`). All: `make e2e-pwa`. One file: `make build-local && npx playwright test -c playwright.pwa.config.ts e2e/pwa/update.spec.ts`.
- Put pure decisions (cache names, path allow lists, update state) in `web/src/pwa/shell-rules.ts` or `update-flow.ts` and write the failing unit test in `tests/web/` first. Add a spec here only for behaviour that needs a real worker.
- The manual `e2e` workflow runs this suite as its last step.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
