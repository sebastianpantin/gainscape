# Scripts

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Node tooling run by the Makefile: stack helpers and guards, the cache rebuilder, the service worker kill switch builder, CI change detection, the changelog helper, the documentation size guard, and larger tools in subdirectories. Scripts run directly under Node with native TypeScript (`node scripts/x.ts`), not through a bundler. Makefile target names are the public interface; change or document a script together with its target.

## Map

- Stack helpers: `ensure-loot-secret.mjs` (`make functions`), `wait-for-functions.mjs`, `assert-local-db.mjs` (`make test-db`), `ci-web-env.mjs` (`make ci-start`), `lan-url.mjs` (`make dev`, `make preview`). Shared pure rules in `local-stack.ts` and `loot-secret.ts`.
- `rebuild-caches.mjs` (`make rebuild-caches`, `ALL=1` for every user) and `function-batch.ts` (paging, batching, concurrency and Edge Runtime drop retries, shared with `deploy/rebuild-hosted.ts` and `tests/integration/local-stack.ts`).
- `build-kill-switch.ts` (`make sw-kill-switch`): replaces `web/dist/sw.js` with the kill-switch worker.
- `ci-changes.ts` (`make ci-changes`): prints `code=`, `backend=` and `ui=` for CI.
- `changelog/unreleased.ts` (`make changelog-unreleased`): user-facing PRs not yet in `web/changelog.yaml`; used by `deploy/deploy.ts` and the changelog skill.
- `docs/agents-size.ts` (`make docs-check`, part of `make check`): fails when a tracked `AGENTS.md` is over 16 KiB.
- `catalog/`: YAML to `supabase/seed.sql` (see `catalog/AGENTS.md`). `icons/`: logo sprite to PNG icons and `favicon.svg` (see `icons/AGENTS.md`). `balance/`: XP simulator and tuner (see `balance/AGENTS.md`).
- `screenshots/` (`make screenshots`, needs the stack): captures the manifest screenshots into `web/public/screenshots/`. The PNGs are committed but not freshness-checked; rerun after a visible UI change. `screens.ts` holds the viewport and the 200 KB cap, shared with `tests/web/manifest.test.ts`.
- `deploy/`: admin-only hosted tooling (see `docs/deploy.md`). Pure parts in `rules.ts`, `pages-headers.ts`, `testers.ts`, `deploy-env.ts`, tested in `tests/deploy/`.

## Rules and gotchas

- Failures print a one-line reason to stderr and `process.exit(1)`. The Makefile and CI depend on the exit code.
- The safety scripts stop work against a hosted project, another worktree's stack or with a weak secret. Do not weaken them:
  - `assert-local-db.mjs` refuses pgTAP unless `supabase status` reports a loopback DB host, neither `SUPABASE_DB_URL` nor `DATABASE_URL` is set, and the project's `supabase_db_<id>` container publishes the DB port.
  - `ensure-loot-secret.mjs` creates `supabase/functions/.env.local` with a random `LOOT_SECRET` (mode 0600), never overwrites one, and fails on a secret shorter than 32 characters.
  - `rebuild-caches.mjs` refuses when the `.stack.env` project id differs from the environment (run it through make).
- Read stack URLs and keys with `localStackStatus()` and guard with `currentStackEnvMismatch()` from `local-stack.ts`. Never copy them inline; several scripts, `tests/integration/local-stack.ts`, `e2e/support/stack-guard.ts` and `playwright.pages.config.ts` share them.
- `function-batch.ts`: an Edge Runtime drop is a 5xx whose body has no app `error` key (a worker retired for its CPU limit); retry those. After the first failure no new task starts, running ones finish, then it rejects. A stale rebuild lists again from the start at the end and fails if anyone is still stale, which catches a session written behind the cursor by an older function during the run.
- `deploy/rebuild-hosted.ts` asks the `rebuild-caches` function for user ids instead of reading tables, because a hosted project grants `service_role` no table access.
- `deploy/deploy.ts` runs the seed with `db query --linked --file supabase/seed.sql` on every deploy, because `db push --include-seed` never re-runs a changed seed. It refuses on unknown PR numbers, uncovered user-facing PRs or direct commits (rules in `rules.ts`). Deploy and invite first check that hosted sign-up is closed.
- `deploy/secrets-scan.ts` runs a pinned, checksum-verified gitleaks and first proves its rules catch planted secrets.
- `ci-changes.ts` diffs `HEAD^1`, which is right only on the CI merge commit; use `make ci-changes CI_BASE=main` locally. Documentation (`*.md`, `docs/`) never needs the backend job. An empty diff or a git failure means run everything.
- `changelog/unreleased.ts` refuses a shallow clone and lists files with `--no-renames`, so a file moved out of the app still counts. `gitIn` strips repo-locating `GIT_*` variables (such as `GIT_DIR` from a hook) so it reads the repository at `cwd`. A direct commit touching a user-facing path blocks deploy until a later commit changes `web/changelog.yaml`.
- `build-kill-switch.ts` refuses a local build unless `KILL_SWITCH_ALLOW_LOCAL_FLAG` is `1`.
- Scripts import from `web/build/`, `web/src/components/` and the domain, so a rename there breaks them. `tsconfig.json` type-checks this directory.
- Testable CLIs either guard their CLI part with `import.meta.main` (`catalog/generate.ts`, `ci-changes.ts`, `changelog/unreleased.ts`, `docs/agents-size.ts`) or keep logic in CLI-free modules (`balance/tune.ts`, `balance/bands.ts`). Use one of these patterns.
- `--check` compares generated output with the committed file and exits 1 when stale (`catalog/generate.ts`, `icons/build.ts`).
- Resolve paths from `import.meta.dirname`.

## Testing

- Unit tests live in `tests/deploy/` (stack guard, function batch, loot secret, ci-changes, changelog, deploy rules, docs size guard), `tests/catalog/`, `tests/balance/` and `tests/web/` (icons, manifest). Run `make test-deploy` and the matching layer.
- `build-kill-switch.ts` is covered by `e2e/pwa/update.spec.ts` (`make e2e-pwa`).
- No dedicated test: `assert-local-db.mjs`, `ci-web-env.mjs`, `ensure-loot-secret.mjs`, `lan-url.mjs`, `rebuild-caches.mjs`, `wait-for-functions.mjs`. Verify them by running their target.
- Put new pure logic in an importable function and write its test first.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
