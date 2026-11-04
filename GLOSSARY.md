# Gainscape

A strength-training logger where logged sets earn XP, levels, records and loot. The server is the authority on everything a set earns.

## Workouts

**Draft**:
A workout being logged on the device and not yet accepted by the server. It lives offline until it syncs. A Draft started from a Day can take one more Day of the same Enrollment; it becomes one Session per Day when it syncs.
_Avoid_: pending session, local session

**Session**:
A workout the server has accepted, with everything it earned computed.
_Avoid_: workout (when you mean the stored record), log

**Edit**:
A change to the sets of a Session after it was accepted; it makes the server recompute what the Session and every later Session earned.
_Avoid_: update, correction

**Finish outcome**:
What one Finish of a Draft saved: the server's summary, merged over its Days, and the Sessions it covers, one per Day the server stored. The Reveal shows it, and it is forgotten when any of its Sessions is edited or deleted.
_Avoid_: last summary, finish result

**Preview**:
The XP and Records the app estimates for a Draft's sets before the server accepts it. Only a hint; the server decides.
_Avoid_: estimate, prediction

## Sets

**Set kind**:
The shape of a set: Lift, Cardio or Hold. Every set has exactly one kind, and the kind of a logged set never changes.
_Avoid_: set type, modality (modality belongs to exercises)

**Lift**:
A set of weight moved for a number of reps.
_Avoid_: strength set, rep set

**Cardio**:
A set measured by time, with optional distance or work/rest intervals.
_Avoid_: bout (in prose), conditioning set

**Hold**:
A loaded set measured by time held or distance carried, with no reps.
_Avoid_: isometric, carry

**Input values**:
What the user entered for a set: exercise, weight, reps, time, distance, intervals, warmup flag and effort.
_Avoid_: raw values, user data

**Derived values**:
What the server computes for a set from its Input values and the history before it, such as XP, effective reps and record candidates. They are recomputed after every Edit.
_Avoid_: computed fields, results

**Effort**:
How hard the lifter says a set was, logged as an effort level, reps in reserve (RIR) or RPE. The top of each scale means "5 or more in reserve". Effort is optional; it counts toward the 1RM estimate and, on a first-time lift, decides XP.
_Avoid_: rating, difficulty, intensity

**1RM estimate**:
The heaviest single rep the server believes the lifter can do on a lift, worked out from their recent sets. A lift has none until its first session is done.
_Avoid_: max, PR, e1RM (in prose)

**Estimated RIR**:
The reps in reserve the server predicts for a set from its load and the 1RM estimate, lowered by fatigue from earlier sets in the Session. Once a lift has a 1RM estimate, XP comes from the Estimated RIR, whether or not Effort was logged.
_Avoid_: predicted effort, assumed RIR

**Effective reps**:
The reps of a set close enough to failure to earn XP and qualify for loot.
_Avoid_: hard reps, counted reps

**Flag**:
The mark on a set whose Effort claims it was harder than the Estimated RIR allows, so the 1RM estimate uses the estimate's floor instead of the claim. A Flag never changes XP, and the top of the Effort scale is never Flagged.
_Avoid_: cheat, penalty, untrusted set

**Record**:
A personal best the server awards on a set: a rep max, most reps, or a best Cardio or Hold.
_Avoid_: PR (in prose), best set

## Programs

**Program template**:
A named training program (5/3/1, GZCLP, Madcow, ...) written as data: its lifts, inputs, schedule, days and rules.
_Avoid_: program definition (in prose; `ProgramDefinition` is its type), plan

**Enrollment**:
One user following one Program template, with the template's lifts bound to exercises and the starting inputs they entered.
_Avoid_: subscription, active program (in prose)

**Position**:
A place in a Program template's schedule: a cycle, week and day, a plain week and day, or an index in a rotation of days.
_Avoid_: step, cursor (the cursor is the next Position in Program state)

**Day**:
The training day a Program template schedules at a Position, made of Slots.
_Avoid_: workout, session (a Day is scheduled, a Session is logged)

**Slot**:
One exercise entry in a Day: a lift with a set scheme and the rules that judge it.
_Avoid_: exercise (the exercise is what the Slot's lift is bound to)

**Prescription**:
The sets a Day asks for at a Position, worked out from the Program state, with loads, reps and set references.
_Avoid_: plan, target, program sets

**Snapshot**:
The Prescription of one set, copied onto the set when it is logged, so the set is judged against what the user was shown.
_Avoid_: prescription copy, target

**Program fact**:
An event the Program state is folded from: a Session linked to a Position, a skipped day, a jump, or a reference the user set by hand.
_Avoid_: program event, program log

**Program state**:
Where an Enrollment stands: the next Position, reference weights, Stages, pending Retests and miss counters. It is never stored; it is folded from the Program facts in order every time.
_Avoid_: progress, saved state

**Reference**:
A weight a Program template's loads are worked out from, such as a training max or a working weight. Rules change it; the user can also set it by hand.
_Avoid_: base weight, max (unless the template calls it that)

**Judge**:
To compare logged sets against what was asked of them and give a Verdict. The program judge compares a Day's logged sets with its Prescription; the challenge judge compares a Session's sets with its challenge snapshot.
_Avoid_: grade, score, evaluate

**Verdict**:
The result of a Judge. For a Slot it is met, missed or neutral; for a challenge it is passed or failed.
_Avoid_: outcome, result

**Rule**:
What a Verdict does to a Slot's Reference, Stage or counters: increment, hold, reset, deload, advance a Stage, or adjust from AMRAP reps.
_Avoid_: progression step, policy

**Stage**:
One of an ordered list of set schemes a Slot steps through when it misses, as in GZCLP.
_Avoid_: level, phase

**Retest**:
A single heavy set a Slot asks for after its last Stage fails, which resets its Reference from the reps done.
_Avoid_: test set, max-out

## App

**Write**:
A change this device saves to the server that the app reads back, such as a profile save, a pin or a craft. After each Write, the tab that made it shows what changed and refreshes the rest, and every other tab refreshes all of it.
_Avoid_: data change, mutation, announcement
