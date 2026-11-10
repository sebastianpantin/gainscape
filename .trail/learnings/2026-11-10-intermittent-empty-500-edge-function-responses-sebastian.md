---
title: Intermittent empty/500 Edge Function responses in integration runs come from the local…
author: Sebastian
date: 2026-11-10
id: l-babae25a
scope: repo
status: active
touches:
  - tests/integration/local-stack.ts
---

## Decided
On 2026-10-01 (cardio PR #19), intermittent integration failures ("Unexpected end of JSON input", 503 with no body, or 500 `{"code":"Internal Server Error"}`) were traced to the Supabase edge runtime. Under `[edge_runtime] policy = "per_worker"`, CPU time adds up across requests. When a worker hits its CPU soft limit it retires, and a request routed to it is dropped. The runtime logs show `WorkerAlreadyRetired` or `connection aborted (uri: ...)`. Switching to `oneshot` failed in CI on its first run, so `per_worker` was kept. `tests/integration/local-stack.ts` `fetchFunction` now retries up to twice on a 5xx whose body has no app `error` key.

**Why:** the failure looks like an app bug and invites "flake" reruns. The root cause sits outside the repo's code.

## Watch out
when an integration test gets an empty or bodiless 5xx, first grep the functions log (`.functions-serve.log` locally, `ci-logs/supabase_edge_runtime_gainscape.log` in the CI `backend-logs` artifact) for `CPU time soft limit`, `WorkerAlreadyRetired` or `connection aborted`. Then decide whether it is this runtime issue. Never retry an app error, meaning a body with `error`.

_From Claude Code's memory of this repo, last updated Oct 1._
