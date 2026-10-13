# delete-account

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

POST endpoint that permanently deletes the caller's account after they confirm their username and re-enter their password. An admin client on the default secret key calls `auth.admin.deleteUser`; database cascades remove the data.

## Map

- `index.ts`: handler via `serveAuthenticated`, strict body `{ confirmUsername, password }`, bucket `delete_account_hour`.
- `password-check.ts`: reads the result of the throwaway sign-in that checks the password. `deno.json`, `deno.lock` (never hand-edit).

## Rules and gotchas

- Only GoTrue `invalid_credentials` means a wrong password (403 `wrong_password`). A GoTrue 429 becomes 429 `auth_rate_limited`; any other error (5xx, network) is logged and becomes 503 `auth_unavailable`, so an auth outage never reads as a wrong password.
- The password is checked by signing in with a throwaway client on the publishable key.
- Keys come from `_shared/api-keys.ts` per request; never expose or log the secret key.
- Cascades are defined in migrations and covered by pgTAP.

## Testing

`tests/deploy/delete-account-password.test.ts` (no stack); `tests/integration/account.test.ts` and `supabase/tests/07_account_deletion.test.sql` (stack).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
