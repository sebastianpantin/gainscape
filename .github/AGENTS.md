# GitHub

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

GitHub configuration: two workflows (see `workflows/AGENTS.md`). `workflows/ci.yml` runs on every pull request: `changes` (`make ci-changes`, Node only), then `checks` (no stack), `backend` (Supabase in Docker: integration and pgTAP) and `smoke` (the `@smoke` e2e tests in Chromium) in parallel. `workflows/e2e.yml` runs the browser suites nightly on `main` and by hand (`gh workflow run e2e.yml --ref <branch>`), for example before a release.

## Rules and gotchas

- The `Protect main` ruleset requires the `Checks and unit tests` and `Backend integration and pgTAP` checks by those job names, so renaming a job in `ci.yml` blocks every merge until the ruleset is updated. A job skipped by `if:` counts as passing, which is why a skipped `backend` does not block.
- `checks`, `backend` and `smoke` need only `changes`, so a failing `checks` no longer skips the stack jobs; it still blocks the merge as a required check. Each uses `if: !cancelled()` so a failed `changes` (empty outputs) runs every job instead of skipping the required ones, which would count as passing.
- `checks` reads `needs.changes.outputs.code`. A documentation-only PR (`*.md`, `docs/`) runs only `make format-check docs-check secrets-scan`. Otherwise it runs `make check`, `make test-unit` (every unit layer, balance included) and `make build`. The ESLint and Prettier caches use `--cache-strategy content`, so a restored cache is valid on a fresh checkout; ESLint has no type-aware rules, which keeps its per-file cache safe.
- `backend` runs unless `ci-changes` reports `backend=false`; an empty output still runs it. Add a new backend-relevant path to `scripts/ci-changes.ts`; `tests/deploy/ci-changes.test.ts` fails when a value import of the integration tests or stack scripts falls outside the list.
- `smoke` (`Browser smoke tests`) runs unless `ci-changes` reports `ui=false`. It exists because the nightly e2e workflow runs after a merge, so a PR that only touches screens had no runtime test. It is not a required check yet; add it to the ruleset once it has proven stable. The same coverage test fails when a value import of the chromium e2e suite falls outside the UI list. Keep `@smoke` to a handful of tests (minutes, not the full suite).
- CI only calls `make` targets. Add a Makefile target first, then a step, so local and CI runs stay identical.
- Third-party actions are pinned to full commit SHAs with a version comment (YAML is not covered by `no-comments`). Keep that when updating them.
- `CHROMIUM_PATH=` is passed empty so Playwright uses its own Chromium rather than the system one the Makefile would find.
- `make ci-start` excludes heavy Supabase services (`CI_EXCLUDED`) and writes `web/.env.development.local`.
- e2e runs chromium and webkit in two shards each, plus `make -k e2e-pwa e2e-pages` (`-k` so a failing PWA suite still runs the Pages suite), with `fail-fast: false`. Failures upload logs, the html report and traces.
- Never add a deploy or `supabase config push` step (`docs/production-auth.md`).

## Testing

No test for the workflows. Verify each step locally with the same `make` target; a change is confirmed only by a green run on a pull request.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
