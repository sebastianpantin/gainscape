# Two Days in one Draft are split into two Sessions by the server

A lifter can add a second Day of the same Enrollment to a Draft started from a Day, so two program days run as one workout. On Finish the device sends one request, and `complete-session` stores one Session per Day in a single transaction, the first Day first. Each Session stays linked to exactly one Position, which is what Program facts, progression, History and Edit already assume, and the device keeps its single-Draft finish, retry and reveal path unchanged.

## Considered Options

- **One Session linked to two Positions.** Needs a migration of the session link and changes to Program facts, History and Edit, which all treat a Session as one Day.
- **Split on the device into two Drafts.** The draft store holds one Draft per user and the finish path syncs one Session; a half-synced pair (first saved, second rejected) would need a new state everywhere.

## Consequences

- The second Session's id is chosen when the Day is added, so a resubmitted Finish is idempotent for both Sessions.
- Both Sessions share the Draft's start, end, notes and session RPE, count as two workouts but one training day, and earn without fatigue from the other Day's sets.
- The server must be deployed before a web build that sends a second Day.
