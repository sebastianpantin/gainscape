# tests/web

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Stack-free tests of the web app's pure logic and of static build inputs: offline draft storage and sync, auth session restore, history editing, social rules, PWA shell and update rules, unit conversion, catalog cache, sprites and icons, manifest, font licenses and colour contrast. Files here import from `web/src/` (and sometimes `scripts/` and the domain) by relative path. They run in Node, not a browser.

## Key Files

| File                                                                      | Description                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `draft-store.contract.ts`                                                 | `describeDraftStoreContract(name, createHarness)`: the shared behaviour contract for any `DraftStore` (round trip, stale put, tombstones, finished drafts, v1 deletion, fallback reconciliation). Exports `workout()` and `DraftStoreHarness`. Not a suite itself. |
| `draft-store.idb.test.ts`                                                 | Runs the contract against `createIdbDraftStore` over `fake-indexeddb`.                                                                                                                                                                                             |
| `draft-store.local.test.ts`                                               | Runs the contract against `createLocalDraftStore` with `MemoryStorage`.                                                                                                                                                                                            |
| `memory-storage.ts`                                                       | `MemoryStorage`, an in-memory `Storage` implementation for tests.                                                                                                                                                                                                  |
| `draft-format.test.ts`                                                    | `offline/draft-format.ts` records and `session-payload.ts` building.                                                                                                                                                                                               |
| `draft-session.test.ts`                                                   | `offline/draft-session.ts` lifecycle over a draft store.                                                                                                                                                                                                           |
| `finish-sync.test.ts`                                                     | Finish and sync flow, `finish-lock`.                                                                                                                                                                                                                               |
| `finish-retries.test.ts`                                                  | `startFinishRetries` honouring Retry-After and going online.                                                                                                                                                                                                       |
| `auth-session.test.ts`                                                    | `lib/auth-restore.ts` session restore and outage behaviour.                                                                                                                                                                                                        |
| `auth-links.test.ts`                                                      | `lib/auth-links.ts` parsing of email links.                                                                                                                                                                                                                        |
| `catalog-cache.test.ts`                                                   | `lib/catalog.ts` and `lib/catalog-cache.ts`.                                                                                                                                                                                                                       |
| `session-edit.test.ts`                                                    | `features/history/session-edit.ts` and `lib/history-rules.ts`.                                                                                                                                                                                                     |
| `cardio-rules.test.ts`                                                    | `lib/cardio-rules.ts` bounds, clamps and bout text.                                                                                                                                                                                                                |
| `items.test.ts`                                                           | `lib/item-rules.ts` against the real catalog and crafting recipes.                                                                                                                                                                                                 |
| `social-rules.test.ts`                                                    | `lib/social-rules.ts` and `lib/rate-limit.ts`.                                                                                                                                                                                                                     |
| `profile.test.ts`, `names.test.ts`, `units.test.ts`, `share-form.test.ts` | `lib/profile-rules.ts`, `lib/names.ts`, `lib/units.ts` (fast-check, including distance round trips), `features/exercises/share-form.ts`.                                                                                                                           |
| `shell-rules.test.ts`, `update-flow.test.ts`, `install-state.test.ts`     | `pwa/shell-rules.ts`, `pwa/update-flow.ts`, `pwa/install-state.ts`.                                                                                                                                                                                                |
| `pixel-sprites.test.ts`, `png.test.ts`, `manifest.test.ts`                | Sprite data vs crafting items, `scripts/icons/png.ts` and `render.ts`, web manifest and icon files.                                                                                                                                                                |
| `licenses.test.ts`                                                        | Every `@fontsource` family imported in `web/src/main.tsx` has a license entry under `web/public/licenses/`.                                                                                                                                                        |
| `contrast.test.ts`                                                        | Parses `web/src/styles/tokens.css` colour tokens and asserts WCAG contrast ratios.                                                                                                                                                                                 |

## For AI Agents

### Working In This Directory

- Only `*.test.ts` files are suites. `draft-store.contract.ts` and `memory-storage.ts` are helpers; keep them out of the `.test.ts` pattern.
- `licenses.test.ts` and `contrast.test.ts` read source files as text. Adding a font import, a colour token, or an icon changes what they assert; update the licenses folder or tokens accordingly, not the test.
- `web/src/sw/*` is type-checked by `tsconfig.sw.json` and exercised through `pwa/shell-rules.ts` here; the service worker itself is covered by `../../e2e/pwa/`.
- React components are not rendered here. Put decisions into pure functions (`lib/*-rules.ts`, `offline/*`) so they can be tested here, and cover wiring with `../../e2e/`.

### Testing Requirements

- Suite: `make test-web`; one file: `npx vitest run tests/web/draft-session.test.ts`. No stack.
- Failing test goes in the file named after the `web/src` module (module `lib/foo-rules.ts` gets `foo-rules.test.ts`). Create it if it does not exist.
- A change to draft storage semantics goes into `draft-store.contract.ts` so both IndexedDB and localStorage implementations are held to it; add the failing contract case first and both wrapper suites turn red.
- Browser-only behaviour (service workers, multi-tab, real IndexedDB failure) belongs in Playwright (`../../e2e/`).

### Common Patterns

- `import 'fake-indexeddb/auto'` plus `new IDBFactory()` per harness for isolated IndexedDB.
- Contract suite factory: `describeDraftStoreContract('name', async () => ({ store, storage, indexedDB }))`.
- Fixed ISO timestamps (`'2026-09-30T10:00:00.000Z'`) and fixed UUIDs in fixtures; no real clocks.

## Dependencies

### Internal

- `../../web/src/{lib,offline,pwa,features,components,styles}`, `../../web/public/`
- `../../scripts/icons/`, `../../scripts/catalog/load.ts`
- `@domain/*` (crafting, balance, types)

### External

- Vitest, fast-check, fake-indexeddb

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
