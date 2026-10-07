# Workflows

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-07

## Purpose

GitHub Actions workflow definitions. See `../AGENTS.md` for the full description of `ci.yml` and `e2e.yml`.

## Key Files

| File      | Description                                                                                                                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`  | Pull request CI: `checks` (no stack, runs `make ci-changes`; docs-only diffs run just `make format-check secrets-scan`) and `backend` (integration and pgTAP on the local stack; needs `checks`, skipped without backend inputs) |
| `e2e.yml` | Manual end-to-end and PWA suites on the local stack, started with `workflow_dispatch`                                                                                                                                            |

## For AI Agents

### Working In This Directory

- Call `make` targets only, and keep third-party actions pinned to commit SHAs. Details in `../AGENTS.md`.

### Testing Requirements

- None automated. Confirm `ci.yml` with a green pull request run and `e2e.yml` with a manual run on the branch.

## Dependencies

### Internal

- `../../Makefile`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
