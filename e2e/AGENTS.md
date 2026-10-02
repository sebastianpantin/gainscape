# e2e

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Playwright end-to-end suites that drive the real web app against the real local Supabase stack in a Pixel 7 Chromium. The specs in this directory run against the Vite dev server over https with service workers blocked (`playwright.config.ts`). The `pwa/` subdirectory runs against a production-style build with service workers allowed (`playwright.pwa.config.ts`). Shared helpers are in `support/`.

## Key Files

| File                        | Description                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.spec.ts`              | Registration and confirmation through the emailed link, resend, password reset, email change, used and stale links, pre-hijack squatter.                 |
| `a11y.spec.ts`              | Axe (WCAG 2.2 AA) on auth screens and every signed-in screen, 44px touch targets on a 360x740 phone, reduced motion, skills pixel art.                   |
| `history.spec.ts`           | Editing a logged set, deleting a workout, conflict with a delete or edit made elsewhere.                                                                 |
| `drafts.spec.ts`            | Finished workout survives outage and reload; another account's draft is kept; a draft written while IndexedDB was unavailable moves back into IndexedDB. |
| `multi-tab.spec.ts`         | Draft sync between tabs via `BroadcastChannel`, single finish request, no resurrected draft.                                                             |
| `token-refresh.spec.ts`     | Expired or wrongly signed tokens refreshed, forced sign-out then sync, auth outage.                                                                      |
| `profile.spec.ts`           | Profile fields, pounds display with kilogram storage, RPE logging, time zone cooldown, password change, export, delete account.                          |
| `programs.spec.ts`          | Copy a template, run a program day, finish.                                                                                                              |
| `custom-exercise.spec.ts`   | Create, log, record, pin, reorder and archive a custom exercise; create and log a custom cardio one.                                                     |
| `cardio.spec.ts`            | A run, intervals and a lift in one workout through reveal and a history distance edit; miles for pound users.                                            |
| `workout-records.spec.ts`   | Bodyweight prompt, records and the collection log.                                                                                                       |
| `loot.spec.ts`              | Loot reveal, items screen, crafting, scroll unlock (uses `grantItems`, `grantUnlock`).                                                                   |
| `friends.spec.ts`           | Friend request, feed, hiscores, profile and removal across two browser contexts.                                                                         |
| `no-service-worker.spec.ts` | The dev server never registers a service worker and still loads fonts.                                                                                   |

## Subdirectories

| Directory  | Purpose                                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwa/`     | Service worker, offline shell, update flow, installability (see `pwa/AGENTS.md`)                                                                                                               |
| `pages/`   | The Cloudflare Pages build under `wrangler pages dev`: `_headers`, deep links, no published agent docs, a whole workout with no CSP violation (`make e2e-pages`, `playwright.pages.config.ts`) |
| `support/` | Shared page helpers, DB helpers, stack guard, a11y and font assertions (see `support/AGENTS.md`)                                                                                               |

## For AI Agents

### Working In This Directory

- Configs: `../playwright.config.ts` (`testDir: 'e2e'`, `testIgnore: 'pwa/**'`, timeout 90 s, `fullyParallel: false` so tests inside a file run in order (files may still use several workers; no `workers` cap is set), no retries, `list` reporter, Pixel 7, `ignoreHTTPSErrors`, `serviceWorkers: 'block'`, trace kept on failure, web server `npx vite web --host` reused if already running) and `../playwright.pwa.config.ts` (for `pwa/`).
- Both configs call `assertStackEnvironment()` at load; a mismatch with `.stack.env` aborts the run.
- Every spec registers its own user with a unique name (for example a `prefix_` plus `Date.now().toString(36)`, passed to `register`). Never share users or rely on prior data. Specs reach the database directly through `support/db.ts` for setup and verification (unlocks, items, forced edits).
- Locate by role and accessible name (`getByRole`, `getByLabel`) so tests double as accessibility checks. Do not add test ids to the app for convenience; fix the accessible name instead.
- Long tests set `test.setTimeout(...)` locally (for example `a11y.spec.ts` 240 s, `token-refresh.spec.ts` 180 s). Do not raise the global timeout.
- No comments and no `test.skip`.

### Testing Requirements

- Prerequisites: `make start` (stack plus Edge Functions). `make e2e` runs `make functions`, then `npx playwright test` with `CHROMIUM_PATH` set to the system `chromium` if found (CI passes it empty to use Playwright's own browser). The web server starts itself.
- One spec: `npx playwright test e2e/history.spec.ts`; one test: add `-g "part of the title"`. Use `--headed` or `--trace on` to debug; traces are retained on failure in `test-results/`.
- Red-green loop: add a failing `test(...)` in the spec for the screen (new screens get a new `<area>.spec.ts`), run only it, implement in `web/src`, rerun, then `make e2e`. Push logic into `web/src/lib/*-rules.ts` and cover it in `../tests/web/` first when possible; keep e2e for wiring and flows.
- A change to the service worker, shell, manifest or update flow is covered by `pwa/`, not here.

### Common Patterns

- `register`, `signIn`, `openTab`, `openFromProfile`, `logExercise`, `logWorkout`, `finishWorkout`, `openLatestWorkout` from `support/app.ts` for flows. Reuse them instead of inlining the start, finish and reveal steps.
- Two users or devices: import `test` from `support/people.ts` and call its `newPerson()` fixture once per person (`friends.spec.ts`, `auth.spec.ts`, `a11y.spec.ts`); it opens a fresh context and closes every context it opened when the test ends, even on failure. Do not call `browser.newContext()` directly; two tabs: `context.newPage()` (`multi-tab.spec.ts`).
- Simulating failures: route interception for outages and 401s (`token-refresh.spec.ts`), `breakIndexedDbOpen` and `setIndexedDbBroken` for storage failures, `resignedWithAnotherKey` for bad tokens.
- Conflicts with another device: `editElsewhere` or `sessionRow` from `support/db.ts`.
- Email steps: `waitForEmail` and `authLinkFrom` from `support/mailbox.ts`.

## Dependencies

### Internal

- `../web/` (system under test), `../supabase/` (stack), `../tests/integration/local-stack.ts` and `mailbox.ts` (re-exported through `support/`)
- `../playwright.config.ts`, `../playwright.pwa.config.ts`, `../web/build/ports.ts`

### External

- `@playwright/test`, `@axe-core/playwright`, system Chromium via `CHROMIUM_PATH` (optional)

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
