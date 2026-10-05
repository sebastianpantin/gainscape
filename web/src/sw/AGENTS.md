# sw

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Entry points for the two service worker variants that `web/build/service-worker-plugin.ts` compiles into `web/dist/sw.js`. There is no checked-in `sw.js`: the plugin bundles `service-worker.ts` (the normal offline shell worker) during every `vite build`, and `scripts/build-kill-switch.ts` can replace it with `kill-switch.ts` to retire a broken worker in production.

## Key Files

| File                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service-worker.ts` | Shell worker. Reads the build-time `__SHELL_BUILD__` (build id plus per-file SHA-256). On `install` it fetches every precache entry with `cache: 'reload'`, verifies the digest, strips encoding headers, and writes all of them to the cache `gainscape-shell-<id>` (deleting a half-written new cache). On `activate` it deletes older `gainscape-shell-*` caches. On `fetch` it asks `shellDecision`: `network` passes through, `index` serves the cached `/index.html` for navigations, `precached` serves the cached file; both fall back to the network. A message of type `ACTIVATE_MESSAGE` calls `skipWaiting()`, so updates wait for the user The `notificationclick` handler focuses an open window or opens the registration scope. |
| `kill-switch.ts`    | Emergency worker. Skips waiting at install; on `activate` deletes every `gainscape-shell-*` cache, unregisters itself and navigates all window clients to their own URL to reload them. Also honours `ACTIVATE_MESSAGE`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `globals.d.ts`      | Declares `__SHELL_BUILD__` for the `tsconfig.sw.json` type check. `kill-switch.ts` does not use it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## For AI Agents

### Working In This Directory

- Workers run in a `ServiceWorkerGlobalScope`. They are type-checked by `tsconfig.sw.json` (lib `WebWorker`, no DOM, `types: []`), together with `../pwa/shell-rules.ts`. Do not import DOM, React or app modules here; share only through `../pwa/shell-rules.ts`, which must stay free of browser globals.
- Fetch routing logic belongs in `shellDecision` in `../pwa/shell-rules.ts` so it is unit-testable. Keep `service-worker.ts` as wiring.
- Never cache `/sb/` (Supabase proxy), non-GET, or cross-origin requests; `shellDecision` already enforces this.
- Any asset change changes the build id and so produces a new worker; the page-side update flow (`../pwa/update-flow.ts`) relies on `skipWaiting` only after the `ACTIVATE_MESSAGE`. Do not call `skipWaiting` unconditionally in `service-worker.ts` (the kill switch does, deliberately).
- The kill switch must stay buildable with no `__SHELL_BUILD__` define (`buildKillSwitch` passes an empty define map).

### Testing Requirements

- `tests/web/shell-rules.test.ts` covers the pure rules (`make test-web`). Add decision logic failing tests there first.
- The workers themselves have no unit tests. They are covered by `e2e/pwa/offline.spec.ts`, `e2e/pwa/update.spec.ts` and `e2e/pwa/installable.spec.ts` via `make e2e-pwa` (needs the stack and a built `web/dist`). Kill switch behaviour is exercised in `e2e/pwa/update.spec.ts` through `e2e/support/pwa.ts`.
- `make typecheck` runs `tsconfig.sw.json`; run it after editing.

### Common Patterns

- Always `event.waitUntil(...)` around async install/activate work.
- Messages are `{ type: ACTIVATE_MESSAGE }` objects, narrowed defensively from `unknown`.

## Dependencies

### Internal

- `../pwa/shell-rules.ts`, `../../build/service-worker-plugin.ts`, `../../../tsconfig.sw.json`, `../../../scripts/build-kill-switch.ts`

### External

- Service Worker, Cache Storage and `crypto.subtle` browser APIs

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
