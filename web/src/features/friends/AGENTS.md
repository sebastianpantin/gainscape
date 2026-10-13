# Friends Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

The Friends tab: requests and the activity feed (`/friends`), hiscores across friends (`/friends/hiscores`), a friend's read-only profile (`/friends/:friendId`), and the friend activity strip on Train. What a friend sees honours the privacy flags the owner sets in the profile feature.

## Map

- `FriendsScreen.tsx`, `HiscoresScreen.tsx`, `FriendProfileScreen.tsx`, `FriendsTabs.tsx` (Feed and Hiscores).
- `FriendActivityStrip.tsx`: the `Friends` panel on Train; renders nothing without a friend event and leaves out your own events.
- Ranking, feed text and percent logic: `../../lib/social-rules.ts`. Queries: `../../lib/queries.ts`.

## Rules and gotchas

- Privacy is enforced on the server (RLS and RPCs). The UI must not try to hide data it was sent.
- `../profile/FriendPreviewScreen.tsx` and `FriendProfileScreen.tsx` render the same card from the same helpers (`profile-view.ts`). Change both together.
- After every request action, failed or not, refetch friends and feed. gz is disabled while a request action and its refetch run.
- Results show as toasts, dismissed when the next action or a gz toggle starts. There is no inline status paragraph, only the `problem` alert.
- A leading `@` in a username request is fine (the server strips one).
- `FriendProfileScreen` validates the id with `isUuid`; a null view means not available. After removing a friend it removes the cached friends, feed and this friend's profile queries. The friend's `LoadoutPanel` hides when `get_loadout` returns null.
- The empty feed text is asserted in `e2e/friends.spec.ts` and `e2e/tab-cache.spec.ts`.

## Testing

- Unit: `tests/web/social-rules.test.ts` (`make test-web`). Write the failing rule test there first.
- E2E (stack): `e2e/friends*.spec.ts`, `e2e/a11y.spec.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
