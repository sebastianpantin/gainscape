# Gainscape

A strength-training logger with OSRS-inspired skills, XP and levels. Slices S1–S2 run fully locally on the Supabase stack in Docker. No cloud account is needed.

## Run it

```sh
npm install
make start   # Supabase stack + edge functions (first run downloads Docker images)
make dev     # web app; prints the https URLs for this machine and your phone
```

Open the printed URL, accept the self-signed certificate, create an account, log a workout, then press **Finish workout**.

## Everyday commands

| Command                     | What it does                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `make reset`                | Recreate the local database from migrations and seed                                                                                          |
| `make check`                | Static gates: Prettier check, ESLint (including the no-comments rule), `tsc` (app and service worker), `deno check`, catalog and icons checks |
| `make test`                 | `make check`, then domain tests, web draft/sync tests, integration/RLS tests and `make test-db`                                               |
| `make test-db`              | pgTAP tests in `supabase/tests/` against the local database (refuses any non-local host)                                                      |
| `make sim-check`            | Balance band test (about 15 s)                                                                                                                |
| `make sim`                  | Full balance tuning report (about 2 min)                                                                                                      |
| `make e2e`                  | Playwright end-to-end flow in a headless phone-sized browser                                                                                  |
| `make e2e-pwa`              | Builds the production bundle and runs the offline, update and installability tests against `vite preview`                                     |
| `make preview`              | Production build served by `vite preview` (https, preview port = web port - 1000, so 4173 by default)                                         |
| `make icons`                | Regenerate the app icons and favicon from the pixel sprites (`make icons-check` fails when they are stale)                                    |
| `make format` / `make lint` | Auto-format the repo / lint it                                                                                                                |
| `make rebuild-caches`       | Recompute every user's XP, e1RM, records and feed events from their logged sets (run after changing balance constants)                        |
| `make types`                | Regenerate `web/src/lib/database.types.ts` from the local schema                                                                              |
| `make catalog`              | Regenerate `supabase/seed.sql` from `catalog/*.yaml` (`make catalog-check` fails when it is stale)                                            |
| `make stop`                 | Stop the functions server and the Supabase stack                                                                                              |

Studio (the database UI) runs at http://127.0.0.1:54323 while the stack is up.

To run a second stack side by side (for example from a git worktree), put a gitignored `.stack.env` at the repo root with a distinct `SUPABASE_PROJECT_ID`, `SUPABASE_*_PORT` overrides (the Supabase CLI reads these in place of `config.toml` values) and `GAINSCAPE_WEB_PORT`. The Makefile exports it to every target. Without the file everything uses the defaults above.

## Install on your phone

The production build is an installable PWA: a service worker keeps the app shell, fonts and icons on the device, so the Train tab opens without signal, shows your saved draft and lets you add exercises from the last exercise list it saw. The workout syncs once you are back online. Supabase traffic is never cached.

- Android Chrome: open the app, then use "Install Gainscape" in Profile → Settings → App (or the browser menu).
- iPhone Safari: tap Share, then Add to Home Screen.

`make dev` never registers a service worker. To try the offline shell on a phone before deploying, run `GAINSCAPE_PLAIN_HTTP=1 make preview` (plain http) and forward the port over USB, because phones refuse service workers on the self-signed LAN certificate: `adb reverse tcp:4173 tcp:4173`, then open `http://localhost:4173` in Android Chrome (`localhost` counts as a secure origin). iOS has no equivalent before deploy.

New versions install in the background. A banner offers "Reload"; it saves open drafts and waits for any running Finish (the per-user finish lock) before it activates the new version, and every open tab then reloads.

Recovery notes:

- A broken service worker is retired with the kill switch: `make sw-kill-switch` builds the app and then replaces `web/dist/sw.js` with `web/src/sw/kill-switch.ts`, which activates at once, deletes the `gainscape-shell-*` caches, unregisters and reloads every open tab. Deploy that `dist`, then ship a normal build once the fix is in.
- The host must serve the build byte for byte. The service worker checks every precached file against its SHA-256, so a host that rewrites HTML (beacon injection, email obfuscation) blocks every update.
- Draft formats must stay readable by the previous build: a new draft format ships only after a release that can already read it, because a tab can keep running the old bundle until it reloads.

## Existing data after S6a

Feed events are derived from session summaries. A database that already held sessions before migration 011 has none, so run `make rebuild-caches` once (or `make reset`) to backfill them.

## Loot secret

Loot rolls are seeded with HMAC-SHA256 under `LOOT_SECRET`, which only the Edge Functions see. `make functions` (and so `make start` and `make reset`) creates the gitignored `supabase/functions/.env.local` with a random secret on first use, serves the functions with it, and restarts an already running functions server whose env file changed. A hosted deploy sets its own secret once with `supabase secrets set LOOT_SECRET=$(openssl rand -hex 32)`. Without a secret of at least 32 characters, `complete-session` answers 500 `loot_secret_missing` and the draft retries.

Anonymous username checks are rate limited per client address, read from `private.client_ip_config` (`header_name`, `trusted_hops_from_right`). The default, the right-most `x-forwarded-for` hop, is what local Kong appends. Before production, set it to the hosting platform's trusted client-IP header (or the number of trusted proxy hops) and verify it against live request headers. Addresses are stored only as HMAC-SHA256 under a random pepper that migration 012 generates in `private.client_key_pepper`.

## Email and auth

Signups need email confirmation. Locally every email lands in Mailpit, which `npx supabase status` lists as `MAILPIT_URL` (run it through `make` or with `.stack.env` loaded). Confirm, reset and email-change links open `/auth/confirm` on the origin that asked for them. Links asked for from a LAN IP address fall back to `https://localhost:5173`, because GoTrue accepts only loopback or allowlisted hostnames as redirect hosts.

Before anything goes live, work through [docs/production-auth.md](docs/production-auth.md): production SMTP, the hosted redirect and rate-limit settings (never `supabase config push` the local `config.toml` unchanged), `LOOT_SECRET`, `private.client_ip_config` and the backfill. `make test-db` only runs against the local stack and refuses any other database host.

## CI

`.github/workflows/ci.yml` runs two jobs. `static` runs `make check`, the catalog, domain and web tests and `make sim-check` without a stack. `stack` runs `make ci-start` (the stack without Studio, storage, realtime and the other services the tests don't use, plus the web env file with the stack's anon key and the functions), then `make test-integration`, `make test-db`, `make e2e` and `make e2e-pwa`. On failure, `make ci-logs` saves every container log to `ci-logs/`, which is uploaded with the Playwright report and traces.

## Layout

- `supabase/functions/_shared/domain/`: the pure game engine, shared by the Edge Function and the web app. All tuning constants are in `balance.ts`.
- `supabase/functions/complete-session/`: the server-authoritative sync endpoint.
- `supabase/functions/export-data/`, `supabase/functions/delete-account/`: account export (JSON of the caller's rows) and deletion (requires typing your username).
- `supabase/migrations/`: schema and row-level security.
- `catalog/*.yaml`: the single source of seed data (skills, exercises, programs, items, drop tables); `scripts/catalog/generate.ts` writes `supabase/seed.sql` from it.
- `web/`: the React PWA (Vite root). `web/public/` holds the manifest, the generated icons and the font licenses; `web/src/pwa/` the shell rules, update flow and install prompt; `web/src/sw/` the service worker; `web/build/` the Vite plugin that builds `sw.js` with its precache list.
- `scripts/icons/`: the PNG encoder and icon renderer behind `make icons`.
- `tests/`: Vitest domain tests, plus integration tests against the local stack.

The full plan lives in `../.omc/plans/2026-09-28-gainscape.md`.
