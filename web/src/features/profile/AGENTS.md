# Profile Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

The Profile tab and everything under it: the user's own profile card and stats (`/profile`), editing profile fields (`/profile/edit`), previewing what friends see with the public/private switches (`/profile/preview`), and Settings (`/profile/settings`). Settings covers units, effort mode, time zone, weekly goal, device-only training choices, email and password, PWA install and update, data export, reset, sign-out and account deletion.

## Map

- Screens: `ProfileScreen.tsx`, `EditProfileScreen.tsx`, `FriendPreviewScreen.tsx`, `SettingsScreen.tsx` (the largest file here).
- Hooks:
  - `use-profile.ts`: a cache-first load; `replace` applies optimistic updates and saves the cache.
  - `use-optimistic-profile-save.ts`: applies the change, persists it, and rolls back on failure.
  - `use-loadout.ts`: the loadout query.
- Shared with other features:
  - `ProfileCard.tsx` and `ProfileBadge` (friends use them).
  - `LoadoutPanel.tsx` (Items, Profile, Preview and the friend profile).
  - `save-bodyweight.ts` (workout finish and history edit).
- Logic lives outside this folder:
  - Rules and validation: `../../lib/profile-rules.ts`.
  - Supabase calls and the column maps: `../../lib/profile.ts`.
  - Display shaping: `profile-view.ts`.
  - Conversion: `units.ts`.

## Rules and gotchas

- Weights are always stored in kg. Convert only for display and input.
- Public and private fields live in separate tables or RPCs (`updatePublicProfile` versus `updatePrivateProfile`). A new field goes on the right side, shows on `ProfileCard` only if public, and must stay in sync with RLS and with `PUBLIC_COLUMNS`/`PRIVATE_COLUMNS` in `web/src/lib/profile.ts`.
- Name and bio inputs have no `maxLength`, because it counts UTF-16 units. The bio counter uses `characterCount`, so both count characters the way the server does.
- Bodyweight is a text field with a decimal keyboard, so `82,4` saves as 82.4. Unreadable text shows the range problem and disables Save.
- A database trigger logs the profile bodyweight save as today's bodyweight entry. Save is disabled offline. After each save, invalidate `bodyweightTrendQuery`.
- `saveBodyweight` is the only path for a bodyweight prompt answer. It updates `profile_private`, the device profile cache (`rememberSavedBodyweight`) and the loaded `profileQuery`, then announces `profile-saved`. The trend and the friend preview refresh from that announcement.
- After an equip, unequip or craft, announce `gear-changed` (`announceDataChange`). That invalidates the loadout here and in other tabs.
- `LoadoutPanel` keeps the slot grid with `…` values while loading so the screen does not jump. It renders nothing when `get_loadout` returns null, which means a user the caller may not view.
- `ProfileBadge` is `aria-hidden` unless `named`, which only the card sets. `nameIsPageTitle` makes the name the page `h1`; the friend profile uses it.
- `FriendPreviewScreen` mirrors `../friends/FriendProfileScreen.tsx`. Keep the two in step.
- `ProfileScreen` reads the collection percent through a `select` over the shared `['collection', userId]` query, so it shares the Collection tab's cache.
- The time zone can change once, then must wait 7 days (`nextTimezoneChangeAt`). A weekly goal change takes effect from a later week (`goalSettingHint`).
- Device-only settings never go through the profile save:
  - Rest timer: `../../lib/rest-timer-store.ts`.
  - Plates and bar weight: `../../lib/plate-settings-store.ts`.
  - Vibration, sound, notify and keep screen on: `../../lib/training-device-store.ts`.
  - Vibration also gates the set and record buzzes, not only the rest end.
  - Notify asks for permission and shows an alert when it is denied.
- The RIR and RPE hints come from `GLOSSARY` in `../../lib/glossary.ts`, the same text as the workout help.
- Sign-out must keep drafts (`signOutKeepingDrafts`).
- Reset and deletion warn about an unsynced draft (`hasDraftOnDevice`), checking both the booted draft store and the `localStorage` fallback.
  - Reset needs `RESET` typed, then calls `resetMyData`, then `forgetUserProgressData`, then `announceDataChange('account-reset')`.
  - Deletion calls `forgetUserDeviceData`, which clears every per-user key and keeps the forgotten-draft tombstone.
- Account deletion and export call the `delete-account` and `export-data` Edge Functions. A payload change needs the integration test updated too.
- Account results show as toasts. A panel toggle or a starting export dismisses the toast. Failures stay in the `problem` alert.

## Testing

- Unit (`make test-web`):
  - `tests/web/profile.test.ts` (time zone, bodyweight and height helpers), `profile-view`, `local-drafts`, `units`, `names`.
  - `update-flow` and `install-state` (the Settings PWA controls).
  - `use-profile.ts` and `use-optimistic-profile-save.ts` have no unit test of their own. Their decisions (`previousValues`, `saveProblemText`) are in `profile-rules.ts`.
- Integration (stack needed): `tests/integration/profile.test.ts`, `account.test.ts`.
- E2E (stack needed):
  - `e2e/profile.spec.ts` (every field, pounds, RPE, time zone, password, export, delete).
  - `bodyweight-trend`, `weekly-goal`, `a11y`.
  - `whats-new` and `pwa/offline` (the version text and the What's new link).
  - `pwa/update`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
