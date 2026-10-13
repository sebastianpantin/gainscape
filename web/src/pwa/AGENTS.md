# pwa

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

The page-side PWA runtime: service worker registration, the update flow that swaps in a new worker safely, install prompt state, chunk-load recovery and the banners that surface them. It also owns `shell-rules.ts`, the rules and constants shared by the page, the worker (`../sw/`) and the build plugin (`../../build/`).

## Map

- `shell-rules.ts`: pure constants and rules for the shell cache (cache names, `sw.js`, precache list, build manifest). Imported by three runtimes.
- `update-flow.ts`: the update state machine over injected ports; `register-service-worker.ts` wires the real browser objects into it.
- `install-state.ts` (pure) and `install.ts` (module-level store of `beforeinstallprompt`): install card logic.
- `chunk-reload.ts`: reload once on Vite's `vite:preloadError`.
- `*.tsx`: the install card and the update and offline banners.

## Rules and gotchas

- `shell-rules.ts` runs in the page, the worker and Node. Keep it free of DOM and Node APIs and inside `tsconfig.sw.json`'s include.
- `precacheEntries` skips unpublished files such as `AGENTS.md`, which the Pages build deletes; `scripts/deploy/pages-headers.ts` uses the same predicate. Keep them in step or the worker precaches a 404.
- `update-flow.ts` only touches injected ports so tests can pass plain objects. Put new browser access in `register-service-worker.ts`.
- Updates never apply silently. The user clicks Reload, then the flow takes the finish lock (`../offline/finish-lock.ts`) so a workout finish is not interrupted, flushes open drafts (`flushOpenDraftSessions`), reloads and pings other tabs. Do not bypass these or a finish can be lost.
- `registerServiceWorker()` runs only in production builds, after `load`. `setUpdateUser` (from `App.tsx`) supplies the user id for the finish lock name.
- `install.ts` must be the first import in `../main.tsx`, or `beforeinstallprompt` can fire before the listener exists.
- `claimChunkReload` allows one reload per 10 s and returns false when storage is missing or throws, so a broken chunk never loops. It reloads only after open drafts flush; otherwise the error reaches `ScreenErrorBoundary`.
- `isIosSafari` also matches iPadOS, which reports a desktop user agent.
- Guard every localStorage access with try/catch for private-mode browsers.

## Testing

- Pure modules: `tests/web/shell-rules.test.ts`, `update-flow.test.ts`, `install-state.test.ts` (`make test-web`, no stack). Write the failing test there.
- `install.ts`, `register-service-worker.ts` and the components: `e2e/pwa/` (`make e2e-pwa`, needs the stack).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
