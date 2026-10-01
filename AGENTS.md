# gainscape

**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Gainscape is a strength-training logger with OSRS-inspired skills, XP, levels, loot, crafting and a friends feed. It is a React PWA (`web/`) backed by a local Supabase stack (Postgres with row-level security, GoTrue auth, Deno Edge Functions). The game engine is a pure TypeScript module (`supabase/functions/_shared/domain/`) that the Edge Functions and the web app share. The server is authoritative: the web app logs workouts offline as drafts, and `complete-session` computes XP, records and loot when the draft syncs.

## Key Files

| File                        | Description                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Makefile`                  | Entry point for every workflow: stack, dev server, checks, every test layer, codegen                                       |
| `package.json`              | npm dependencies; the scripts here are a subset, prefer `make` targets                                                     |
| `eslint.config.js`          | ESLint flat config, including the custom `gainscape/no-comments` rule and domain purity globals ban                        |
| `tsconfig.json`             | Type-checks app, tests, e2e, scripts and domain; `@domain/*` path alias                                                    |
| `tsconfig.sw.json`          | Separate WebWorker type-check for `web/src/sw` and `web/src/pwa/shell-rules.ts`                                            |
| `vitest.config.ts`          | Vitest: `tests/**/*.test.ts`, `@domain` alias, files run serially (`fileParallelism: false`)                               |
| `playwright.config.ts`      | E2E against `vite web` dev server (https, Pixel 7, service workers blocked)                                                |
| `playwright.pwa.config.ts`  | PWA E2E against `vite preview` over plain http with service workers allowed                                                |
| `.prettierrc.json`          | Prettier: single quotes, width 120, trailing commas                                                                        |
| `README.md`                 | Human-facing run instructions, command table, PWA, loot secret and auth notes                                              |
| `.github/workflows/ci.yml`  | CI on every pull request and push to `main`: `checks` (no stack, includes `make build`) and `backend` (integration, pgTAP) |
| `.github/workflows/e2e.yml` | Manual `e2e` workflow (e2e, e2e-pwa), started with `gh workflow run e2e.yml --ref <branch>`                                |

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

Generated or ignored directories: `node_modules/`, `web/dist/`, `test-results/`, `playwright-report/`, `ci-logs/`, `supabase/.temp/`, `supabase/.branches/`, `.omc/`. Never edit or document them.

## For AI Agents

### Hard rules (enforced by tooling)

- **No comments in code.** `gainscape/no-comments` fails lint on any comment in `.ts`, `.tsx`, `.js` and `.mjs` files. Make code explain itself through names. This also applies to tests and scripts.
- **No `test.skip`, `it.only`, `describe.only` or stub tests.** A skipped or placeholder test is a blocker, not progress.
- **Domain purity.** `supabase/functions/_shared/domain/*.ts` may only import sibling `./x.ts` files and must not use `Deno`, `process`, `window`, `document`, `localStorage` or `require`. `tests/domain/purity.test.ts` enforces all of these; ESLint `no-restricted-globals` also bans the globals except `require`.
- **Imports keep the `.ts` extension** (`allowImportingTsExtensions`, needed by Deno). Use `import { type X }` inline type imports.
- **Never hand-edit generated files:** `supabase/seed.sql` (run `make catalog`), `web/public/icons/*` and `web/public/favicon.svg` (run `make icons`). The `*-check` targets fail when these are stale.
- **Migrations are append-only.** Add a new `supabase/migrations/YYYYMMDDHHMMSS_NNN_name.sql` with the next number. Never edit a merged migration.
- **Format with Prettier** (`make format`). `make check` runs `prettier --check`.

### Test-driven workflow

Every behaviour change follows red, green, refactor:

1. **Red.** Pick the lowest test layer that can express the behaviour (table below). Write or extend a test. Run only that suite and confirm it fails for the expected reason, not for a typo or a missing import.
2. **Green.** Write the smallest change that makes the test pass. Re-run the same suite.
3. **Refactor.** Clean up names and structure with the test still green. No comments; rename instead.
4. **Widen.** Run `make check`, then every layer the change touches. Run the stack layers when the change touches SQL, Edge Functions or UI flows.

| Change touches                                                               | Test layer and command                                                        | Stack needed |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------ |
| Game rules: XP, levels, strength, records, loot, crafting, replay, events    | `tests/domain/` with `make test-domain` (fast-check available for properties) | No           |
| Balance constants in `domain/balance.ts`                                     | `make test-domain` and `make sim-check` (about 15 s)                          | No           |
| `catalog/*.yaml` or `scripts/catalog/`                                       | `tests/catalog/` with `make test-catalog`, then `make catalog`                | No           |
| Pure web logic: `web/src/lib/*-rules.ts`, `web/src/offline/`, `web/src/pwa/` | `tests/web/` with `make test-web`                                             | No           |
| Edge Functions, stores, SQL RPCs, RLS                                        | `tests/integration/` with `make test-integration`                             | Yes          |
| Grants, policies, triggers, SQL functions                                    | `supabase/tests/*.test.sql` (pgTAP) with `make test-db`                       | Yes          |
| Screens, navigation, user flows, accessibility                               | `e2e/*.spec.ts` with `make e2e`                                               | Yes          |
| Service worker, offline shell, update flow, manifest                         | `e2e/pwa/*.spec.ts` with `make e2e-pwa`                                       | Yes          |

Run a single file while iterating: `npx vitest run tests/domain/xp.test.ts`, `npx playwright test e2e/history.spec.ts`. Integration tests need `make functions` (or `make start`) first.

Design for testability. Put decisions in pure functions (`domain/`, `web/src/lib/*-rules.ts`, `web/src/offline/draft-format.ts`) and keep React components and Edge Function handlers thin. Logic that is pure gets a fast unit test; only I/O wiring needs the stack.

### Local stack

- `make start` starts Supabase in Docker and serves the Edge Functions. `make reset` recreates the DB from migrations and seed. `make stop` stops everything.
- A second stack (for a git worktree) needs a gitignored `.stack.env` with a distinct `SUPABASE_PROJECT_ID`, port overrides and `GAINSCAPE_WEB_PORT`. The Makefile exports it.
- `make test-db` refuses non-local database hosts (`scripts/assert-local-db.mjs`). The e2e stack guard only checks that `SUPABASE_PROJECT_ID` matches `.stack.env`. Never point tests at a hosted project.
- After a schema change: `make reset`. No generated DB types are committed (`make types` writes an unused, gitignored-by-tooling `web/src/lib/database.types.ts`). Row types are hand-written `*Row` interfaces and `*_COLUMNS` select strings in `web/src/lib/`; update them by hand.

### Definition of done

- `make check` passes (format, lint, both type-checks, `deno check`, catalog and icons freshness).
- The test layers for the change pass. The full gate is `make test`, plus `make sim-check`, `make e2e` and `make e2e-pwa` for stack or UI work.
- New behaviour has a test that failed before the change.
- No comments, skipped tests, TODO placeholders or unimplemented branches in the diff.
- The change is reviewed in a separate pass from the one that wrote it.

### Git and delivery

- Work on a branch, open a PR against `main`. Merge only after both CI jobs (`checks` and `backend`) pass. Run `make e2e` and `make e2e-pwa` locally for UI work; the manual `e2e` workflow (`gh workflow run e2e.yml --ref <branch>`) runs them in CI, for example before a release. `main` has no branch protection, so this rule is manual.
- Commit subjects are short imperative or slice-prefixed sentences (for example `S7a: web manifest, ...` or `Catalog validator checks gear tiers ...`).
- Never deploy or push config to a hosted Supabase project. See `docs/production-auth.md`.

## Dependencies

### External

- React 19, React Router 7, Vite 8 (with `@vitejs/plugin-react`, `@vitejs/plugin-basic-ssl`)
- `@supabase/supabase-js` 2, Supabase CLI (local stack, `functions serve`, `test db`)
- Deno 2 for Edge Function type checks
- Zod 4 for payload validation
- Vitest 5, fast-check, fake-indexeddb, `postgres` (direct SQL in integration tests)
- Playwright with `@axe-core/playwright`
- TypeScript 6, ESLint 10 with typescript-eslint strict, Prettier 3

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
