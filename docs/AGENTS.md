# Docs

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Human-facing operations documentation. Two pages: `deploy.md` (the free, invite-only test environment: secrets, abuse limits, setup, deploy, testers, incidents, backups, rotation) and `production-auth.md` (what a hosted project needs before real users sign up). Nothing in it is applied automatically.

## Key Files

| File                 | Description                                                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `production-auth.md` | Go-live checklist: never push the local `config.toml`, SMTP setup, hosted auth settings (`site_url`, exact redirect URLs, `max_frequency`, rate limits), the account pre-hijack fix, `LOOT_SECRET`, client-IP config, hosting rules.                                      |
| `deploy.md`          | Test environment runbook: who holds which secret and how the tooling enforces it, abuse and rate limits, invite-only setup with email confirmation off, `make deploy`, inviting and removing testers, incidents, backups and restore, secret rotation, pre-tester checks. |

## For AI Agents

### Working In This Directory

- Keep the page consistent with `supabase/config.toml`, `supabase/templates/`, migration 014 and the `README.md` auth notes. If any of those change, update this page in the same commit.
- Never run or suggest `supabase config push`, `test db --linked` or tests against a hosted project. The page documents why.
- Prettier formats Markdown here (`make format`); tables are aligned by it.

### Testing Requirements

- No tests cover prose. `make format-check` is the only check. Claims about behaviour (for example the `make test-db` guard) are backed by `scripts/assert-local-db.mjs`; re-read it when editing those sentences.

### Common Patterns

- Short imperative sections, a table for settings, TOML snippets, and a final checkbox checklist.

## Dependencies

### Internal

- `../supabase/config.toml`, `../supabase/templates/`, `../scripts/assert-local-db.mjs`, `../README.md`

### External

- Supabase hosted project, an SMTP provider (Resend is the example)

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
