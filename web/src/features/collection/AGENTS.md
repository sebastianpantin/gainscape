# Collection Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

The "Log" tab: personal records per exercise, the loot inventory with crafting, and the shared `CollectionTabs` (Records, Items, History) that also frames the history screens.

## Key Files

| File                     | Description                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CollectionScreen.tsx`   | Records tab at `/collection`. Exports `CollectionScreen({ userId })` and `CollectionTabs` (used by `ItemsScreen` and `HistoryScreen`). Loads exercises and collection data, shows completion, uses `ExercisePicker` to filter        |
| `ExerciseRecordCard.tsx` | One exercise's records: rep-max slots (`REP_MAX_SLOT_COUNT` from `@domain/types.ts`) via `CollectionData`/`RepMaxSlotView`, formatted with `formatLoad` and `formatWeight` per `usePreferences`                                      |
| `ItemsScreen.tsx`        | Items tab at `/collection/items`. Inventory (`fetchInventory`), catalog (`fetchItemCatalog`), crafting with `canCraft`/`recipeFor` from `@domain/crafting.ts` and `craftItem`; reads `recallLastSummary` for fresh-drop highlighting |

## For AI Agents

### Working In This Directory

- Crafting rules come from the domain (`@domain/crafting.ts`); the server is authoritative, so the UI only pre-checks with `canCraft`.
- Item presentation rules live in `../../lib/item-rules.ts`; data fetches in `../../lib/items.ts` and `../../lib/collection-data.ts`. Do not duplicate them here.
- Adding a tab means editing the `links` array in `CollectionTabs` and a route in `App.tsx`.

### Testing Requirements

- Unit: `tests/web/items.test.ts` (item rules). `../../lib/collection-rules.ts` is exercised only through `tests/integration/collection-support.ts` and `collection-parity.test.ts` (stack needed).
- E2E (stack needed): `e2e/workout-records.spec.ts` (records and the collection log), `e2e/loot.spec.ts` (items screen, crafting, scroll unlock), `e2e/custom-exercise.spec.ts` (record card for custom exercises), `e2e/a11y.spec.ts`.

### Common Patterns

- Views are plain data from `lib/` fetchers; components do formatting only.

## Dependencies

### Internal

- `../../lib/{catalog,collection-data,format,items,preferences,units}.ts`, `../../components/{PixelArt,SegmentedNav}.tsx`, `../workout/ExercisePicker.tsx`, `../summary/last-summary.ts`, `@domain/{crafting,types}.ts`.

### External

- React, React Router.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
