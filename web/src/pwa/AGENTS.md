# pwa

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

The page-side PWA runtime: worker registration, the update flow that safely swaps in a new service worker, the install prompt state, and the banners that surface these. It also owns `shell-rules.ts`, the pure rules and constants shared by the page, the worker (`../sw/`) and the build plugin (`../../build/`).

## Key Files

| File                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shell-rules.ts`             | Pure and browser-free. Constants (`SHELL_CACHE_PREFIX`, `SHELL_INDEX`, `SHELL_MANIFEST`, `SERVICE_WORKER_FILE` = `sw.js`, `ACTIVATE_MESSAGE`, `BUILD_ID_LENGTH`), `shellDecision`, `precacheEntries` (skips `isUnpublished` files such as `AGENTS.md`, which the Pages build deletes; `scripts/deploy/pages-headers.ts` uses the same predicate), `shellBuildManifestText`, `shellCacheName`. Type-checked by both tsconfigs                                                                         |
| `update-flow.ts`             | `createUpdateFlow(ports)` state machine over injected ports (registration, service worker container, `BroadcastChannel`, Web Locks, clock, reload, draft flush). States: idle, ready, applying, waiting_for_finish, reloading, failed. Checks for updates every 30 min and on visibility, posts `ACTIVATE_MESSAGE` to the waiting worker, waits on the finish lock (`finishLockName`) so a workout finish is not interrupted, flushes open drafts, then reloads and pings other tabs (`RELOAD_PING`) |
| `register-service-worker.ts` | Wires the real browser objects into `createUpdateFlow`. `registerServiceWorker()` only runs in production builds (`import.meta.env.PROD`) after `load`. Exposes `useUpdateFlow`, `useUpdateState` and `setUpdateUser` (called from `App.tsx`)                                                                                                                                                                                                                                                        |
| `chunk-reload.ts`            | `claimChunkReload(storage, now)`: true at most once per `CHUNK_RELOAD_COOLDOWN_MS` (10 s), stamping `gainscape.chunk-reload-at` in the given storage; false without storage or when it throws, so a broken chunk never loops. `reloadOnChunkLoadError()` (called from `../main.tsx`) reloads on Vite's `vite:preloadError` when the claim succeeds, otherwise the error reaches `ScreenErrorBoundary`                                                                                                |
| `install-state.ts`           | Pure install logic: `installState` (installed, promptable, ios_manual, unavailable), `isIosSafari` (including iPadOS desktop UA), `installCardKey`                                                                                                                                                                                                                                                                                                                                                   |
| `install.ts`                 | Module-level store capturing `beforeinstallprompt`/`appinstalled` at import time. Exposes `useInstallState`, `runsStandalone` (display-mode standalone or iOS `navigator.standalone`), `promptInstall`, and per-user localStorage helpers for the install card (`markInstallCardDue`, `readInstallCard`, `dismissInstallCard`, `forgetInstallCard`, `INSTALL_CARD_DUE`)                                                                                                                              |
| `InstallCard.tsx`            | Panel inviting install, shown when the card is due and the state is promptable or ios_manual; Safari shows manual Add to Home Screen instructions                                                                                                                                                                                                                                                                                                                                                    |
| `UpdateBanner.tsx`           | Banner per `UpdateState`: Reload, Updating, Saving your workout first, or failure with Try again                                                                                                                                                                                                                                                                                                                                                                                                     |
| `OfflineBanner.tsx`          | Status banner driven by the `online`/`offline` events                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## For AI Agents

### Working In This Directory

- `shell-rules.ts` is imported from three runtimes (page, worker, Node build). Keep it dependency-free with no DOM or Node APIs, and keep it inside `tsconfig.sw.json`'s include.
- `update-flow.ts` depends only on injected ports so it can be tested with fakes. Keep new browser access in `register-service-worker.ts`, not inside the flow.
- `install.ts` must be imported first in `../main.tsx`; otherwise `beforeinstallprompt` can fire before the listener exists.
- Updates never apply silently: the user clicks Reload, and the flow serialises with `finishLockName` from `../offline/finish-lock.ts` and `flushOpenDraftSessions` from `../offline/draft-session.ts`. Do not bypass these or a workout finish can be lost.
- localStorage access is try/catch guarded; keep that for private-mode browsers.
- `setUpdateUser` supplies the user id used for the finish lock name; `App.tsx` sets it on sign in and out.

### Testing Requirements

- `tests/web/shell-rules.test.ts`, `tests/web/update-flow.test.ts` and `tests/web/install-state.test.ts` cover the pure modules. Write the failing test there (`make test-web`, no stack).
- `install.ts`, `register-service-worker.ts` and the three components have no unit tests; they are covered by `e2e/pwa/installable.spec.ts`, `offline.spec.ts` and `update.spec.ts` (`make e2e-pwa`, needs the stack) and the banners by general e2e.

### Common Patterns

- Ports interfaces (`WorkerPort`, `RegistrationPort`, `ContainerPort`, `ChannelPort`, `LocksPort`) are minimal structural types so tests pass plain objects.
- Module-level store plus `useSyncExternalStore` for install state, flow state and offline status.

## Dependencies

### Internal

- `../offline/finish-lock.ts`, `../offline/draft-session.ts`, `../sw/service-worker.ts`, `../../build/service-worker-plugin.ts`, `../App.tsx`, `../main.tsx`

### External

- `react` (`useSyncExternalStore`, `useState`), Service Worker, Web Locks, BroadcastChannel and `beforeinstallprompt` browser APIs

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
