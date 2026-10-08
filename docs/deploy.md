# Deploying the test environment

Gainscape's test environment runs on free tiers. A **Supabase Free** project holds the database, auth and Edge Functions; **Cloudflare Pages** serves the web app on `*.pages.dev`. It needs no domain and no mail provider.

- Sign-up is **invite-only**: you create each tester's account.
- Email confirmation is off, so testers' email addresses are never verified.

Only the admin deploys, from their own machine. Nothing in CI holds deploy credentials.

## Secrets

| Secret                          | Lives in                                                                               | Readable by            |
| ------------------------------- | -------------------------------------------------------------------------------------- | ---------------------- |
| Secret API key (`sb_secret_…`)  | Supabase dashboard, `~/.config/gainscape/deploy.env`                                   | Admin only             |
| Database password               | Supabase dashboard, `~/.config/gainscape/deploy.env`                                   | Admin only             |
| `LOOT_SECRET`                   | Supabase function secrets only (set by `make set-loot-secret`, never printed or saved) | Admin, Edge Functions  |
| Supabase CLI token              | `~/.supabase/` (from `npx supabase login`)                                             | Admin only             |
| Cloudflare login                | `~/.config/.wrangler/` (from `npx wrangler login`)                                     | Admin only             |
| Backups and the gpg private key | `~/gainscape-backups/`, encrypted to your key                                          | Admin only             |
| A tester's first password       | Shown once on your terminal by `make invite-tester`                                    | Admin, then the tester |

The project URL and the publishable key (`sb_publishable_…`) are public by design. They ship in the web app and grant only what row-level security allows.

The tooling enforces this:

- **The deploy settings stay out of the repo.**
  - Every deploy script reads `~/.config/gainscape/deploy.env`.
  - The scripts refuse a settings file that other users can read (`chmod 600`), one owned by someone else, or a symlink.
  - They refuse to run if any `deploy.env` or `.deploy.env` exists inside the repo, even an ignored one.
- **`make check` runs `make secrets-scan`.**
  - It runs a pinned, checksum-verified gitleaks over the full git history of every branch, the working tree and untracked files.
  - It adds rules for Postgres URLs with a password, `sb_secret_` keys, `LOOT_SECRET` values and `service_role` JWTs. Each run first checks that gitleaks still catches a planted example of every one.
  - Inline `gitleaks:allow` comments are ignored, and a `.gitleaksignore` file fails the scan.
  - CI checks out the full history for it.
  - `make hooks` installs a pre-commit hook that scans every commit's staged changes.
- **The web build is restricted.**
  - It gets only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. It stops on any other `VITE_*` variable, and on any `web/.env`, `web/.env.local` or `web/.env.production*` file, since Vite would load those into the bundle.
  - It is built and scanned **before** anything changes on the hosted project. The scan fails on the secret key, the database password, any `sb_secret_` key, any `service_role` JWT or any Postgres URL with a password.
  - `make deploy` refuses a secret key pasted where the publishable key belongs, and a legacy JWT key in either slot.
- **The secret key goes only in the `apikey` header.** Hosted Supabase rejects it as a `Bearer` token, since it is not a JWT, and rejects it from a browser. The admin scripts never send an `Authorization` header with it.
- **Each CLI gets only what it needs.** That is `PATH`, `HOME` and `XDG_CONFIG_HOME`, plus `XDG_RUNTIME_DIR` and `DBUS_SESSION_BUS_ADDRESS` so the Supabase CLI can read the login that `supabase login` keeps in the desktop keyring, plus `SUPABASE_DB_PASSWORD` only for `db push` and `db dump`. Secrets never appear as command-line arguments, so they never show in the process list. wrangler and the Supabase CLI run from `node_modules`, pinned by the lockfile. The scripts call the Supabase CLI's native binary directly, because piped input has been seen not to reach it through the npm wrapper; Linux musl builds are found too.
- **Edge Functions answer unexpected errors with `internal_error` only.** A test fails if a new log line is added anywhere in `supabase/functions/` without review.

## Abuse and rate limits

- **No strangers.** Sign-up is off in the Auth settings, so only accounts you create can sign in. Someone who tries to sign up is told it is invite-only. `make deploy` and `make invite-tester` read the project's public Auth settings first and refuse to run unless sign-up is off and email is the only sign-in provider (anonymous sign-ins included), so a forgotten or reverted toggle cannot go unnoticed.
- **Passwords** need at least 12 characters, in the app and in Auth. Supabase's per-IP limits on sign-in and token requests stay at the platform defaults; write the values you see in the dashboard here: `____`.
- **Per-user write limits** (rows in `private.rate_limit_rules`, raised as HTTP 429):
  - sessions: 20 created an hour and 60 a day, 60 edits an hour, 30 deletes an hour;
  - account: 5 exports an hour, 5 account deletions an hour;
  - social: 30 friend requests a minute and 100 a day, 120 gz a minute;
  - other writes: 30 crafts a minute, 30 custom exercise saves an hour, 30 program saves an hour, 60 pin changes a minute, 60 profile updates an hour. One save counts once, however many rows it touches, and reordering all pins counts once;
  - anonymous username checks: per IP, plus a global ceiling.

  Writes made by the Edge Functions themselves are never limited.

- **Hard caps:** custom exercises, programs and friends per user, 50 pinned exercises, 200 sets per workout, 1000 rows per API read.
- **Not limited:** reads (feed, hiscores, profiles) and writes that fail. A tester could burn free quota with them. That is accepted: with invite-only sign-up, every caller is a tester you invited, and banning them stops it.
- **Denial of service.**
  - The web app sits behind Cloudflare's always-on DDoS protection.
  - The API is reached directly at `*.supabase.co`, behind Supabase's platform protection.
  - A large attack could exhaust the free quotas. That makes the test environment unavailable; it costs nothing, because a free organisation has no payment method.
- **Cross-origin requests.** The Edge Functions allow any origin (`Access-Control-Allow-Origin: *`). That is safe because sign-in uses bearer tokens, not cookies, so another site cannot act as a signed-in user.

## One-time setup

1. Turn on 2FA for GitHub, Supabase and Cloudflare. Keep yourself the only member of the Supabase organisation and the Cloudflare account, keep the repo private, and turn on Dependabot alerts (Settings → Code security).
2. Create a free Supabase project, in the region closest to the testers (`eu-north-1` if offered). Turn on usage email alerts.
3. In the Supabase dashboard:
   - Authentication → Sign In / Providers: turn **Allow new users to sign up** off, **Confirm email** off, and **Allow anonymous sign-ins** off. Leave every provider except Email off.
   - Authentication → Sign In / Providers → Email: turn **Secure password change** on. The app's own current-password check runs only in the browser, so this setting is what stops someone holding a session token from changing the password.
   - Authentication → Sign In / Providers → Password: set the minimum length to 12.
   - Authentication → URL Configuration: set **Site URL** to the Pages URL (`https://<project>.pages.dev`).
   - Settings → API Keys: copy the publishable key and the `default` secret key. The Edge Functions use the same `default` key, so `rebuild-caches` accepts it. Do not use the legacy `anon` and `service_role` keys: nothing in the app or the tooling reads them. Once the first deploy works, disable them under Legacy API Keys.

   Never run `supabase config push`: the repo's `config.toml` is written for the local stack (see `production-auth.md`).

4. Create a Cloudflare Pages project with **direct upload**, with production branch `main`, and do not connect it to GitHub.
5. Backups are optional until testers have data you would miss. To turn them on, make a gpg key if you have none (`gpg --full-generate-key`), back up its private key somewhere safe and offline (without it, no backup can be read), and set `GPG_RECIPIENT` in step 7.
6. On your machine (Docker must be running for `supabase functions deploy` and `db dump`):

   ```sh
   npm ci
   make hooks
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx wrangler login
   install -d -m 700 ~/.config/gainscape
   install -m 600 /dev/null ~/.config/gainscape/deploy.env
   ```

7. Fill in `~/.config/gainscape/deploy.env`:

   ```sh
   SUPABASE_PROJECT_REF=<project-ref>
   SUPABASE_DB_PASSWORD=<database password>
   SUPABASE_SECRET_KEY=<the default sb_secret_… key, Settings → API Keys>
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_… key, Settings → API Keys>
   CLOUDFLARE_PAGES_PROJECT=<pages project name>
   GPG_RECIPIENT=<optional: 40-character fingerprint of your gpg key>
   ```

   The scripts refuse a key with the wrong prefix. Only `make backup-hosted` needs `GPG_RECIPIENT`.

8. Run `make set-loot-secret`, then `make deploy`.
9. Finish the checks in "Before inviting testers", then invite the first tester.

## Every deploy

On `main` at `origin/main` with a clean tree:

```sh
make backup-hosted
make deploy
```

Skip `make backup-hosted` while `GPG_RECIPIENT` is unset.

`make deploy` first checks the settings file, the git state and the linked project. Then it:

1. builds and scans the web app;
2. asks you to confirm the backup, when `GPG_RECIPIENT` is set;
3. shows the migration dry run and asks for `yes`;
4. pushes the migrations and the seed (`--include-seed` every time: the CLI re-runs the seed only when it changed, and the seed is idempotent);
5. deploys the Edge Functions, with the settings in `supabase/config.toml` (`rebuild-caches` skips the gateway's JWT check and checks the secret key itself);
6. uploads the web app.

The web app never goes live before its migrations.

Migration 032 adds the check `scrolls_grant_a_challenge` as `not valid`, so existing scroll rows keep a null `grants_challenge_id` until the catalog seed runs. `make deploy` pushes the seed together with the migrations; if you ever push 032 another way, run the seed right after it.

After a `BALANCE_VERSION` bump, run `make rebuild-caches-hosted` right after the deploy.

## Testers

- `make invite-tester EMAIL=mira@example.test USERNAME=mira_lifts` creates a confirmed account and prints a one-time password **once**. Send it privately; the tester changes it under Profile → Settings → Change password. Set `TIMEZONE=` to override the default `Europe/Stockholm`.
- `make ban-tester EMAIL=…` stops the tester signing in again and keeps their data, so you can look at what happened. Lift a ban under Authentication → Users.
- `make remove-tester EMAIL=…` asks you to type the email, then deletes the account and every row it owns.
- **A tester forgot their password.** No reset email is sent. Set a new one under Authentication → Users in the dashboard.
- **Changing an email.** With email confirmation off, Supabase may apply the change at once, without any check. Test it once on the hosted project (see "Before inviting testers") and note here what happens: `____`. If the change applies directly, hide the change-email form on the hosted build before inviting testers.

## When something goes wrong

- **The project paused.** Free projects pause after about a week without activity. Resume it from the dashboard. Testers' offline workouts stay on their devices and sync after the resume.
- **Abuse or a suspected breach.** Act in this order, and stop once the problem stops:
  1. **Ban the account involved** with `make ban-tester`. It keeps the evidence, unlike `make remove-tester`. A ban does not end a session already open: an access token stays valid for up to an hour.
  2. **To cut everyone off at once, pause the project** (Settings → General), or rotate the JWT signing key (Settings → JWT Keys), which ends every session. Disabling the Email provider under Sign In / Providers stops new sign-ins only.
  3. **Rotate the affected secrets** (below), then resume.
- **A broken web build shipped.** Deploy the previous commit. If the service worker itself is broken, build the kill switch (`make sw-kill-switch`) into `web/dist` and upload it with `npx wrangler pages deploy web/dist`.

## Backups and restore

`make backup-hosted` needs `GPG_RECIPIENT` and writes three gpg-encrypted dumps (roles, schema, data) to `~/gainscape-backups/`. Each one is written as a `.partial` file and renamed only when both the dump and gpg finish, so a failed run leaves nothing that looks like a backup. Plain dumps never touch the disk: they contain user emails and password hashes.

To restore into a fresh Supabase project:

```sh
read -rs PGPASSWORD && export PGPASSWORD
psql --single-transaction -v ON_ERROR_STOP=1 -h aws-0-<region>.pooler.supabase.com -p 5432 -U postgres.<ref> -d postgres \
  -f <(gpg -d ~/gainscape-backups/<stamp>-roles.sql.gpg) \
  -f <(gpg -d ~/gainscape-backups/<stamp>-schema.sql.gpg) \
  -c 'SET session_replication_role = replica' \
  -f <(gpg -d ~/gainscape-backups/<stamp>-data.sql.gpg)
```

- The host is the **session pooler** (port 5432), because the direct database host of a free project is reachable over IPv6 only. Use the direct host only if your machine has IPv6.
- `session_replication_role = replica` stops triggers (profile creation, rate limits) from firing again on restored rows.
- Afterwards, link the CLI to the new project and run `npx supabase migration list`. Every migration should show as applied. If any does not, mark it with `npx supabase migration repair --status applied <version>` rather than re-running it.
- Then deploy the Edge Functions, set `LOOT_SECRET` again, and update `deploy.env`.
- A fresh project starts with sign-up **on**. Redo "One-time setup" step 3 before anything else touches it (`make deploy` refuses until you do), then work through "Before inviting testers" again, including the client IP check.
- Rehearse a restore once into a scratch project before relying on it. Check that testers can sign in afterwards: that proves the data dump carried the `auth` schema. Note the result here: `____`.

## Rotating a secret

| Leaked                          | Do this                                                                                                                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret API key                  | Replace the `default` secret key under Settings → API Keys and put the new one in `deploy.env`. Then run `make rebuild-caches-hosted` to check that the Edge Functions see the same key. |
| Database password               | Reset it under Settings → Database and update `deploy.env`. Then log a workout to check that the Edge Functions still reach the database.                                                |
| `LOOT_SECRET`                   | Run `make set-loot-secret` again. Drops already rolled stay; new rolls use the new secret.                                                                                               |
| Supabase CLI token              | Revoke it under Account → Access Tokens, then run `npx supabase login` again.                                                                                                            |
| Cloudflare login                | Run `npx wrangler logout`, revoke the token in the Cloudflare dashboard, then run `npx wrangler login`.                                                                                  |
| A secret shipped in a web build | Rotate that secret, deploy a clean build, and delete the affected deployments in the Pages dashboard: every deployment stays reachable at its own `<hash>.<project>.pages.dev` URL.      |
| gpg key                         | Make a new key, update `GPG_RECIPIENT`, and take a new backup. Old backups stay readable only with the old key.                                                                          |

Afterwards, check the Supabase auth and API logs, and the Cloudflare audit log, for use you do not recognise.

## Before inviting testers

- **Smoke test.** Sign in as an invited tester, log a lift and a run, check the reveal and history, edit a workout, add a second tester as a friend and see the feed, install the PWA, and log offline and sync.
- **Sign-up is closed.** Signing up from the app shows the invite-only message.
- **Email change.** As a test tester, try changing the email under Settings and note what happens (see "Testers").
- **Password change.** A direct `PUT /auth/v1/user` with a new password and an access token from a sign-in more than a day old must be refused (Secure password change). The app always signs in again before changing the password, so its own form keeps working.
- **Client IP.** Find the client IP header Supabase's own proxy appends, and set `private.client_ip_config` (`header_name`, `trusted_hops_from_right`) so the rightmost trusted hop is the real client. Check it with a request that sends a forged `X-Forwarded-For`: the anonymous username-check bucket must not follow the forged value.
- **Secret key.** Run `make rebuild-caches-hosted`. It must rebuild every user. A 403 `secret_key_required` means `deploy.env` does not hold the key the Edge Functions see as `default`.
- **JWT signing keys.** If the project switches to asymmetric JWT signing keys, check again that the signed-in functions (`verify_jwt = true`) still accept user tokens: log a workout.
- **Legacy keys are off.** After disabling them, a request with the old `anon` JWT as `apikey` is refused, and the app still works.
- **Security advisor.** Run it and fix its findings.
- **Timing.** Time `complete-session` and `rebuild-caches` for a user with about 20 sessions. Note the numbers here: `____`.
