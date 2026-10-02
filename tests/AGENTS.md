# tests

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

All Vitest suites live here, split by layer: `catalog/` (YAML catalog generator and validator), `domain/` (the pure game engine), `web/` (pure web logic and static asset checks), `balance/` (progression simulation bands) and `integration/` (Edge Functions, SQL and RLS against the local Supabase stack). Playwright suites are not here; they live in `../e2e/`. The directory also holds `ip-denylist.txt`, the data file the catalog validator reads.

## Key Files

| File              | Description                                                                                                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ip-denylist.txt` | One lowercase term per line (for example `runescape`, `jagex`, `twisted bow`, `grand exchange`). `scripts/catalog/validate.ts` (`DENYLIST_PATH`, `readDenylist`) rejects any catalog name or text that contains a listed term, to keep third-party IP out of the seed data. |

## Subdirectories

| Directory      | Purpose                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog/`     | Catalog generator determinism and validator rules (see `catalog/AGENTS.md`)                                                                           |
| `domain/`      | Unit and property tests of the pure engine, plus purity enforcement (see `domain/AGENTS.md`)                                                          |
| `web/`         | Pure web logic, offline draft store contract, PWA rules, static asset checks (see `web/AGENTS.md`)                                                    |
| `balance/`     | Progression-band simulation test behind `make sim-check` (see `balance/AGENTS.md`)                                                                    |
| `deploy/`      | Deploy guard rules and secret-handling checks for `scripts/deploy/` and the Edge Functions, plus the local-stack and loot-secret guards in `scripts/` |
| `integration/` | Stack-backed tests of Edge Functions, RPCs, RLS, auth email (see `integration/AGENTS.md`)                                                             |

## For AI Agents

### Working In This Directory

- `../vitest.config.ts` includes only `tests/**/*.test.ts`. Helpers (`fixtures.ts`, `local-stack.ts`, `draft-store.contract.ts`, ...) deliberately do not end in `.test.ts` so Vitest does not run them as suites. Keep that naming.
- `vitest.config.ts` defines three projects that run in order. `unit` (`balance`, `catalog`, `domain`, `web`) runs files in parallel. `integration` runs files on 4 workers at once; isolation comes from fresh users. `integration-serial` then runs, one file at a time, the files that change or count global state (`auth-email`, `catalog`, `crafting`, `loot` (it truncates loot tables to prove they are append-only), `rate-limits`). A new integration file that edits shared rows (catalog retirement, rate-limit rules, Mailpit) belongs in `INTEGRATION_FILES_SHARING_GLOBAL_STATE`. `testTimeout` is 30 s and `hookTimeout` is 60 s. A test that needs more (the balance simulation) passes an explicit timeout to its hook or test.
- The `@domain` alias maps to `supabase/functions/_shared/domain`. Import engine code as `@domain/index.ts` (or `@domain/types.ts`); web and script code is imported by relative path.
- No comments, no `it.skip`, no `.only`. Lint enforces the comment ban in tests too.
- `ip-denylist.txt` is test-owned data consumed by production tooling. When adding a term, keep it lowercase, one per line, and run `make test-catalog` and `make catalog` to confirm the real catalog still passes.

### Testing Requirements

Pick the lowest layer that can express the behaviour, write the failing test first, run only that file, then widen.

| Layer       | Run one file                                    | Run the suite           | Stack |
| ----------- | ----------------------------------------------- | ----------------------- | ----- |
| catalog     | `npx vitest run tests/catalog/validate.test.ts` | `make test-catalog`     | No    |
| domain      | `npx vitest run tests/domain/xp.test.ts`        | `make test-domain`      | No    |
| web         | `npx vitest run tests/web/units.test.ts`        | `make test-web`         | No    |
| deploy      | `npx vitest run tests/deploy/rules.test.ts`     | `make test-deploy`      | No    |
| balance     | `npx vitest run tests/balance`                  | `make sim-check`        | No    |
| integration | `npx vitest run tests/integration/rls.test.ts`  | `make test-integration` | Yes   |

Integration files need `make start` (or `make functions` on a running stack) first; `make test-integration` runs `make functions` itself.

### Common Patterns

- Name tests after behaviour, with `describe` per unit and `it` per rule; assertions use `expect(...)` from `vitest`.
- Mutating a deep clone of real data to prove a validator catches one problem (`structuredClone(real)` in `tests/catalog/validate.test.ts`).
- Shared contract suites exported as a function (`describeDraftStoreContract`) and invoked from two thin `*.test.ts` files.
- Reading source files as text to enforce repo rules (`tests/domain/purity.test.ts`, `tests/web/licenses.test.ts`, `tests/web/contrast.test.ts`).

## Dependencies

### Internal

- `../supabase/functions/_shared/domain/` via `@domain/*`
- `../web/src/` (lib, offline, pwa, features, components)
- `../scripts/catalog/`, `../scripts/balance/`, `../scripts/icons/`
- `../vitest.config.ts`, `../Makefile`

### External

- Vitest, fast-check (domain, web units), fake-indexeddb (draft store), `postgres` and `@supabase/supabase-js` (integration)

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
