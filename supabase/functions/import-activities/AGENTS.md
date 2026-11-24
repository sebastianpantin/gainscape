# import-activities

**Parent context:** `../AGENTS.md`
**Generated:** 2026-11-24 · **Updated:** 2026-11-24

## Purpose

POST endpoint behind Import from a file: it takes Garmin activities the user confirmed in the Import review, stores each as a Session (one Cardio set, or the Lift sets of a strength activity) and remembers each in `public.garmin_activities`. The file itself never reaches the server; the browser parses it and sends only what hand-logged sets would hold, plus the start time that identifies the Garmin activity.

## Map

- `index.ts`: the handler. One `sql.begin` under `lockUser` for the whole chunk; per activity it skips a seen one, takes one hit of the daily cap, stores through `storeNewSession` (`../_shared/stores/new-session.ts`, the path `complete-session` uses) and records the outcome.
- `payload.ts`: the strict zod chunk schema, a union of the Cardio shape and the strength shape (`sets` and `picks`). Every set goes through the shared `setSchema`, so its bounds are those of a logged set.
- `deno.json` (picked up by `make check-functions`) and `deno.lock` (regenerate with Deno, never hand-edit).

## Rules and gotchas

- A Garmin activity is identified, per user, by its start time in UTC cut to the second (domain `garminActivityIdentity`). A start between two seconds is a 422, so a client cannot store two identities for one activity.
- Idempotent on that identity: a seen activity is skipped with `already_imported`, `deleted` or `rejected` and nothing else changes. `delete-session` marks the row `deleted` instead of removing it, so no later file brings a deleted Session back. An activity the user only deselected is never sent, so it is not remembered.
- Activities are stored in start-time order, whatever order they were sent in, and each gets a later `completed_at` than the one before, as the two Days of one workout do. The answer lists outcomes in the order sent.
- Scored or history only is the ordinary `planNewSession` rule (7 days). An imported Session has no Effort, notes, program link or challenge, and earns exactly what the same bout logged by hand earns.
- Limits come from the domain `GARMIN_IMPORT_CHUNK`: at most 50 activities and at most 10 young enough to score in one request (422 `invalid_payload` and 422 `too_many_scored_activities`). The second limit is the edge runtime's 2 s CPU cap: each scored import replays, and about 30 fit in one request. The web app splits with the domain `garminImportChunks`.
- No `session_create_*` rate limit. The cap is the bucket `garmin_import_day` (500 a day), one hit per stored activity, taken in a savepoint: at the cap the rest of the chunk is answered `skipped` with `daily_cap` and what was stored before stays.
- An activity whose start or end is implausible (in the future) is skipped as `unreadable` and not remembered.
- An unknown exercise, an exercise of the wrong Set kind, a distance on an exercise that tracks none or a weight on an exercise that takes none fails the whole chunk with the same codes as `complete-session` (also 409 `bodyweight_required`); nothing is stored. The Import review keeps such an activity from being sent.
- A strength activity also sends its picks (Garmin category and exercise). They are stored in `public.garmin_exercise_picks` only when the activity was imported, the latest activity winning per category, so a skipped duplicate never changes what the review prefills. A pick must name an exercise of one of its sets, which is what proves the exercise is one the user may log.
- The scoring limit counts activities, not sets: measured on the local stack, 10 scored strength activities fit even with 200 sets each, because the replay dominates.
- Needs `LOOT_SECRET`, like every scored write.

## Testing

`tests/integration/import-activities.test.ts` and `import-strength.test.ts` (stack, helpers in `garmin-import-support.ts`); grants, RLS and cascades in `supabase/tests/41_garmin_activities.test.sql` and `42_garmin_exercise_picks.test.sql`. The mapping from a Garmin activity to these values is the domain `garminImportCandidate` (`tests/domain/garmin-import.test.ts`).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
