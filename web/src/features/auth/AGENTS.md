# Auth Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Signed-out experience and email-link handling. `AuthScreen` covers sign-in, registration, forgot-password and resend-confirmation; `AuthCallbackScreen` handles links that land on the app (confirmation, password reset, email change) with a token hash.

## Key Files

| File                     | Description                                                                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthScreen.tsx`         | Mounted by `App.tsx` when `useAuthSession` reports `signed-out`. Uses `supabase.auth`, `authCallbackUrl`, `RESEND_COOLDOWN_SECONDS`, `MINIMUM_PASSWORD_LENGTH`, and `openDraftStoreOrFallback` for the post-sign-in draft pass                                                      |
| `AuthCallbackScreen.tsx` | Rendered before everything else when the URL parses as an auth callback; takes `callback` and `onDone`. Maps errors with `authErrorMessage`, guards stale links with `confirmedRecently`, handles rate limits via `RATE_LIMITED_CODE`/`tryAgainIn`, signs out with `signOutSettled` |

## For AI Agents

### Working In This Directory

- Both screens are outside the router; `App.tsx` swaps them in by session state and `parseAuthCallback`, so do not add `Link`/`useNavigate`.
- Link parsing and URLs live in `../../lib/auth-links.ts`; session restore and sign-out in `../../lib/auth-restore.ts`; keep logic there so it stays unit testable. Auth redirect URLs must match the Supabase config (see `docs/production-auth.md`).
- A signed-out user's drafts must survive: sign-out goes through `signOutSettled`/`signOutKeepingDrafts`, never a bare `supabase.auth.signOut()`.

### Testing Requirements

- Unit: `tests/web/auth-links.test.ts`, `tests/web/auth-session.test.ts` (`make test-web`).
- E2E (stack needed): `e2e/auth.spec.ts` (register/confirm, resend, reset, email change, used or stale links, squatter) and the auth cases in `e2e/a11y.spec.ts`; `e2e/token-refresh.spec.ts` covers sign-in after forced sign-out. Add new link or form behavior to `auth.spec.ts` after a failing unit test in `auth-links.test.ts` when the logic is pure.

### Common Patterns

- Rate limiting is surfaced with `retryAfterSeconds` and `tryAgainIn` from `../../lib/rate-limit.ts`.

## Dependencies

### Internal

- `../../lib/{account,auth-links,auth-restore,rate-limit,supabase}.ts`, `../../components/PixelArt.tsx`, `../../offline/draft-boot.ts`.

### External

- `@supabase/supabase-js` via `lib/supabase.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
