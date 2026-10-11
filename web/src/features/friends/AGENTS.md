# Friends Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-08

## Purpose

The Friends tab: requests and the activity feed, hiscores across friends, and a friend's read-only profile. What a friend sees honors the privacy flags the owner sets in the profile feature.

## Key Files

| File                      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FriendsScreen.tsx`       | Route `/friends`. Feed with gz (kudos) toggles (each entry names the poster as display name plus `@username`; gz is disabled while a request action and its refetch run), friend requests by username (send, accept, decline; a leading `@` is fine), removal; refetches friends and feed after every action, failed or not; shows `ProfileBadge` and `initialsFor`; uses `usePreferences` for weight display. An empty feed reads `No posts yet. Add friends, or log a personal record (PR).` (asserted in `e2e/friends.spec.ts` and `e2e/tab-cache.spec.ts`)                                                                                     |
| `HiscoresScreen.tsx`      | Route `/friends/hiscores`. Metric picker, `hiscoresQuery` and `skillsQuery` from `../../lib/queries.ts`, ranking with `rankHiscores`/`skillMetric` from `social-rules.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `FriendProfileScreen.tsx` | Route `/friends/:friendId`. Validates the id with `isUuid`, loads the view with `friendProfileQuery(friendId)` from `../../lib/queries.ts` (null means not available), builds `cardProfileOf`/`standingOfView`, removes the cached friends, feed (`FRIENDS_QUERY_PREFIX`, `FEED_QUERY_PREFIX`) and this friend's profile queries after removing a friend; renders `ProfileWithTopSkills` (card plus top skills, collection percent via `collectionPercent`), the friend's `LoadoutPanel` from `../profile/` (`get_loadout`, hidden when it returns null) and each exercise's records through `RecordSlots` and `slotsByReps` from `../collection/` |
| `FriendsTabs.tsx`         | `SegmentedNav` with Feed and Hiscores                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## For AI Agents

### Working In This Directory

- Ranking, feed and percent logic belongs in `../../lib/social-rules.ts`, not here. Privacy is enforced server side (RLS and RPCs); the UI must not try to hide data it was sent.
- `../profile/FriendPreviewScreen.tsx` and this folder's `FriendProfileScreen.tsx` render the same card from the same helpers (`profile-view.ts`); change both together.

### Testing Requirements

- Unit: `tests/web/social-rules.test.ts` (`make test-web`). Write the failing rule test there first.
- E2E (stack needed): `e2e/friends.spec.ts` (request, feed with gz and hidden weights, hiscores, profile, removal) and `e2e/a11y.spec.ts`.

### Common Patterns

- Tabbed section via `FriendsTabs` rendered at the top of each tab screen.

## Dependencies

### Internal

- `../../lib/{catalog,catalog-rules,error-text,history-rules,preferences,profile,social,social-rules}.ts`, `../collection/{RecordSlots,record-slots}`, `../profile/{ProfileCard,ProfileWithTopSkills}.tsx`, `../../components/SegmentedNav.tsx`.

### External

- React Router.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
