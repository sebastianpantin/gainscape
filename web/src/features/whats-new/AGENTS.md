# What's New Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-09 · **Updated:** 2026-10-09

## Purpose

The in-app changelog: the release history screen under Settings and the What's new sheet that lists the releases a user has not seen after an update. The releases come from `web/changelog.yaml`, bundled at build time as `__CHANGELOG__`.

## Key Files

| File                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changelog-data.ts`  | The only reader of the `__CHANGELOG__` global (ESLint bans it elsewhere): exports `CHANGELOG` (newest first) and `APP_VERSION`, the newest release's version                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ReleaseList.tsx`    | `ReleaseList({ releases, headingLevel })`: one section per release with its title as an `h2` or `h3`, `Version <version> · <date>` (`formatSessionDate`) and the items                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `WhatsNewScreen.tsx` | Route `/profile/settings/whats-new`: a `‹ Settings` back link, the `What's new` title and every release (`ReleaseList` with `h2`). Reads only the bundle, so it opens offline                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `WhatsNewSheet.tsx`  | Mounted once in `App.tsx` below the routes. `WhatsNewSheet({ userId })` renders a modal `<dialog>` named `What's new` (`showModal`, a scrollable `Release notes` region, `h3` release titles) when `useWhatsNew` returns releases. The `Got it` button, Escape and a close by the browser (`onClose` while the dialog is no longer open) all dismiss, once                                                                                                                                                                                                                                                        |
| `use-whats-new.ts`   | `useWhatsNew(userId)` returns `{ releases, dismiss }`. Decides once per mount with `whatsNewDecision(CHANGELOG, readLastSeenRelease(...))`: a first launch or unreadable value records the current version silently, an older stored version shows the newer releases. The sheet opens only when `whatsNewMayOpen` allows it (given `readOnboarding`, so it never opens over the first-run intro) and a second `hasDraftOnDevice` check finds no draft (a failed check counts as a draft); draft changes from other tabs arrive on `DRAFT_CHANNEL_NAME`. `dismiss` saves `APP_VERSION` with `saveLastSeenRelease` |

## For AI Agents

### Working In This Directory

- Decisions live in `../../lib/changelog-rules.ts` (`whatsNewDecision`, `whatsNewMayOpen`) and storage in `../../lib/last-seen-release-store.ts`; keep the `.tsx` files thin and add rules there with a test first.
- Never read `__CHANGELOG__` here or elsewhere: import `CHANGELOG` or `APP_VERSION` from `changelog-data.ts`.
- The sheet must never interrupt a workout: it waits while a draft exists on the device (IndexedDB store or `localStorage` fallback) and never opens on `/reveal`. It also waits until the first-run intro is done on this device. Keep these checks when changing the effect in `use-whats-new.ts`.
- Storage that cannot be written leaves the sheet closed rather than showing it on every launch (`readLastSeenRelease` writes the stored value back to prove it can).
- Releases are written in `web/changelog.yaml`, never in this directory; see `../../../AGENTS.md` for the release flow.

### Testing Requirements

- Unit: `tests/web/changelog-rules.test.ts`, `tests/web/last-seen-release-store.test.ts`, `tests/web/local-drafts.test.ts` (`hasDraftOnDevice`) and `tests/web/changelog-file.test.ts` (`make test-web`).
- E2E (stack needed): `e2e/whats-new.spec.ts` (sheet, workout gate, blocked storage, release history offline), `e2e/a11y.spec.ts` (the history screen), `e2e/pwa/offline.spec.ts` (Settings offline shows the version and the history).
- The components and hook have no unit test of their own; their decisions are in `changelog-rules.ts`.

### Common Patterns

- Storage access wrapped in try/catch with an `unavailable` fallback.
- Modal content uses a native `<dialog>` opened with `showModal` and closed on unmount.

## Dependencies

### Internal

- `../../lib/{changelog-rules,last-seen-release-store,channel,rest-timer-store,format}.ts`, `../../offline/{draft-boot,draft-session,local-drafts}.ts`.

### External

- React, React Router.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
