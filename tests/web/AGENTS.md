# tests/web

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Stack-free Vitest suites for the web app's pure logic and its static build inputs: offline drafts and sync, auth restore, the query cache rules, program following, history editing, the PWA shell and update rules, sprites and icons, the manifest, font licenses and colour contrast. They run in Node, not a browser, and import from `web/src/` (sometimes `scripts/` and `@domain/*`) by relative path.

## Map

- Most files are named after the module they test: `lib/foo-rules.ts` is tested in `foo-rules.test.ts`, and `offline/`, `pwa/` and `features/*` modules follow the same pattern.
- Helpers, not suites:
  - `draft-store.contract.ts`: `describeDraftStoreContract`, the shared `DraftStore` contract.
  - `memory-storage.ts`: an in-memory `Storage`.
  - `custom-program-fixture.ts`: a custom template shaped like the output of `publish_program`, shared by the enroll and follow tests.
- The draft store contract runs twice: `draft-store.idb.test.ts` (fake-indexeddb) and `draft-store.local.test.ts` (`MemoryStorage`).
- Test files whose names do not match the module:
  - `auth-session.test.ts`: `lib/auth-restore.ts`
  - `items.test.ts`: `lib/item-rules.ts`, run against the real catalog YAML
  - `standing.test.ts`: `lib/standing-rules.ts`
  - `profile.test.ts`: `lib/profile-rules.ts`
  - `program-active.test.ts`: `activeProgram`
  - `program-rule-boundaries.test.ts`: label and boundary helpers of `program-enroll-rules.ts`
  - `hold-draft.test.ts`: hold drafts in `offline/draft-format.ts`
  - `program-draft.test.ts`: the draft's program fields
  - `social-rules.test.ts`: also `lib/rate-limit.ts`
  - `rest-timer-rules.test.ts`: also `rest-timer-store.ts`
  - `training-device-rules.test.ts`: also `training-device-store.ts`
  - `user-device-data.test.ts`: `companion-pet-store.ts`
  - `finish-sync.test.ts`: `offline/finish-lock.ts`
  - `screen-cache-saves.test.ts`: the online cache saves of the cache-first loaders and of `programs.ts`
  - `program-list-cache.test.ts`, `standing-cache.test.ts`, `profile-cache.test.ts`, `collection-cache.test.ts`: zod schemas of the `offline/*-cache.ts` modules
- Static inputs:
  - `pixel-sprites.test.ts`, `png.test.ts`, `manifest.test.ts`: sprites, icon rendering, manifest, shortcuts and screenshots.
  - `licenses.test.ts`: fonts.
  - `contrast.test.ts`: `styles/tokens.css`.
  - `changelog-file.test.ts`: the committed `web/changelog.yaml`.

## Rules and gotchas

- Only `*.test.ts` files are suites. Helper files must not match that pattern.
- To change how drafts are stored, add the failing case to `draft-store.contract.ts` first. Both store suites then turn red, and both IndexedDB and the `localStorage` fallback are held to it.
- `user-device-data.test.ts` scans `web/src` for every `gainscape.` key name and fails on one it does not write. A new per-user store must be added both to this test and to `forgetUserDeviceData`.
- `query-freshness-rules.test.ts` fails until every query key is placed in `QUERY_ROOTS_CHANGED_BY`, `ALWAYS_STALE_QUERY_ROOTS` or the `skills` catalog. Place the new query; do not loosen the test.
- `query-client.test.ts` pins the client defaults: no retry, `networkMode: 'always'`, and `staleTime` from `staleTimeFor`.
- `licenses.test.ts`, `contrast.test.ts`, `pixel-sprites.test.ts` and `manifest.test.ts` read source files as text.
  - A new font import, colour token, sprite colour or icon changes what they assert. Fix the licenses folder, the tokens or the assets, not the test.
  - `contrast.test.ts` reads only `--name: #hex;` declarations.
  - Sprites may use only colours that `tokens.css` lists.
  - Manifest screenshots must be under 200 KB, at `SCREENSHOT_SIZE`.
  - Shortcuts must be real routes (checked through `routeTitle`).
- `shell-rules.test.ts` keeps the manifest screenshots out of the service worker precache.
- `glossary.test.ts` requires each `question` to be distinct and never to contain another, so e2e lookups by exact name never collide.
- Some suites mock `lib/supabase.ts`, because it reads `window.location` and `import.meta.env` at import time: `account.test.ts`, `screen-cache-saves.test.ts`, `queries.test.ts` and `query-freshness-rules.test.ts`. `save-bodyweight.test.ts` uses a mocked client instead. `catalog-cache.test.ts` needs no mock because it imports types only.
- `workout-help.test.ts` includes balance checks: Simple levels and the lowest RPE must stay below the RIR that counts only for e1RM, and RIR 6 must reach it. A change to `domain/balance.ts` can break it.
- React components are not rendered here. Put decisions into pure functions (`lib/*-rules.ts`, `offline/*`, `features/**/…-rules.ts`) and cover the wiring in `e2e/`. `web/src/sw/*` is covered only through `pwa/shell-rules.ts` here and by `e2e/pwa/`.
- Browser-only behaviour (service workers, several tabs, a real IndexedDB failure) belongs in Playwright.

## Testing

- Run the suite with `make test-web` (no stack), or one file with `npx vitest run tests/web/<file>.test.ts`.
- Write the failing test in the file named after the `web/src` module, and create it if it does not exist.
- For isolated IndexedDB, use `import 'fake-indexeddb/auto'` plus a `new IDBFactory()` per harness. Use fixed ISO timestamps and fixed UUIDs, never real clocks. fast-check is available for properties.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
