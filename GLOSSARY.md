# Gainscape

A strength-training logger where logged sets earn XP, levels, records and loot. The server is the authority on everything a set earns.

## Workouts

**Draft**:
A workout being logged on the device and not yet accepted by the server. It lives offline until it syncs.
_Avoid_: pending session, local session

**Session**:
A workout the server has accepted, with everything it earned computed.
_Avoid_: workout (when you mean the stored record), log

**Edit**:
A change to the sets of a Session after it was accepted; it makes the server recompute what the Session and every later Session earned.
_Avoid_: update, correction

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

**Record**:
A personal best the server awards on a set: a rep max, most reps, or a best Cardio or Hold.
_Avoid_: PR (in prose), best set
