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

| Command                     | What it does                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `make reset`                | Recreate the local database from migrations and seed                                                      |
| `make check`                | Static gates: Prettier check, ESLint (including the no-comments rule), `tsc`, `deno check`                |
| `make test`                 | `make check`, then domain tests, web draft/sync tests and integration/RLS tests against the local stack   |
| `make sim-check`            | Balance band test (about 15 s)                                                                            |
| `make sim`                  | Full balance tuning report (about 2 min)                                                                  |
| `make e2e`                  | Playwright end-to-end flow in a headless phone-sized browser                                              |
| `make format` / `make lint` | Auto-format the repo / lint it                                                                            |
| `make rebuild-caches`       | Recompute every user's XP, e1RM and records from their logged sets (run after changing balance constants) |
| `make types`                | Regenerate `web/src/lib/database.types.ts` from the local schema                                          |
| `make stop`                 | Stop the functions server and the Supabase stack                                                          |

Studio (the database UI) runs at http://127.0.0.1:54323 while the stack is up.

## Layout

- `supabase/functions/_shared/domain/`: the pure game engine, shared by the Edge Function and the web app. All tuning constants are in `balance.ts`.
- `supabase/functions/complete-session/`: the server-authoritative sync endpoint.
- `supabase/migrations/`, `supabase/seed.sql`: schema, row-level security and seed data.
- `web/`: the React PWA (Vite root).
- `tests/`: Vitest domain tests, plus integration tests against the local stack.

The full plan lives in `../.omc/plans/2026-09-28-gainscape.md`.
