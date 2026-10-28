# e2e

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Playwright end-to-end suites that drive the real web app against the real local Supabase stack, in a Pixel 7 Chromium (`make e2e`) and an iPhone 14 WebKit (`make e2e-webkit`). Specs in this directory run against the Vite dev server over https with service workers blocked. `pwa/` runs against a production-style build with service workers allowed, and `pages/` against the Cloudflare Pages build.

## Map

- `<area>.spec.ts`: one file per screen or flow; the file name says what it covers (`history`, `drafts`, `friends-*`, `settings-*`, `program-*`, ...). A new screen gets a new `<area>.spec.ts`.
- `program-flow-*.spec.ts`: one template followed across weeks or cycles through `complete-session` (progression rules end to end). `program-templates-*.spec.ts`: a template's prescribed rows only.
- Cross-cutting specs: `a11y.spec.ts` (axe WCAG 2.2 AA on every screen, 44px touch targets, tab labels at 320px), `tab-cache.spec.ts` (the query cache contract), `load-errors.spec.ts` and `friends-failures.spec.ts` (injected failures and recovery), `multi-tab.spec.ts`, `token-refresh.spec.ts`, `deep-links.spec.ts`.
- `support/`: shared helpers (see `support/AGENTS.md`).
- `pwa/`: service worker, offline shell, update flow, installability (see `pwa/AGENTS.md`).
- `pages/`: the Pages build under `wrangler pages dev`: `_headers`, deep links, no published agent docs, a whole workout with no CSP violation (`make e2e-pages`, `playwright.pages.config.ts`).

## Rules and gotchas

Config and environment:

- `../playwright.config.ts`: `testIgnore` `pwa/**` and `pages/**`, timeout 90 s, `fullyParallel: true` (every test registers its own user, so tests of one file spread over workers and CI shards balance per test; a file whose tests share state would opt out with `test.describe.configure({ mode: 'default' })`), `serviceWorkers: 'block'`, `ignoreHTTPSErrors`, web server `npx vite web --host` reused locally but not on CI.
- Every config spreads `runSettings` and `failureArtifacts` from `support/run-settings.ts`: locally no retries; on CI `forbidOnly` and one retry (a retried pass is reported as flaky). Trace and screenshot on failure, no video, because recording every test doubles the CPU time.
- Every config calls `assertStackEnvironment()` at load; a `SUPABASE_PROJECT_ID` mismatch with `.stack.env` aborts the run. Never point e2e at a hosted project.
- Do not raise the global timeout. A long test sets `test.setTimeout(...)` locally (`a11y.spec.ts` 150 s, `token-refresh.spec.ts` 180 s); split a test that outgrows its budget into tests with their own users so they run on separate workers.

Isolation and fixtures:

- Every spec registers its own user with a unique name (a prefix plus `Date.now().toString(36)`, passed to `register`). Never share users or rely on prior data.
- Import `test` and `expect` from `support/fixtures.ts`, never from `@playwright/test` (types still come from there). Its `context` and `newPerson` fixtures fail a test on any uncaught `pageerror`, checked before the contexts close so the trace is kept. On WebKit it ignores "... due to access control checks." errors, which WebKit raises for fetches a reload or navigation cancels.
- The fixtures also fail a test on React's DOM-nesting `console.error` ("cannot be a descendant of", "cannot contain a nested"), which only the dev server prints.
- The `finishWindowMs` option (default 0) writes the finish-window override before every load, which only DEV builds honour, so Finish syncs at once; a spec about the wait after Finish sets `test.use({ finishWindowMs: 5000 })`. Production suites (`pwa/`, `pages/`) get the real 5 s window.
- With `serviceWorkers: 'block'` the fixture makes `navigator.serviceWorker.register` reject, like a browser with service workers disabled, because Playwright's block resolves it with `undefined`.
- Two users or devices: call `newPerson()` once per person; it closes every context it opened, even on failure. Never call `browser.newContext()` directly. Two tabs: `context.newPage()`.
- `register` creates a confirmed account through the admin API with the browser's time zone, signs in with supabase-js in Node and writes that session and the first-run intro flag into `localStorage` through a one-shot init script before the first load, because the sign-in form costs every test a page load. To see the intro or drive the form use `registerWithoutSigningIn` plus `submitSignIn`; `auth.spec.ts` and the other sign-in specs keep the form covered. Only `auth.spec.ts` and `registration.spec.ts` drive the sign-up form (`submitRegistration`).
- Reuse the flow helpers in `support/app.ts` (`logWorkout`, `finishWorkout`, `openTab`, ...) instead of inlining start, finish and reveal steps; move a helper a second spec needs into `support/` rather than copying it.
- A spec that depends on one engine pins it with `test.use`: `settings-install.spec.ts` uses the Pixel 7 user agent because `beforeinstallprompt` is Chromium-only (an iPhone user agent takes the iOS manual-install path).

Selectors (no test ids: ESLint fails on `getByTestId` here and on `data-testid` in `web/src`):

- Only the profile card badge has a role (`getByRole('img', { name: 'Blue badge', exact: true })`); badges elsewhere are `aria-hidden`.

- Locate by role and accessible name (`getByRole`, `getByLabel`, then `getByText`), so tests double as accessibility checks. When a value has no role or name, give it one in the app.
- Label and value pairs are `<dl>`; read a value with `definitionOf(scope, term)`.
- Workout rows are list items named `Set N` and `Bout N` (`<exercise>, set N` inside a superset round). Use `setRow`, `setRows`, `boutRow` inside `exerciseCard(page, name)`, never `li.set-row` or `.nth()`. A done set is a pressed `Done set N` button. Warm-up toggle, Clear effort and Remove are in the row's options menu (`openSetOptions`).
- A computed total that changes on screen is a named `<output>` (`getByRole('status', { name: 'Workout XP' })`).
- Toasts: assert exact text inside a `status`, because the toast region is always present.
- Plain text (bio, detail line) is matched with `getByText(text, { exact: true })` inside its named region.
- Disclosure open state (`term-help.spec.ts`) is checked through visibility, not `aria-expanded`.

Races and flakes:

- Simulate failures with the existing helpers: `breakIndexedDbOpen`/`setIndexedDbBroken` (storage), `resignedWithAnotherKey` (bad token), `editElsewhere`/`sessionRow` from `support/db.ts` (another device's edit).

- A database read after a UI action races the write: `await expect.poll(() => sessionCount(username)).toBe(1)`, not `expect(await ...)`. The same for values read from the page or browser storage. A check that something did not change stays a plain `expect(await ...)`: a poll passes on its first read and only pretends to wait.
- Data a spec seeds straight into the database (`grantItems`, `equipGear`) after the app loaded shows only after `page.reload()` or once the fresh window (`FRESH_FOR_MS`) passes, like a change from another device.
- A "nothing appears" check must first wait for the thing that would trigger it: `whats-new.spec.ts` uses `countDraftReads` (wraps `IDBObjectStore.getAll`) so a sheet that would open late cannot pass unseen.
- Injected failures use `page.route` with a 500 and a PostgREST JSON body, so supabase-js does not retry GETs.
- Time-based UI (rest timer, reveal, supersets) uses `page.clock`; device APIs (`navigator.vibrate`, wake lock, notifications, `display-mode`) are stubbed with `addInitScript`.
- In `reveal.spec.ts` Skip is pressed the moment it renders; a replayed reveal vibrates once.
- A user's first workout makes no feed post, so a spec that expects a post logs two workouts (`friends-privacy.spec.ts`).
- Local full e2e is flaky under load (parallel stacks or another Playwright run); rerun the failing spec alone, then use the e2e workflow. While another run is active, pass a separate `--output` directory so runs do not share `test-results/`.

Structure:

- `program-flow-*.spec.ts` wrap each phase in a named `test.step` (following, each seeded stretch, each prescription check) so a failure names the week and lift.
- Program specs seed earlier sessions through `support/program-seed.ts` rather than clicking through week by week.

## Testing

- `make e2e-smoke` runs only tests tagged `{ tag: '@smoke' }`; CI runs it on every pull request with a UI input (`scripts/ci-changes.ts`). Tag at most one test per core flow (sign-up, a finished workout, an offline draft, history) so the job stays a few minutes; everything else runs nightly.
- Prerequisite: `make start`. `make e2e` runs `make functions`, then `npx playwright test --project=chromium $(E2E_ARGS)` with `CHROMIUM_PATH` set to the system `chromium` if found (CI passes it empty to use Playwright's browser). The web server starts itself.
- `make e2e-webkit`: Playwright's WebKit needs Ubuntu libraries. On other hosts run it in the `mcr.microsoft.com/playwright` image of the installed Playwright version with `--network host` and the Docker socket and CLI mounted (the stack guard calls `supabase status`), or leave it to the nightly e2e workflow.
- One spec: `npx playwright test e2e/history.spec.ts`; one test: add `-g "part of the title"`; debug with `--headed` or `--trace on` (traces on failure are in `test-results/`).
- Red-green: add a failing `test(...)` in the spec for the screen, run only it, implement in `web/src`, rerun, then `make e2e`. Put logic in `web/src/lib/**/*-rules.ts` and cover it in `../tests/web/` first; keep e2e for wiring and flows.
- Service worker, shell, manifest or update flow changes are covered in `pwa/` (`make e2e-pwa`), not here.
- No comments, no `test.skip` or `.only` (CI sets `forbidOnly`).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
