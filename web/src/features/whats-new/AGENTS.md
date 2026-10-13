# What's New Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-09 · **Updated:** 2026-10-13

## Purpose

The in-app changelog: the release history screen under Settings (`/profile/settings/whats-new`) and the What's new sheet that lists unseen releases after an update. Releases come from `web/changelog.yaml`, bundled at build time as `__CHANGELOG__`.

## Map

- `changelog-data.ts`: the only reader of `__CHANGELOG__` (ESLint bans it elsewhere). Import `CHANGELOG` and `APP_VERSION` from here.
- `WhatsNewSheet.tsx` (mounted once in `App.tsx`) with `use-whats-new.ts`; `WhatsNewScreen.tsx`; `ReleaseList.tsx`.
- Decisions: `../../lib/changelog-rules.ts`. Storage: `../../lib/last-seen-release-store.ts`. Keep the `.tsx` files thin.

## Rules and gotchas

- The sheet must never interrupt a workout: it waits while a draft exists on the device (IndexedDB store or `localStorage` fallback; a failed check counts as a draft), never opens on `/reveal`, and waits until the first-run intro is done. Draft changes from other tabs arrive on the drafts channel. Keep these checks.
- First launch or an unreadable stored value records the current version silently. Storage that cannot be written leaves the sheet closed instead of showing it on every launch (`readLastSeenRelease` writes the value back to prove it can).
- `Got it`, Escape and a close by the browser each dismiss once and save `APP_VERSION`.
- The history screen reads only the bundle, so it opens offline.
- `changelog-rules.ts` must not import app code, because plain Node loads it for `make deploy`.
- Releases are written in `web/changelog.yaml`, never here; see the root `AGENTS.md` for the release flow.

## Testing

- Unit (`make test-web`): `tests/web/changelog-rules.test.ts`, `last-seen-release-store.test.ts`, `local-drafts.test.ts`, `changelog-file.test.ts`.
- E2E (stack): `e2e/whats-new.spec.ts` (sheet, workout gate, blocked storage, offline history), `e2e/a11y.spec.ts`, `e2e/pwa/offline.spec.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
