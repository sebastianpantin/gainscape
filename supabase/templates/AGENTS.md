# templates

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

GoTrue email bodies referenced from `[auth.email.template.*]` in `../config.toml`. All links point to `{{ .RedirectTo }}` with a `token_hash` and `type` query, which the web app's `/auth/confirm` route consumes.

## Key Files

| File                | Description                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| `confirmation.html` | Signup confirmation, link type `email`                                      |
| `recovery.html`     | Password reset, link type `recovery`                                        |
| `email_change.html` | Email change confirmation, uses `{{ .NewEmail }}`, link type `email_change` |

## For AI Agents

### Working In This Directory

- Keep the `token_hash` and `type` parameters in sync with the `/auth/confirm` handling in `web/`.
- Subjects live in `config.toml`, not here. Paths there are relative to the repo root (`./supabase/templates/...`).
- The templates ship with `config push`; check them in the hosted dashboard afterwards.

### Testing Requirements

`tests/integration/auth-email.test.ts` reads the emails from Mailpit (`mailbox.ts`) and follows the links. Extend it first for any template change; the stack is required (`make test-integration`).

### Common Patterns

- Minimal HTML, one call-to-action link per email.

## Dependencies

### Internal

- `../config.toml`, `web/` auth confirm route

### External

- GoTrue template variables

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
