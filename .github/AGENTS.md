# GitHub

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

GitHub configuration. It holds two workflows. `workflows/ci.yml` runs on pushes to `main` and every pull request, with two parallel jobs: `checks` ("Checks and unit tests", no stack) and `backend` ("Backend integration and pgTAP", Supabase in Docker without Playwright). `workflows/e2e.yml` runs the `e2e` job ("End-to-end and PWA") only when started by hand (`workflow_dispatch`), for example before a release. `main` has no branch protection, so merge only after both `checks` and `backend` pass.

## Key Files

| File                | Description                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `workflows/ci.yml`  | Both jobs on `ubuntu-24.04`, Node 24, read-only `contents` permission, concurrency group per ref with cancel-in-progress. `checks` (20 min): sets up Deno, `npm ci`, `make check`, `make test-catalog test-domain test-web`, `make sim-check`, `make build`. `backend` (30 min): `npm ci`, `make ci-start`, `make test-integration`, `make test-db`; on failure `make ci-logs` and uploads `backend-logs`; always `make stop`. |
| `workflows/e2e.yml` | Manual `e2e` job (`workflow_dispatch`, 30 min): Playwright Chromium, `make ci-start`, `make e2e CHROMIUM_PATH=`, `make e2e-pwa CHROMIUM_PATH=`; on failure `make ci-logs` and uploads `e2e-logs`; always `make stop`. Start it with `gh workflow run e2e.yml --ref <branch>` or from the Actions tab.                                                                                                                          |

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

- Pull requests run the fast `checks` job and the `backend` job in parallel. The slow browser suites live in the manual `e2e` workflow.

## Dependencies

### Internal

- `../Makefile` targets: `check`, `test-catalog`, `test-domain`, `test-web`, `sim-check`, `build`, `ci-start`, `test-integration`, `test-db`, `e2e`, `e2e-pwa`, `ci-logs`, `stop`

### External

- `actions/checkout`, `actions/setup-node`, `denoland/setup-deno`, `actions/upload-artifact`, Docker (preinstalled on the runner)

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
