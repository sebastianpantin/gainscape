# sw

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Entry points for the two service worker variants that `web/build/service-worker-plugin.ts` compiles into `web/dist/sw.js`. There is no checked-in `sw.js`: every `vite build` bundles `service-worker.ts` (the offline shell worker), and `scripts/build-kill-switch.ts` can replace it with `kill-switch.ts` to retire a broken worker in production.

## Map

- `service-worker.ts`: the shell worker. Install precaches and verifies, activate deletes older `gainscape-shell-*` caches, fetch routes through `shellDecision`.
- `kill-switch.ts`: deletes every shell cache, unregisters and reloads every window.
- `globals.d.ts`: declares `__SHELL_BUILD__`.

## Rules and gotchas

- Install fetches every precache entry with `cache: 'reload'`, verifies its SHA-256 against `__SHELL_BUILD__`, strips encoding headers, and writes all of them to `gainscape-shell-<id>`, deleting a half-written new cache. A file that does not match its hash never replaces the shell.
- Never cache `/sb/` (the Supabase proxy), non-GET or cross-origin requests; `shellDecision` enforces this. Put routing logic there, not here, so it stays unit-testable.
- `skipWaiting()` runs only on `ACTIVATE_MESSAGE`, so updates wait for the user and the page-side finish lock (`../pwa/update-flow.ts`). Never call it unconditionally in `service-worker.ts`; the kill switch does so deliberately.
- The kill switch must build with no `__SHELL_BUILD__` define (`buildKillSwitch` passes an empty define map).
- Workers are type-checked by `tsconfig.sw.json` (WebWorker lib, no DOM) together with `../pwa/shell-rules.ts`. Do not import DOM, React or app modules; share only through `shell-rules.ts`.
- Wrap async install and activate work in `event.waitUntil(...)`. Narrow messages from `unknown`.

## Testing

- `tests/web/shell-rules.test.ts` for the pure rules (`make test-web`); add failing decision tests there first.
- The workers: `e2e/pwa/` (`make e2e-pwa`, stack and a built `web/dist`), including the kill switch in `update.spec.ts`. Run `make typecheck` after editing.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
