# GitHub

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-07

## Purpose

GitHub configuration. It holds two workflows. `workflows/ci.yml` runs on every pull request (changes never go straight to `main`), with two sequential jobs: `checks` ("Checks and unit tests", no stack) and `backend` ("Backend integration and pgTAP", Supabase in Docker without Playwright), which needs `checks` and runs only when `make ci-changes` reports a backend input. A documentation-only pull request (`*.md` or `docs/`) still runs `checks`, but only `make format-check secrets-scan`, and skips `backend`. `workflows/e2e.yml` runs the browser suites weekly (`schedule`, Mondays, on `main`) and when started by hand (`workflow_dispatch`), for example before a release. `main` has no branch protection, so merge only after `checks` and `backend` pass; a skipped `backend` counts as fine. If branch protection is ever added, note that a job skipped by `if:` counts as passing.

## Key Files

| File                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflows/ci.yml`  | Both jobs on `ubuntu-24.04`, Node 24, read-only `contents` permission, concurrency group per ref with cancel-in-progress, `pull_request` trigger only. `checks` (20 min): sets up Deno, `make ci-changes` (step `changes`, outputs `code` and `backend`; only `backend` is a job output), `npm ci`, then `make format-check secrets-scan` when `code` is `false`, otherwise `make check`, `make test-catalog test-domain test-web test-deploy`, `make sim-check`, `make build`. `backend` (30 min, `needs: checks`, `if: needs.checks.outputs.backend != 'false'`, so an empty output still runs it): `npm ci`, `make ci-start`, `make test-integration`, `make test-db`; on failure `make ci-logs` and uploads `backend-logs`; always `make stop`. |
| `workflows/e2e.yml` | Weekly (`schedule`, Mondays 03:17 UTC) and manual (`workflow_dispatch`) matrix job `e2e` (30 min, `fail-fast: false`): `make e2e` and `make e2e-webkit` each in two shards (`E2E_ARGS=--shard=n/2`), plus `make -k e2e-pwa e2e-pages` (`-k` so a failing PWA suite still runs the Pages suite). Each job runs `npm ci`, restores `~/.cache/ms-playwright` with `actions/cache` keyed on the Playwright version and browser (installs with `--with-deps` on a miss, `install-deps` on a hit), `make ci-start`, its suite; on failure `make ci-logs` and uploads `e2e-logs-<job index>` with the html report and traces; always `make stop`. Start it with `gh workflow run e2e.yml --ref <branch>` or from the Actions tab.                          |

## Subdirectories

| Directory    | Purpose                                          |
| ------------ | ------------------------------------------------ |
| `workflows/` | Workflow definitions (see `workflows/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- CI only calls `make` targets. When you add a check, add a Makefile target first, then a step here, so local and CI runs stay identical.
- Third-party actions are pinned to full commit SHAs with a version comment (the one place a comment is fine; YAML is not covered by `no-comments`). Keep that when updating them.
- `CHROMIUM_PATH=` is passed empty in CI so Playwright uses its own installed Chromium rather than the system one the Makefile would otherwise find.
- `make ci-start` excludes heavy Supabase services (`CI_EXCLUDED` in the Makefile) and writes `web/.env.development.local`.
- Never add a deploy or `supabase config push` step. See `docs/production-auth.md`.

### Testing Requirements

- There is no test for the workflow. Verify each step locally with the same `make` target. A change here is only confirmed by a green run on a pull request.

### Common Patterns

- Pull requests run the fast `checks` job first; `backend` starts after `checks` passes (a failing `checks` skips it) and is skipped when `needsBackend` in `scripts/ci-changes.ts` finds no backend input. A documentation-only diff skips the code steps of `checks` (`needsCode`). Add a new backend-relevant path there; `tests/deploy/ci-changes.test.ts` fails when a value import of the integration tests or stack scripts falls outside the list. The slow browser suites live in the weekly and manual `e2e` workflow.

## Dependencies

### Internal

- `../Makefile` targets: `ci-changes`, `format-check`, `secrets-scan`, `check`, `test-catalog`, `test-domain`, `test-web`, `test-deploy`, `sim-check`, `build`, `ci-start`, `test-integration`, `test-db`, `e2e`, `e2e-webkit`, `e2e-pwa`, `e2e-pages`, `ci-logs`, `stop`

### External

- `actions/checkout`, `actions/setup-node`, `denoland/setup-deno`, `actions/cache`, `actions/upload-artifact`, Docker (preinstalled on the runner)

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
