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

| Command                     | What it does                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `make reset`                | Recreate the local database from migrations and seed                                                                   |
| `make check`                | Static gates: Prettier check, ESLint (including the no-comments rule), `tsc`, `deno check`                             |
| `make test`                 | `make check`, then domain tests, web draft/sync tests, integration/RLS tests and `make test-db`                        |
| `make test-db`              | pgTAP tests in `supabase/tests/` against the local database                                                            |
| `make sim-check`            | Balance band test (about 15 s)                                                                                         |
| `make sim`                  | Full balance tuning report (about 2 min)                                                                               |
| `make e2e`                  | Playwright end-to-end flow in a headless phone-sized browser                                                           |
| `make format` / `make lint` | Auto-format the repo / lint it                                                                                         |
| `make rebuild-caches`       | Recompute every user's XP, e1RM, records and feed events from their logged sets (run after changing balance constants) |
| `make types`                | Regenerate `web/src/lib/database.types.ts` from the local schema                                                       |
| `make catalog`              | Regenerate `supabase/seed.sql` from `catalog/*.yaml` (`make catalog-check` fails when it is stale)                     |
| `make stop`                 | Stop the functions server and the Supabase stack                                                                       |

Studio (the database UI) runs at http://127.0.0.1:54323 while the stack is up.

To run a second stack side by side (for example from a git worktree), put a gitignored `.stack.env` at the repo root with a distinct `SUPABASE_PROJECT_ID`, `SUPABASE_*_PORT` overrides (the Supabase CLI reads these in place of `config.toml` values) and `GAINSCAPE_WEB_PORT`. The Makefile exports it to every target. Without the file everything uses the defaults above.

## Existing data after S6a

Feed events are derived from session summaries. A database that already held sessions before migration 011 has none, so run `make rebuild-caches` once (or `make reset`) to backfill them.

## Loot secret

Loot rolls are seeded with HMAC-SHA256 under `LOOT_SECRET`, which only the Edge Functions see. `make functions` (and so `make start` and `make reset`) creates the gitignored `supabase/functions/.env.local` with a random secret on first use, serves the functions with it, and restarts an already running functions server whose env file changed. A hosted deploy sets its own secret once with `supabase secrets set LOOT_SECRET=$(openssl rand -hex 32)`. Without a secret of at least 32 characters, `complete-session` answers 500 `loot_secret_missing` and the draft retries.

Anonymous username checks are rate limited per client address, read from `private.client_ip_config` (`header_name`, `trusted_hops_from_right`). The default, the right-most `x-forwarded-for` hop, is what local Kong appends. Before production, set it to the hosting platform's trusted client-IP header (or the number of trusted proxy hops) and verify it against live request headers. Addresses are stored only as HMAC-SHA256 under a random pepper that migration 012 generates in `private.client_key_pepper`.

## Layout

- `supabase/functions/_shared/domain/`: the pure game engine, shared by the Edge Function and the web app. All tuning constants are in `balance.ts`.
- `supabase/functions/complete-session/`: the server-authoritative sync endpoint.
- `supabase/functions/export-data/`, `supabase/functions/delete-account/`: account export (JSON of the caller's rows) and deletion (requires typing your username).
- `supabase/migrations/`: schema and row-level security.
- `catalog/*.yaml`: the single source of seed data (skills, exercises, programs, items, drop tables); `scripts/catalog/generate.ts` writes `supabase/seed.sql` from it.
- `web/`: the React PWA (Vite root).
- `tests/`: Vitest domain tests, plus integration tests against the local stack.

The full plan lives in `../.omc/plans/2026-09-28-gainscape.md`.
