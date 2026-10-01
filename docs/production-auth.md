# Production auth and go-live checklist

`supabase/config.toml` is written for the local stack. This page lists what a hosted Supabase project needs before real users sign up. Nothing here is applied automatically.

## Never push the local config unchanged

The local `config.toml` has settings that are only safe on a laptop:

- `site_url = "https://localhost:5173"`
- redirect globs for `localhost`, `127.0.0.1`, `192.168.*.*` and `10.*.*.*`
- `[auth.rate_limit]` limits raised to 1000 (`email_sent`, `sign_in_sign_ups`, `token_verifications`) so the test suites never hit them

Before any `supabase config push`, set the hosted values below in a copy of the file (or in the dashboard). Do not run `supabase config push` with the local file as it is.

## SMTP

The local stack sends mail to Mailpit. A hosted project needs a real provider. With Resend as the example:

| Setting     | Value                                            |
| ----------- | ------------------------------------------------ |
| Host        | `smtp.resend.com`                                |
| Port        | `465`                                            |
| User        | `resend`                                         |
| Password    | the provider's API key                           |
| Sender      | `Gainscape <noreply@<domain>>`                   |
| Domain auth | SPF and DKIM records for `<domain>`, as provided |

Set them in the dashboard (Authentication → Emails → SMTP settings), or in `[auth.email.smtp]` and push with the password read from the environment:

```toml
[auth.email.smtp]
enabled = true
host = "smtp.resend.com"
port = 465
user = "resend"
pass = "env(SUPABASE_AUTH_SMTP_PASS)"
admin_email = "noreply@<domain>"
sender_name = "Gainscape"
```

## Auth settings for the hosted project

- `site_url` is the production origin, for example `https://gainscape.<domain>`.
- `additional_redirect_urls` lists the exact callback URLs, with no globs: `https://gainscape.<domain>/auth/confirm`. Every email link goes to `{{ .RedirectTo }}`, so a loose glob hands a login or reset token to whatever host matches it.
- `enable_confirmations = true` and `secure_password_change = true` stay on.
- `[auth.rate_limit] email_sent = 30` per hour. Keep the other auth limits at the platform defaults.
- The templates in `supabase/templates/` (`confirmation.html`, `recovery.html`, `email_change.html`) and their subjects ship with `config push`. Check them in the dashboard after the push.

GoTrue only honours redirect hosts that are loopback addresses or names that match an allowlist entry. Links requested from a LAN IP address, such as a phone on `https://192.168.1.20:5173`, fall back to `site_url`. That is fine locally, and it is why production must use a real hostname.

## Account confirmation and the pre-hijack fix

Migration 014 adds a trigger that gives an account a random password when an emailed signup confirmation is accepted. After the confirm link, the app asks the owner to choose a password and lets them change the username for one hour. Someone who signed up with another person's email therefore never keeps access once that person confirms. Nothing needs configuring, but keep `enable_confirmations` on, or the protection does nothing.

## Other secrets and settings

- **Loot secret.** Set it once per project: `supabase secrets set LOOT_SECRET=$(openssl rand -hex 32)`. Without a secret of at least 32 characters, `complete-session` answers 500 `loot_secret_missing`.
- **Client IP for anonymous rate limits.** Before go-live, set `private.client_ip_config` (`header_name`, `trusted_hops_from_right`) to the hosting platform's trusted client-IP header or proxy hop count, then check it against live request headers. The default, the right-most `x-forwarded-for` hop, is only correct behind the local Kong.

## Tests never run against a hosted database

`make test-db` runs pgTAP, which creates a `tests` schema and inserts and deletes users. It refuses to run unless the database reported by `supabase status` is on `127.0.0.1` or `localhost`, and it always passes `--local`. Never run `supabase test db --linked` or `--db-url` against a hosted project. The same goes for `make test-integration`, `make e2e` and `make reset`: they all assume the local stack.

## Go-live checklist

- [ ] SMTP provider set up, with SPF and DKIM passing for the sender domain.
- [ ] `site_url`, the exact redirect URL and `email_sent = 30` set on the hosted project.
- [ ] `enable_confirmations` and `secure_password_change` are on.
- [ ] Templates pushed and checked in the dashboard.
- [ ] Signup delivers a confirmation email to a non-team address, and its link confirms the account.
- [ ] `LOOT_SECRET` is set.
- [ ] `private.client_ip_config` matches the platform's client-IP header.
- [ ] Feed events are backfilled once: `make rebuild-caches` does this for the local stack, and a hosted project needs the same `rebuild-caches` call (with the service role key) for every user.
