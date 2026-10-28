# Docs

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Human-facing operations documentation. `deploy.md` is the runbook for the invite-only test environment (secrets, abuse limits, setup, changelog before deploy, `make deploy`, testers, incidents, backups, rotation). `production-auth.md` is the checklist for what a hosted project needs before real users sign up. `design-system.md` states the UI rules and the guards behind them. `game-mechanics.md` explains the game rules for contributors and names constants instead of quoting them, so it does not drift from `balance.ts`. Nothing here is applied automatically.

## Rules and gotchas

- Keep the pages consistent with `supabase/config.toml`, `supabase/templates/`, migration 014 (the account pre-hijack fix) and the `README.md` auth notes. If any of those change, update the docs in the same commit.
- Never run or suggest `supabase config push`, `test db --linked` or tests against a hosted project; the pages explain why.
- Claims about guards (for example `make test-db`) are backed by `scripts/assert-local-db.mjs`; re-read it when editing those sentences.

## Testing

No tests cover prose. `make format-check` is the only check.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
