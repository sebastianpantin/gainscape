# Workflows

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

GitHub Actions workflow definitions. See `../AGENTS.md` for the full description of `ci.yml`.

## Key Files

| File     | Description                                                            |
| -------- | ---------------------------------------------------------------------- |
| `ci.yml` | CI with a `static` job (no stack) and a `stack` job (full local stack) |

## For AI Agents

### Working In This Directory

- Call `make` targets only, and keep third-party actions pinned to commit SHAs. Details in `../AGENTS.md`.

### Testing Requirements

- None automated. Confirm with a green pull request run.

## Dependencies

### Internal

- `../../Makefile`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
