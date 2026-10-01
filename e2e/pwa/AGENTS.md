# e2e/pwa

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Playwright specs for the installed-app behaviour: manifest installability, the service worker's offline shell, never caching Supabase traffic, the update flow with hash verification, and the kill switch. They run against `vite preview` of a built app (`web/dist`) over plain http with service workers allowed, using `../../playwright.pwa.config.ts`.

## Key Files

| File                  | Description                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `installable.spec.ts` | The app is installable (manifest and icons).                                                                                                                                                       |
| `offline.spec.ts`     | Installed shell cold-starts offline and syncs later; worker never stores or answers Supabase traffic; every tab renders offline without an uncaught error; offline sign-out with an expired token. |
| `update.spec.ts`      | A new version reloads safely (swaps the built worker via `replaceBuildId`); files not matching their hashes never replace the shell; the kill switch retires the worker and reloads.               |

## For AI Agents

### Working In This Directory

- Config: `timeout` 120 s, `workers: 1`, `fullyParallel: false`, no retries, `serviceWorkers: 'allow'`, base URL `http://localhost:<previewPort()>`. The web server is `npx vite preview web` with `GAINSCAPE_PLAIN_HTTP=1` and `reuseExistingServer: false`, so a stale preview is never reused.
- The specs read and rewrite the built service worker file in `web/dist`. Every spec that does so must restore it in `test.afterEach` (`restoreServiceWorker(original)`), as `update.spec.ts` does. Leaving a modified worker breaks later runs.
- These tests need a fresh build: `make e2e-pwa` runs `make build-local` first. Running `npx playwright test -c playwright.pwa.config.ts` directly uses whatever is in `web/dist`, so rebuild after any change to `web/src`, `web/build/service-worker-plugin.ts` or `web/src/pwa/`.
- Offline uses `context.setOffline(true/false)` for the browser context, plus CDP `markPageOffline` (`e2e/support/pwa.ts`) on cold pages so a freshly opened page is also offline.
- Several tests set 180 to 240 s timeouts locally because they wait for worker install, update and activation.

### Testing Requirements

- Prerequisites: stack and Edge Functions running (`make start`). Run all: `make e2e-pwa`. One file after a build: `make build-local && GAINSCAPE_PLAIN_HTTP=1 npx playwright test -c playwright.pwa.config.ts e2e/pwa/update.spec.ts`.
- Red-green loop: put pure decisions (cache names, path allow lists, update state) in `web/src/pwa/shell-rules.ts` or `update-flow.ts` and write the failing unit test in `../../tests/web/shell-rules.test.ts` or `update-flow.test.ts` first. Add a failing spec here only for behaviour that needs a real worker, then implement, rebuild and rerun.
- CI runs this as the last `stack` job step.

### Common Patterns

- `waitForController(page)` after first load, so the worker controls the page before going offline.
- `cachedPaths(page)` to assert exactly what the shell cache holds.
- `builtShell()` gives the expected build id and file hashes from `web/dist`; `shellCacheName` and `SHELL_CACHE_PREFIX` come from `web/src/pwa/shell-rules.ts`.
- `uniqueUsername(prefix)` for users; `register`, `logExercise` from `../support/app.ts`.
- `expectNoAxeViolations` in places where an update banner appears.

## Dependencies

### Internal

- `../support/app.ts`, `../support/pwa.ts`, `../support/a11y.ts`
- `../../web/build/service-worker-plugin.ts`, `../../web/src/pwa/shell-rules.ts`, `../../web/src/offline/finish-lock.ts`
- `../../web/dist` (build output, ignored by git)

### External

- `@playwright/test`, Chromium

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
