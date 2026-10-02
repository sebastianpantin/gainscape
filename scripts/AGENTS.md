# Scripts

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Node tooling run by the Makefile: stack helpers (loot secret, readiness wait, local-DB guard, CI env), the dev LAN URL printer, the cache rebuilder, the service worker kill switch builder, and three larger tools in subdirectories (catalog generator, icon renderer, balance simulator). Scripts run directly under Node with native TypeScript (`node scripts/x.ts`), not through a bundler.

## Key Files

| File                     | Makefile target                        | Description                                                                                                                                                                                           |
| ------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ensure-loot-secret.mjs` | `make functions` (so `start`, `reset`) | Creates `supabase/functions/.env.local` with a random `LOOT_SECRET` (mode 0600) if missing. Exits 1 if the file exists with a secret shorter than 32 characters. Never overwrites an existing secret. |
| `wait-for-functions.mjs` | `make functions`                       | Polls `OPTIONS` on `complete-session` at `SUPABASE_API_PORT` (default 54321) until it answers 204; fails after 120 s.                                                                                 |
| `assert-local-db.mjs`    | `make test-db`                         | Refuses to run pgTAP unless `supabase status` reports a loopback DB host, no `SUPABASE_DB_URL` or `DATABASE_URL` is set, and the project's `supabase_db_<id>` container publishes the DB port.        |
| `ci-web-env.mjs`         | `make ci-start`                        | Writes `web/.env.development.local` with `VITE_SUPABASE_ANON_KEY` from `supabase status`.                                                                                                             |
| `lan-url.mjs`            | `make dev`, `make preview`             | Prints the localhost and LAN https URLs using `webPort()` / `previewPort()` from `web/build/ports.ts`.                                                                                                |
| `rebuild-caches.mjs`     | `make rebuild-caches`                  | For every profile, POSTs the `rebuild-caches` Edge Function with the service-role key. Refuses to run if `.stack.env` project id differs from the environment (run through make).                     |
| `build-kill-switch.ts`   | `make sw-kill-switch`                  | Replaces `web/dist/sw.js` with the kill-switch worker via `web/build/service-worker-plugin.ts`. Refuses local builds unless `KILL_SWITCH_ALLOW_LOCAL_FLAG` is `1`.                                    |

## Subdirectories

| Directory  | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog/` | YAML to `supabase/seed.sql` generator and validator: `make catalog`, `make catalog-check` (see `catalog/AGENTS.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `icons/`   | Renders the logo sprite to PNG icons and `favicon.svg`: `make icons`, `make icons-check` (see `icons/AGENTS.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `balance/` | XP balance simulator and tuner: `make sim`, `make sim-check` (see `balance/AGENTS.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `deploy/`  | Admin-only test-environment tooling (see `docs/deploy.md`). `rules.ts` and `pages-headers.ts` hold the pure parts and are unit tested in `tests/deploy/`. `deploy-env.ts` loads and checks `~/.config/gainscape/deploy.env`. The I/O scripts: `deploy.ts` (`make deploy`), `build-pages.ts` (`make build-pages`), `set-loot-secret.ts`, `rebuild-hosted.ts`, `backup-hosted.ts`, `invite-tester.ts`, `ban-tester.ts` and `remove-tester.ts` (invite-only accounts through the Auth admin API, shared lookup in `admin-users.ts`, rules in `testers.ts`; deploy and invite first check that hosted sign-up is closed), and `secrets-scan.ts` (pinned, checksum-verified gitleaks that first proves its rules catch planted secrets) |

## For AI Agents

### Working In This Directory

- No comments, like all code. ESLint covers `.mjs` and `.ts` here.
- Script failures print a one-line reason to stderr and `process.exit(1)`. Keep that contract; the Makefile and CI depend on the exit code.
- The safety scripts (`assert-local-db.mjs`, `ensure-loot-secret.mjs`, `rebuild-caches.mjs`) exist to stop work against a hosted project or with a weak secret. Do not weaken them.
- Scripts import from `web/build/` and `web/src/components/` and from the shared domain, so a rename there breaks them. `tsconfig.json` type-checks this directory.
- Makefile target names are the public interface. Document or change a script together with its target.

### Testing Requirements

- Covered by tests: `catalog/*` (`tests/catalog/`), `icons/png.ts` and `icons/render.ts` (`tests/web/png.test.ts`, `tests/web/manifest.test.ts`), `balance/*` (`tests/balance/balance-bands.test.ts`, `tests/catalog/sim-catalog.test.ts`), `build-kill-switch.ts` (`e2e/pwa/update.spec.ts`, run by `make e2e-pwa`).
- Not covered by a dedicated test: `assert-local-db.mjs`, `ci-web-env.mjs`, `ensure-loot-secret.mjs`, `lan-url.mjs`, `rebuild-caches.mjs` (`tests/integration/rebuild-caches.test.ts` calls the Edge Function directly, not this script), `wait-for-functions.mjs`. Verify them by running the Makefile target.
- Put new pure logic in a function the existing suites can import, with its test written first. Stack helpers need the local stack.

### Common Patterns

- Paths resolve from `import.meta.dirname`.
- `execFileSync('npx', ['supabase', 'status', '-o', 'json'])` and then `JSON.parse(output.slice(output.indexOf('{')))` to read stack URLs and keys.
- `--check` flag: compare generated output with the committed file and exit 1 when stale (`catalog/generate.ts`, `icons/build.ts`).
- `scripts/catalog/generate.ts` guards its CLI part with `import.meta.main` so tests can import it. Other CLIs run unguarded, so tests import CLI-free modules instead (for example `balance/tune.ts`, `balance/bands.ts`). Follow one of these two patterns for new testable scripts.

## Dependencies

### Internal

- `../Makefile`, `../supabase/functions/_shared/domain/`, `../web/build/`, `../web/src/components/pixel-sprites.ts`, `../catalog/`

### External

- `postgres` (rebuild-caches), `yaml`, `zod` (catalog), Supabase CLI, Docker (`assert-local-db.mjs`)

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
