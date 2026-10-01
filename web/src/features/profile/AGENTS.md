# Profile Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

The Profile tab and everything under it: the user's own profile card and stats, editing profile fields, previewing what friends see (with the public/private switches), and Settings (units, effort input mode, time zone, email and password, PWA install and update, data export, sign-out, account deletion).

## Key Files

| File                      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProfileScreen.tsx`       | Route `/profile`. Card plus bodyweight entry (`saveBodyweight`, `HIGHEST_BODYWEIGHT_KG`/`LOWEST_BODYWEIGHT_KG`), age via `ageFrom`, unit-aware height/weight display                                                                                                                                                                                                                                                                                        |
| `EditProfileScreen.tsx`   | Route `/profile/edit`. Edits every profile field; weight/height converted with `units.ts`; name validated by `nameProblem`; shows `PrivateTag` on private fields                                                                                                                                                                                                                                                                                            |
| `FriendPreviewScreen.tsx` | Route `/profile/preview`. Renders `ProfileCard` as friends see it and toggles visibility with `Switch` and `updatePublicProfile`; mirrors `friends/FriendProfileScreen.tsx`                                                                                                                                                                                                                                                                                 |
| `SettingsScreen.tsx`      | Route `/profile/settings` (takes `userId` and `email`). Largest file here (about 650 lines): preference pickers, `changeTimezone` (once, then 7-day wait via `nextTimezoneChangeAt`), `requestEmailChange`, `PasswordForm` (`changePassword`), export (`exportMyData`, `exportFileName`, `saveBlob`), `DeleteAccountForm` (`deleteMyAccount`, warns on unsynced drafts), install and update controls from `../../pwa/`, sign-out via `signOutKeepingDrafts` |
| `ProfileCard.tsx`         | Exports `ProfileCard` and `ProfileBadge` (monogram badge, `BADGE_COLORS`); also used by the friends feature                                                                                                                                                                                                                                                                                                                                                 |
| `PrivateTag.tsx`          | Small "private" marker                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `use-profile.ts`          | `useProfile(userId)` hook returning `{ state, replace }`; state is `loading`, `failed` or `ready` with a `ProfileBundle` (profile, standing, collection percent). `replace` applies optimistic updates                                                                                                                                                                                                                                                      |

## For AI Agents

### Working In This Directory

- Profile rules, validation and Supabase calls live in `../../lib/profile.ts` and `profile-rules.ts`; display shaping in `profile-view.ts`; unit conversion in `units.ts`. Weights are always stored in kg.
- Public and private fields are separate tables or RPCs (`updatePublicProfile` versus `updatePrivateProfile`). A new field must be placed on the correct side, shown on `ProfileCard` only if public, and kept in sync with RLS and the column maps (`PUBLIC_COLUMNS`, `PRIVATE_COLUMNS`) in `web/src/lib/profile.ts`.
- Account deletion and export call Edge Functions (`delete-account`, `export-data`). Changing their payloads needs the integration test updated too.
- Sign-out must keep drafts (`signOutKeepingDrafts`).

### Testing Requirements

- Unit: `tests/web/profile.test.ts`, `tests/web/units.test.ts`, `tests/web/names.test.ts`, `tests/web/update-flow.test.ts` and `tests/web/install-state.test.ts` (settings PWA controls), via `make test-web`.
- E2E (stack needed): `e2e/profile.spec.ts` (every field, pounds display, RPE logging, time zone, password, export, delete account), `e2e/a11y.spec.ts` (profile, edit, preview, settings), `e2e/pwa/update.spec.ts`.
- Integration: `tests/integration/profile.test.ts`, `account.test.ts`.
- `use-profile.ts` has no unit test of its own.

### Common Patterns

- Screens call `useProfile`, switch on `state.status`, and push changes through `replace` after a successful save.

## Dependencies

### Internal

- `../../lib/{catalog,catalog-cache,collection-data,format,names,preferences,profile,profile-view,social,social-rules,standing,units}.ts`, `../../components/{Icon,Switch}.tsx`, `../../offline/{draft-boot,draft-format,sync-workout}.ts`, `../../pwa/{install,register-service-worker,update-flow}.ts`.

### External

- React, React Router.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
