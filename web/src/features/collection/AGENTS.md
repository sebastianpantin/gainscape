# Collection Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

The "Log" tab: personal records per exercise, the loot inventory with crafting, and the shared `CollectionTabs` (Records, Items, History) that also frames the history screens.

## Key Files

| File                     | Description                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CollectionScreen.tsx`   | Records tab at `/collection`. Exports `CollectionScreen({ userId })` and `CollectionTabs` (used by `ItemsScreen` and `HistoryScreen`). Loads exercises and collection data, shows completion (via `countCollection` and `collectionPercent` from `collection-rules.ts`; lifts only; the pin picker lists lifts), a self-only Cardio records card from `cardioRecordCards`, uses `ExercisePicker` to filter |
| `ExerciseRecordCard.tsx` | One exercise's records: a strength line from `strengthText` and the rep-max slots through `RecordSlots`, formatted per `usePreferences`                                                                                                                                                                                                                                                                    |
| `RecordSlots.tsx`        | `RecordSlots`: the rep-max slot grid (`loadType`, `slots`, `maxReps`, `unit`, `weightsHidden`); shared by `ExerciseRecordCard` and `friends/FriendProfileScreen.tsx`                                                                                                                                                                                                                                       |
| `record-slots.ts`        | Pure slot helpers: `slotClass`, `slotText`, `slotsByReps` (places rep-max rows into `REP_MAX_SLOT_COUNT` slots); empty slots come from `emptySlots` in `lib/collection-rules.ts`                                                                                                                                                                                                                           |
| `ItemsScreen.tsx`        | Items tab at `/collection/items`. Inventory (`fetchInventory`), catalog (`fetchItemCatalog`), crafting with `canCraft`/`recipeFor` from `@domain/crafting.ts` and `craftItem`; reads `recallLastSummary` for fresh-drop highlighting                                                                                                                                                                       |

## For AI Agents

### Working In This Directory

- Crafting rules come from the domain (`@domain/crafting.ts`); the server is authoritative, so the UI only pre-checks with `canCraft`.
- Item presentation rules live in `../../lib/item-rules.ts`; data fetches in `../../lib/items.ts` and `../../lib/collection-data.ts`. Do not duplicate them here.
- Adding a tab means editing the `links` array in `CollectionTabs` and a route in `App.tsx`.

### Testing Requirements

- Unit: `tests/web/items.test.ts` (item rules), `tests/web/collection-rules.test.ts` and `tests/web/record-slots.test.ts` (`make test-web`). Collection counting parity with the server runs through `tests/integration/collection-support.ts` and `collection-parity.test.ts` (stack needed).
- E2E (stack needed): `e2e/workout-records.spec.ts` (records and the collection log), `e2e/loot.spec.ts` (items screen, crafting, scroll unlock), `e2e/custom-exercise.spec.ts` (record card for custom exercises), `e2e/a11y.spec.ts`.

### Common Patterns

- Slot rendering and text live in `record-slots.ts` and `RecordSlots.tsx`; do not rebuild slots inline.
- Views are plain data from `lib/` fetchers; components do formatting only.

## Dependencies

### Internal

- `../../lib/{cardio-rules,catalog,catalog-rules,collection-data,collection-rules,error-text,format,item-rules,items,preferences,profile-rules,reorder}.ts`, `../../components/{PixelArt,SegmentedNav}.tsx`, `../workout/ExercisePicker.tsx`, `../summary/last-summary.ts`, `@domain/{crafting,types}.ts`.

### External

- React, React Router.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
