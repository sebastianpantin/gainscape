# GitHub

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

GitHub configuration. It holds only the CI workflow, `workflows/ci.yml`, which runs on pushes to `main` and on every pull request. `main` has no branch protection, so merge only after both jobs pass.

## Key Files

| File               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflows/ci.yml` | Two jobs on `ubuntu-24.04`, Node 24, read-only `contents` permission, concurrency group per ref with cancel-in-progress. `static` (20 min): `npm ci`, `make check`, `make test-catalog test-domain test-web`, `make sim-check`; also sets up Deno. `stack` (45 min): Playwright Chromium, `make ci-start`, `make test-integration`, `make test-db`, `make e2e CHROMIUM_PATH=`, `make e2e-pwa CHROMIUM_PATH=`; on failure `make ci-logs` and uploads `stack-logs`; always `make stop`. |

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

- Static work and stack work are separate jobs so cheap failures return fast.

## Dependencies

### Internal

- `../Makefile` targets: `check`, `test-catalog`, `test-domain`, `test-web`, `sim-check`, `ci-start`, `test-integration`, `test-db`, `e2e`, `e2e-pwa`, `ci-logs`, `stop`

### External

- `actions/checkout`, `actions/setup-node`, `denoland/setup-deno`, `actions/upload-artifact`, Docker (preinstalled on the runner)

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
