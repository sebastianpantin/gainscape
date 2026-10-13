# tests

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

All Vitest suites, split by layer: `catalog/` (catalog generator and validator), `domain/` (the pure game engine), `web/` (pure web logic and static asset checks), `deploy/` (scripts and deploy and secrets rules), `balance/` (progression bands) and `integration/` (Edge Functions, SQL and RLS against the local stack). Playwright suites live in `../e2e/`. Each subdirectory except `deploy/` has its own `AGENTS.md`.

## Map

- Run one file or a suite (no stack unless noted):
  - catalog: `npx vitest run tests/catalog/validate.test.ts`, `make test-catalog`
  - domain: `make test-domain`
  - web: `make test-web`
  - deploy: `make test-deploy`
  - balance: `make sim-check`
  - integration (stack): `make test-integration`; run `make start` (or `make functions` on a running stack) before running a single file.
- `deploy/` also covers secret handling in the Edge Functions: `api-keys.test.ts` stubs `Deno` to test `_shared/api-keys.ts`; `function-secrets.test.ts` checks that no function reads a key at module load; `token-check.test.ts` covers telling a rejected JWT (401) from an auth outage (503); `gitleaks-config.test.ts` checks the `stronglifts_5x5` allowlist matches every template file, frozen `key@version` files included; `export-format.test.ts` pins the export's top-level keys to `EXPORT_FORMAT_VERSION`; `changelog-node-load.test.ts` imports `web/build/changelog.ts` in plain Node without the `@domain` alias, as `make deploy` does; `ci-changes.test.ts` walks the runtime import closure of `tests/integration/` and the stack scripts, which must all trigger `backend`.
- `ip-denylist.txt`: lowercase terms, one per line. `scripts/catalog/validate.ts` rejects any catalog key, name or text that contains one as a whole word (case-insensitive), to keep third-party IP out of the seed data. After adding a term, run `make test-catalog` and `make catalog`.

## Rules and gotchas

- Only `tests/**/*.test.ts` run. Helpers (`fixtures.ts`, `local-stack.ts`, `draft-store.contract.ts`, ...) must not end in `.test.ts`.
- `vitest.config.ts` runs three projects in order: `unit` (parallel files), `integration` (4 workers; isolation comes from fresh users), then `integration-serial`, one file at a time, for files that change or count global state (`auth-email`, `catalog`, `crafting`, `loot` truncates loot tables to prove they are append-only, `program-enrollments` inserts and deletes a template row, `rate-limits`). A new integration file that edits shared rows (catalog retirement, rate-limit rules, Mailpit) belongs in `INTEGRATION_FILES_SHARING_GLOBAL_STATE`.
- `testTimeout` is 30 s and `hookTimeout` 60 s; a slower test (the balance simulation) passes an explicit timeout.
- Import engine code as `@domain/index.ts`, or a program-engine module that `index.ts` does not export (`@domain/program-state.ts`). Import web and script code by relative path.
- No comments, `it.skip` or `.only`.
- Shared contract suites are exported functions (`describeDraftStoreContract`) called from thin `*.test.ts` files. Some tests read source files as text to enforce repo rules (`domain/purity.test.ts`, `web/licenses.test.ts`, `web/contrast.test.ts`).
- To prove a validator catches one problem, mutate a `structuredClone` of real data.

## Testing

Pick the lowest layer that can express the behaviour, write the failing test first, run only that file, then widen.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
