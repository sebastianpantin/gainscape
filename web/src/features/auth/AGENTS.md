# Auth Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

The signed-out experience and email-link handling. `AuthScreen.tsx` covers sign-in, registration, forgot-password and resend-confirmation; `AuthCallbackScreen.tsx` handles links that land on the app (confirmation, password reset, email change) with a token hash.

## Rules and gotchas

- Both screens sit outside the router; `App.tsx` swaps them in by session state and `parseAuthCallback`. Do not use `Link` or `useNavigate` here.
- Link parsing and URLs live in `../../lib/platform/auth-links.ts`, session restore and sign-out in `../../lib/platform/auth-restore.ts`. Keep logic there so it stays unit testable. Redirect URLs must match the Supabase config (`docs/production-auth.md`).
- A signed-out user's drafts must survive: sign out through `signOutSettled`/`signOutKeepingDrafts`, never a bare `supabase.auth.signOut()`.
- Stale links are guarded with `confirmedRecently`. A failed password reset request stays on the form with its error. Rate limits use `tryAgainIn` from `../../lib/platform/rate-limit.ts`.
- A username change through `change_username` announces `profile-saved`.

## Testing

- Unit (`make test-web`): `tests/web/auth-links.test.ts`, `auth-session.test.ts`.
- E2E (stack): `e2e/auth.spec.ts` (register and confirm, resend, reset, email change, used or stale links, squatter), `e2e/a11y.spec.ts`, `e2e/token-refresh.spec.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
