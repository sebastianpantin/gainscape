# delete-account

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-07

## Purpose

POST endpoint that permanently deletes the caller's account after they confirm their username and re-enter their password. Uses an admin client on the default secret key (`secretKey()`) for `auth.admin.deleteUser`, and checks the password with a client on the publishable key; database cascades remove the data.

## Key Files

| File        | Description                                                                                                                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`  | Handler via `serveAuthenticated`; strict body `{ confirmUsername, password }` (400 `invalid_json`, 422 `invalid_payload`); bucket `delete_account_hour`; 403 `confirmation_mismatch` and `wrong_password`; password verified with a throwaway anon client |
| `deno.json` | `{ "nodeModulesDir": "none" }`; picked up by `make check-functions`                                                                                                                                                                                       |
| `deno.lock` | Pinned dependency lock; regenerate with Deno, do not hand-edit                                                                                                                                                                                            |

## For AI Agents

### Working In This Directory

- Reads its keys through `_shared/api-keys.ts` (`SUPABASE_SECRET_KEYS`, `SUPABASE_PUBLISHABLE_KEYS`); never expose or log the secret key.
- Cascades are defined in migrations and covered by pgTAP.

### Testing Requirements

`tests/integration/account.test.ts` and `supabase/tests/07_account_deletion.test.sql`. Stack required.

### Common Patterns

Handler is thin: OPTIONS, POST check, auth, parse, one async function, `errorResponse`. No comments in code.

## Dependencies

### Internal

- `../_shared/auth.ts`, `db.ts`, `http.ts`, `rate-limit.ts`

### External

- Deno 2, `npm:zod@4.6.5`, `npm:postgres@3.4.9`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
