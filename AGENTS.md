# gainscape

**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Gainscape is a strength-training logger with OSRS-inspired skills, XP, levels, loot, crafting and a friends feed. It is a React PWA (`web/`) backed by a local Supabase stack (Postgres with row-level security, GoTrue auth, Deno Edge Functions). The game engine is a pure TypeScript module (`supabase/functions/_shared/domain/`) that the Edge Functions and the web app share. The server is authoritative: the web app logs workouts offline as drafts, and `complete-session` computes XP, records and loot when the draft syncs.

## Key Files

- `Makefile`: entry point for every workflow: stack, dev server, checks, every test layer, codegen.
- `package.json`: npm dependencies only; every workflow runs through a `make` target.
- `eslint.config.js`: ESLint flat config, including the custom `gainscape/no-comments` rule, the test id bans for `web/src` and `e2e/`, the domain purity globals ban and the `__CHANGELOG__` global ban.
- `tsconfig.json`: type-checks app, tests, e2e, scripts and domain; `@domain/*` path alias.
- `tsconfig.sw.json`: separate WebWorker type-check for `web/src/sw` and `web/src/pwa/shell-rules.ts`.
- `vitest.config.ts`: Vitest projects with the `@domain` alias: `unit` (balance, catalog, deploy, domain, web; parallel), `integration` (4 workers in parallel), then `integration-serial` (files that touch global state, one at a time).
- `playwright.config.ts`: E2E against the `vite web` dev server (https, service workers blocked); projects `chromium` (Pixel 7, `make e2e`) and `webkit` (iPhone 14, `make e2e-webkit`); shared CI settings in `e2e/support/run-settings.ts`.
- `playwright.pwa.config.ts`: PWA E2E against `vite preview` over plain http with service workers allowed.
- `playwright.pages.config.ts`: Pages E2E: builds with `scripts/deploy/build-pages.ts` against the local stack and serves `web/dist` with `wrangler pages dev`.
- `.prettierrc.json`: Prettier: single quotes, width 120, trailing commas.
- `.gitleaks.toml`: gitleaks rules for `make secrets-scan`: default rules plus allowlists for Supabase's public local-demo keys and the `stronglifts_5x5` template key in the catalog templates and seed.
- `.claude/skills/changelog/SKILL.md`: the skill behind "write the changelog": lists uncovered user-facing PRs with `make changelog-unreleased`, writes the next entry of `web/changelog.yaml` and opens a PR.
- `scripts/docs/agents-size.ts`: `make docs-check` (part of `make check`) fails when a tracked `AGENTS.md` is over 16 KiB, so these files stay readable in one pass.
- `README.md`: human-facing run instructions, command table, PWA, loot secret and auth notes.
- `.github/workflows/ci.yml`: CI on every pull request: `checks` (no stack; runs `make ci-changes` first, then only `make format-check docs-check secrets-scan` for a documentation-only PR, otherwise the full gate including `make build`) and `backend` (integration, pgTAP; needs `checks`, skipped when `ci-changes` finds no backend input).
- `.github/workflows/e2e.yml`: weekly and manual `e2e` workflow (sharded chromium and webkit, e2e-pwa, e2e-pages), started by hand with `gh workflow run e2e.yml --ref <branch>`.

## Subdirectories

| Directory   | Purpose                                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| `web/`      | React PWA, Vite root, service worker build plugin (see `web/AGENTS.md`)                                    |
| `supabase/` | Migrations, RLS, pgTAP tests, Edge Functions, shared domain engine (see `supabase/AGENTS.md`)              |
| `catalog/`  | YAML source of all seed data; generates `supabase/seed.sql` (see `catalog/AGENTS.md`)                      |
| `tests/`    | Vitest suites: catalog, domain, web, balance, integration (see `tests/AGENTS.md`)                          |
| `e2e/`      | Playwright end-to-end and PWA suites (see `e2e/AGENTS.md`)                                                 |
| `scripts/`  | Node tooling: catalog generator, icon renderer, balance simulator, stack helpers (see `scripts/AGENTS.md`) |
| `docs/`     | Go-live documentation (see `docs/AGENTS.md`)                                                               |
| `.github/`  | CI workflow (see `.github/AGENTS.md`)                                                                      |

Generated or ignored directories: `node_modules/`, `web/dist/`, `test-results/`, `playwright-report/`, `ci-logs/`, `supabase/.temp/`, `supabase/.branches/`, `.omc/`, `.wrangler/`. Never edit or document them.

## For AI Agents

### Hard rules (enforced by tooling)

- **No comments in code.** `gainscape/no-comments` fails lint on any comment in `.ts`, `.tsx`, `.js` and `.mjs` files. Make code explain itself through names. This also applies to tests and scripts.
- **No `test.skip`, `it.only`, `describe.only` or stub tests.** A skipped or placeholder test is a blocker, not progress.
- **No test ids.** ESLint `no-restricted-syntax` fails on a `data-testid` attribute or object key in `web/src` and on `getByTestId` in `e2e/`; give the element a role and an accessible name, and locate it that way in `e2e/`.
- **Domain purity.** `supabase/functions/_shared/domain/*.ts` may only import sibling `./x.ts` files and must not use `Deno`, `process`, `window`, `document`, `localStorage` or `require`. `tests/domain/purity.test.ts` enforces all of these and fails on an import cycle (runtime imports across the domain, every import among `program-*.ts`); ESLint `no-restricted-globals` also bans the globals except `require`.
- **Imports keep the `.ts` extension** (`allowImportingTsExtensions`, needed by Deno). Use `import { type X }` inline type imports.
- **Never hand-edit generated files:** `supabase/seed.sql` (run `make catalog`), `web/public/icons/*` and `web/public/favicon.svg` (run `make icons`). The `*-check` targets fail when these are stale.
- **Migrations are append-only.** Add a new `supabase/migrations/YYYYMMDDHHMMSS_NNN_name.sql` with the next number. Never edit a merged migration.
- **Format with Prettier** (`make format`). `make check` runs `prettier --check`.
- **AGENTS.md documents rules and reasons, not what the code says.** Keep each one to purpose, a short map of entry points and file groups, gotchas with their why, and the test layer. Never add one row per file or restate what a function does; that drifts and is derivable from the code. `make docs-check` fails over 16 KiB per file. Regenerating these files (for example with deepinit) must follow the same shape and limit, and keep `## Manual Notes` verbatim.
- **No secrets in the repo, ever.** Hosted keys, database URLs and `LOOT_SECRET` stay with the admin (see `docs/deploy.md`). `make secrets-scan` (part of `make check`) fails on a leak. The only allowlisted keys are Supabase's public local-demo keys, listed in `.gitleaks.toml`; its one other allowlist lets the `stronglifts_5x5` template key through in `catalog/program-templates/*.yaml` and `supabase/seed.sql` only.

### Test-driven workflow

Every behaviour change follows red, green, refactor:

1. **Red.** Pick the lowest test layer that can express the behaviour (table below). Write or extend a test. Run only that suite and confirm it fails for the expected reason, not for a typo or a missing import.
2. **Green.** Write the smallest change that makes the test pass. Re-run the same suite.
3. **Refactor.** Clean up names and structure with the test still green. No comments; rename instead.
4. **Widen.** Run `make check`, then every layer the change touches. Run the stack layers when the change touches SQL, Edge Functions or UI flows.

| Change touches                                                                  | Test layer and command                                                         | Stack needed        |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------- |
| Game rules: XP, levels, strength, records, loot, crafting, replay, events       | `tests/domain/` with `make test-domain` (fast-check available for properties)  | No                  |
| Balance constants in `domain/balance.ts`                                        | `make test-domain` and `make sim-check` (about 1 s)                            | No                  |
| `catalog/*.yaml` or `scripts/catalog/`                                          | `tests/catalog/` with `make test-catalog`, then `make catalog`                 | No                  |
| Pure web logic: `web/src/lib/**/*-rules.ts`, `web/src/offline/`, `web/src/pwa/` | `tests/web/` with `make test-web`                                              | No                  |
| Deploy tooling and secrets rules: `scripts/deploy/`                             | `tests/deploy/` with `make test-deploy`; the Pages build with `make e2e-pages` | No (e2e-pages: yes) |
| Edge Functions, stores, SQL RPCs, RLS                                           | `tests/integration/` with `make test-integration`                              | Yes                 |
| Grants, policies, triggers, SQL functions                                       | `supabase/tests/*.test.sql` (pgTAP) with `make test-db`                        | Yes                 |
| Screens, navigation, user flows, accessibility                                  | `e2e/*.spec.ts` with `make e2e`                                                | Yes                 |
| Service worker, offline shell, update flow, manifest                            | `e2e/pwa/*.spec.ts` with `make e2e-pwa`                                        | Yes                 |

Run a single file while iterating: `npx vitest run tests/domain/xp.test.ts`, `npx playwright test e2e/history.spec.ts`. Integration tests need `make functions` (or `make start`) first.

Design for testability. Put decisions in pure functions (`domain/`, `web/src/lib/**/*-rules.ts`, `web/src/offline/draft-format.ts`) and keep React components and Edge Function handlers thin. Logic that is pure gets a fast unit test; only I/O wiring needs the stack.

### Local stack

- `make start` starts Supabase in Docker and serves the Edge Functions. `make reset` recreates the DB from migrations and seed. `make stop` stops everything.
- A second stack (for a git worktree) needs a gitignored `.stack.env` with a distinct `SUPABASE_PROJECT_ID`, port overrides and `GAINSCAPE_WEB_PORT`. The Makefile exports it.
- `make test-db` refuses non-local database hosts (`scripts/assert-local-db.mjs`). The e2e stack guard only checks that `SUPABASE_PROJECT_ID` matches `.stack.env`. Never point tests at a hosted project.
- After a schema change: `make reset`. There are no generated DB types. Row types are hand-written `*Row` interfaces and `*_COLUMNS` select strings in `web/src/lib/`; update them by hand.

### Definition of done

- `make check` passes (format, lint, both type-checks, `deno check`, catalog and icons freshness, the `AGENTS.md` size guard, and the gitleaks secrets scan of the history, the working tree and untracked files).
- The test layers for the change pass. The full gate is `make test`, plus `make sim-check`, `make e2e` and `make e2e-pwa` for stack or UI work.
- New behaviour has a test that failed before the change.
- No comments, skipped tests, TODO placeholders or unimplemented branches in the diff.
- The change is reviewed in a separate pass from the one that wrote it.

### Git and delivery

- Never push directly to `main`; every change lands through a PR. Work on a branch, open a PR against `main`. Merge only after `checks` and `backend` pass; `backend` may show as skipped when no backend-relevant path changed (`scripts/ci-changes.ts`), which counts as fine. Run `make e2e` and `make e2e-pwa` locally for UI work; the `e2e` workflow runs them weekly on `main` (Mondays), plus WebKit and the Pages suite; start it on a branch with `gh workflow run e2e.yml --ref <branch>`, for example before a release. `main` has no branch protection, so this rule is manual.
- Cutting a release: before a deploy, ask Claude to "write the changelog" (`.claude/skills/changelog/SKILL.md`, helper `make changelog-unreleased`). `make deploy` refuses while a user-facing merged PR is in no entry's `prs` in `web/changelog.yaml`. A hand-written entry works the same way: one entry at the top of `web/changelog.yaml` with a higher version and the covered PR numbers in `prs`. Never edit a shipped entry's version. A PR is covered once its number appears in any entry's `prs`.
- Commit subjects are short imperative or slice-prefixed sentences (for example `S7a: web manifest, ...` or `Catalog validator checks gear tiers ...`).
- Never deploy or push config to a hosted Supabase project. See `docs/production-auth.md`.

## Dependencies

### External

- React 19, React Router 7, Vite 8 (with `@vitejs/plugin-react`, `@vitejs/plugin-basic-ssl`)
- TanStack Query 5 (`@tanstack/react-query`) for server data in screens
- `@supabase/supabase-js` 2, Supabase CLI (local stack, `functions serve`, `test db`)
- Deno 2 for Edge Function type checks
- Zod 4 for payload validation
- Vitest 5, fast-check, fake-indexeddb, `postgres` (direct SQL in integration tests)
- Playwright with `@axe-core/playwright`
- TypeScript 6, ESLint 10 with typescript-eslint strict, Prettier 3

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
