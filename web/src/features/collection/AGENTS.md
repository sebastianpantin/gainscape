# Collection Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

The Collection tab: personal records per exercise (`/collection`), the per-exercise progress screen, the loot inventory with crafting, gear and scroll challenges (`/collection/items`), and the shared `CollectionTabs` (Records, Items, History) that also frames the history screens.

## Map

- `CollectionScreen.tsx`: Records tab and the exported `CollectionTabs`. Adding a tab means editing the `links` array there and a route in `App.tsx`.
- `ItemsScreen.tsx`: inventory, item details, crafting, equip and unequip, Start challenge for scrolls, Show on Today for pets.
- `ExerciseProgressScreen.tsx`: e1RM and top-set chart, the rep-max table, and the Stalled tag with its tips (`../../lib/progress/plateau-rules.ts`).
- `RecordSlots.tsx` and `record-slots.ts` (pure): the rep-max slot grid, shared with `friends/FriendProfileScreen.tsx`. Do not rebuild slots inline.
- `CollectionHeading.tsx`: the shared h1, named `Collection log: <tab>` so route focus announces which tab opened.

## Rules and gotchas

- The server is authoritative for crafting; the UI only pre-checks with `canCraft` from `@domain/crafting.ts`. Item presentation lives in `lib/collection/item-rules.ts`, fetches in `lib/collection/items.ts` and `lib/collection/collection-data.ts`; do not duplicate them here.
- Records and Items load cache first and keep working offline from the saved copy. Offline, Equip, Unequip and craft are disabled because they need the server; Start challenge keeps working because it only builds a local draft.
- Equip, unequip and craft (a craft can auto-equip the upgrade) must invalidate the `['loadout', userId]` query.
- After a craft or a stale catalog, refetch, show the result with `setQueryData` and save it with `updateItemsCache`, so the offline copy stays current.
- Craft celebration: `onCraftStarted` primes audio inside the click (`primeCelebrationAudio`), because browsers only allow audio started from a user gesture. It also clears the `Crafted!` banner so a repeat craft shows it again.
- Start challenge is disabled while a draft is open, and while a lift in the challenge has no e1RM (the judge fails a load percent without one). When neither the live fetch nor the cache has a strength state, nothing is blocked and the draft starts from `{}`. If a waiting unsynced workout opens instead, the Items tab says so.
- The progress chart's `e1RM` legend text is part of the chart's accessible name, so keep it unchanged.
- Collection completion counts lifts only, and must match the server count (see Testing).
- Stalled (client only, no server state or reward): at least 4 sessions and 21 days since the last session that beat the previous best by more than 0.5% (e1RM, or most reps for a `bodyweight` lift; holds are skipped). Sessions with no e1RM still count toward the 4, so "trained but not stronger" stays honest. No tag when the latest session is program-driven (any set with a `prescription_ref`), because the program owns its deloads; going back to manual logging brings the tag back. No tag when the lift was last trained more than 28 days ago, so a dropped lift is not called stalled. The Today screen shows no hint: `recent_lift_sets` holds at most 5 sessions, too few for the 21-day rule.

## Testing

- Unit (`make test-web`): `tests/web/plateau-rules.test.ts`, `exercise-progress-rules.test.ts`, `tests/web/items.test.ts`, `items-cache.test.ts`, `collection-rules.test.ts`, `record-slots.test.ts`.
- Server parity of collection counting: `tests/integration/collection-parity.test.ts` (stack).
- E2E (stack): `exercise-progress.spec.ts` (Stalled, using `spreadSessionsDays`), `workout-records.spec.ts`, `loot.spec.ts` (crafting and the banner), `challenges.spec.ts`, `term-help.spec.ts`, `custom-exercise.spec.ts`, `a11y.spec.ts`, and `e2e/pwa/offline.spec.ts` for Items offline.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
