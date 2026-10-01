# Workflows

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

GitHub Actions workflow definitions. See `../AGENTS.md` for the full description of `ci.yml` and `stack.yml`.

## Key Files

| File        | Description                                                                |
| ----------- | -------------------------------------------------------------------------- |
| `ci.yml`    | CI with the `static` job (no stack), on pushes to `main` and pull requests |
| `stack.yml` | Manual `stack` job (full local stack), started with `workflow_dispatch`    |

## For AI Agents

### Working In This Directory

- Call `make` targets only, and keep third-party actions pinned to commit SHAs. Details in `../AGENTS.md`.

### Testing Requirements

- None automated. Confirm `ci.yml` with a green pull request run and `stack.yml` with a manual run on the branch.

## Dependencies

### Internal

- `../../Makefile`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
