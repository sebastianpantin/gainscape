# templates

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

GoTrue email bodies referenced from `[auth.email.template.*]` in `../config.toml`: `confirmation.html` (type `email`), `recovery.html` (type `recovery`) and `email_change.html` (type `email_change`). Every link points to `{{ .RedirectTo }}` with a `token_hash` and `type` query, which the web app's `/auth/confirm` route consumes.

## Rules and gotchas

- Keep the `token_hash` and `type` parameters in sync with the `/auth/confirm` handling in `web/src/lib/platform/auth-links.ts`.
- Subjects live in `config.toml`, not here. Template paths there are relative to the repo root (`./supabase/templates/...`).
- After a template change, check the hosted project's templates in its dashboard (`docs/production-auth.md`).
- One call-to-action link per email.

## Testing

`tests/integration/auth-email.test.ts` reads the emails from Mailpit and follows the links. Extend it first for any template change (`make test-integration`, stack).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
