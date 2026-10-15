# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue. Use **Report a vulnerability** on the repository's [Security tab](https://github.com/sebastianpantin/gainscape/security/advisories/new).

Include what you found, the steps to reproduce it and the impact you expect. You will get an answer within a week.

## Scope

In scope: the code in this repository, including the row-level security policies, SQL functions, Edge Functions and the web app.

Out of scope: the hosted test environment's infrastructure (Supabase and Cloudflare Pages themselves), denial of service and volume testing, and social engineering. Never test against the hosted environment or other people's accounts; run the local stack instead (see [README.md](README.md)).

## Supported versions

Only the latest commit on `main` is supported.
