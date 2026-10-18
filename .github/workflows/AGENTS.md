# Workflows

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

GitHub Actions workflow definitions: `ci.yml` (pull request CI: `changes`, then `checks`, `backend` and `smoke`) and `e2e.yml` (nightly and manual browser, PWA and Pages suites). `../AGENTS.md` describes both and their rules.

## Rules and gotchas

- Call `make` targets only, and keep third-party actions pinned to commit SHAs.

## Testing

None automated. Confirm `ci.yml` with a green pull request run and `e2e.yml` with a manual run on the branch (`gh workflow run e2e.yml --ref <branch>`).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
