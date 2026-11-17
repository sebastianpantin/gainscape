# Garmin Training API: a Prescription on the watch as a native strength workout

Research for issue #224, part of the Garmin integration map (#220). Sources read on 2026-11-17.

## Question

Can Gainscape send a Day as a structured strength workout to Garmin, so the lifter does it in the watch's native strength activity and the result comes back through the Activity API? The answer is a verdict on this native route as an alternative to a custom Connect IQ app for Watch logging.

## Short answer

On paper, yes. Garmin's workout format has everything a Lift set needs: a step can name an exercise, a rep count, a weight and a warmup intensity, and rest is its own step. The recorded activity file has one record per set with reps, weight, exercise and a pointer back to the workout step it came from, so prescribed and done can be compared.

Three things keep this from being a clear win over a custom Connect IQ app:

1. Nothing in this note was tested on a watch. The Training API reference sits behind the developer portal login and I could not read it. The round trip is assembled from the public FIT profile, the public Personal API schema and the watch manuals.
2. Garmin has no AMRAP concept and no warmup flag on a recorded set. Both survive only because Gainscape knows which step it sent and the set points back to that step.
3. The Training API is a business API that needs program approval. It is not part of the Personal tier, so even the proof on the owner's watch needs approved business access (or a side-loaded file, see "Cheapest way to close the unknowns").

Verdict: the native route is a credible, much cheaper alternative, but only as a "good enough" route. It should not be chosen or rejected on documentation alone. One evening with a side-loaded FIT workout file on the owner's watch settles the open points.

## What I could and could not read

Read, first-party and public:

- The Garmin Connect Developer Program pages: overview, Training API, Activity API, program FAQ, Personal API and its FAQ. These are marketing-level pages. Note that the old URLs (`/gc-developer-program/training-api/` and so on) now return 404; the pages moved under `/gc-developer-program/enterprise/`.
- The Personal API OpenAPI document, which is embedded in the public Swagger page. It is read-only, but it documents how Garmin Connect returns the structured workout that was performed during an activity, including strength step fields.
- The FIT profile, version 21.221.0, from Garmin's `fit-python-sdk` repository, and the FIT SDK pages on workout files.
- Watch owner's manuals for the fenix 8, Forerunner 970, Forerunner 265, Venu 4, Descent G1, vivoactive 5 and fenix 6.

Not read:

- The Training API reference and the Activity API reference. Both are only available inside the Garmin Developer Portal after approval. Field names, enum values, validation rules, rate limits and the schedule endpoints of the real Training API are therefore not confirmed here.
- The program agreement, the Starter user cap and any pricing.

Unverified, used only where marked: a Scribd repost of a Training API document of unknown version, a forum post on intervals.icu, Garmin developer forum threads without staff answers, and Terra's documentation of its own Garmin bridge.

## 1. What a strength workout step can carry

### The FIT workout format (verified)

The FIT `workout_step` message has these fields that matter for a Lift set ([FIT profile][fit-profile]):

| Need          | FIT field                                                                                             | Notes                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Exercise      | `exercise_category` (enum) plus `exercise_name` (number within the category)                          | Fixed Garmin list, see section 2                                                                                         |
| Target reps   | `duration_type = reps` with `duration_value` as the rep count                                         | `reps` is value 29 of `wkt_step_duration`                                                                                |
| Target weight | `exercise_weight` in kg, resolution 0.01 kg, and `weight_display_unit` (`kilogram`, `pound`, `other`) | The value is always kilograms; the unit is only for display                                                              |
| Rest          | A separate step with `intensity = rest` and `duration_type = time`                                    | Or `open`, which waits for a button press                                                                                |
| Warmup set    | `intensity = warmup` on the step                                                                      | `intensity` values: active, rest, warmup, cooldown, recovery, interval, other                                            |
| Repeated sets | A repeat step, `duration_type = repeat_until_steps_cmplt`                                             | Repeats a block of earlier steps a number of times                                                                       |
| Free text     | `wkt_step_name` and `notes` strings                                                                   | Whether the watch shows them on a strength step is not verified                                                          |
| AMRAP         | Nothing                                                                                               | No "as many reps as possible" duration or target exists. The nearest are a `reps` step with a minimum, or an `open` step |

The FIT SDK says workout files cover strength training and gives the sport pairing Garmin devices expect: sport `training`, sub sport `strength_training` ([Workout file type][fit-workout-file], [Encoding Workout Files][fit-cookbook-workout]).

### How Garmin Connect models the same step (verified, read side only)

The public Personal API returns "workouts performed during an activity" from `GET /activity-service/activity/{activityId}/workouts`. Its `WorkoutStepDTO` has `intensity` (ACTIVE, WARMUP, COOLDOWN, REST, RECOVERY), `durationType` (including REPS, TIME, OPEN and the repeat types), `durationValue` ("repetition count for REPS"), `exerciseCategory` (example `BENCH_PRESS`), `exerciseName` (example `BARBELL_BENCH_PRESS`), `exerciseWeightValue` ("in kilograms ... regardless of weightDisplayUnit"), `weightDisplayUnit`, `name` and `notes` ([Personal API Swagger][personal-swagger]). This is the read side, not the Training API, but it shows that Garmin Connect's own workout model carries the same strength fields as the FIT profile.

### The Training API itself (not verified)

The public page says only that the API publishes "workouts and training plans to the Garmin Connect calendar" and that the developer has "complete control over the workout details" ([Training API][training-api]). The step schema is in the portal.

Unverified: a Scribd repost of a Training API document lists `WorkoutStep` and `WorkoutRepeatStep`, `durationType`, `intensity`, `exerciseCategory`, `weightValue` and `weightDisplayUnit`, workouts and workout schedules with create, read, update and delete, a `WORKOUT_IMPORT` permission, and HTTP 429 on rate limits with separate evaluation and production limits ([Scribd repost][scribd-training]). Also unverified: a developer on the intervals.icu forum reports that a workout sent to Garmin Connect with a reps end condition, category `BENCH_PRESS`, name `BARBELL_BENCH_PRESS` and a weight shows on a Venu 3 as "Barbell Bench Press, 10 reps, 85 kg", the same as a workout built in Garmin Connect ([intervals.icu forum][intervals-builder]). Both fit the verified model above, but neither is Garmin documentation.

## 2. Exercise names

Garmin identifies an exercise by a category and a name within that category, both from fixed lists in the FIT profile. Version 21.221.0 has 53 category values (including `unknown`) and 1,846 exercise names across 51 per-category lists ([FIT profile][fit-profile]). There is no free-text exercise on a workout step. The only strings are `wkt_step_name` and `notes`.

I compared the 219 exercises in `catalog/exercises.yaml` with the FIT names by normalised name only. This is a rough automated count, not a mapping:

- 105 have a Garmin exercise with the same name, for example `barbell_bench_press`, `romanian_deadlift`, `lat_pulldown`, `pull_up`.
- 63 have a near match that a hand-made mapping would resolve, for example `barbell_curl` to `curl/barbell_biceps_curl`, or `wide_grip_bench_press` to `bench_press/wide_grip_barbell_bench_press`.
- 51 have no name match. Some of these have a Garmin equivalent under another name (`cable_triceps_pushdown` is `triceps_extension/triceps_pressdown`, cable flyes are under `flye`, skull crushers are lying triceps extensions). Others have no real equivalent: pause and deficit variants (`pause_bench_press`, `pause_squat`, `deficit_deadlift`), `pendlay_row`, `jm_press`, `z_press`, `nordic_curl`, and most variants named after a machine or a Smith machine (the Garmin list has four Smith machine entries).

So the mapping has to be a hand-curated table in the catalog, many-to-one in places (a pause bench press would be sent as a barbell bench press), and it has to be one-way safe: Gainscape must recover its own exercise from the step it sent, not from the Garmin name that comes back.

What happens to an exercise Garmin does not know is not documented publicly. The FIT profile has an `unknown` category and an `exercise_title` message (category, name and a step name string), which suggests a custom-name mechanism exists in activity files, but I found no first-party description of how the Training API or the watch treat a step without a known exercise. Unverified: Terra says its own bridge drops the name and category for an unmatched exercise and still creates the step with the weight ([Terra exercise reference][terra-ref]). That describes Terra's behaviour, not Garmin's.

## 3. What the lifter can change on the watch, and what comes back

### On the watch (verified from manuals)

In the native strength activity the lifter follows the workout step by step. The watch counts reps itself; "your rep count appears when you complete at least four reps". The lifter presses a button to end the set, the watch shows the counted reps, and then:

- fenix 8 and Forerunner 970: "If necessary, edit the set, the number of reps, and the weight used for the set." Also: "During your workout, you can press [the upper-right button] to edit your previous sets. For structured workouts, you have options to skip a set or change the next set." ([fenix 8][manual-fenix8], [Forerunner 970][manual-fr970])
- Forerunner 265: the same edit sentence, without the tip about previous sets ([Forerunner 265][manual-fr265]).
- Venu 4: "edit the number of reps, select [the edit icon] to add the weight used for the set, and select Done." Rep counting can be turned off in the activity settings ([Venu 4][manual-venu4]).
- Descent G1 (older button layout): "press UP or DOWN to edit the number of reps", and "you can also add the weight used for the set" ([Descent G1][manual-descent]).

So reps and weight can both be corrected after each set, during the rest, on every model checked. Newer watches also allow editing earlier sets, skipping a set and changing the next set. Before starting, the workout itself can be edited on newer watches ("view the required equipment, edit the workout, and more").

Not stated in the manuals: whether the weight field is pre-filled with the prescribed weight, and whether the rep field defaults to the counted reps or to the prescribed reps when the two differ or when rep counting is off. This matters, because a lifter who presses through without looking would then log either the Prescription or the accelerometer's guess.

### In the recorded activity (verified format, unverified behaviour)

The FIT `set` message has, per set: `repetitions`, `weight` (kg, resolution 1/16 kg), `weight_display_unit`, `set_type` (only `active` or `rest`), `category` and `category_subtype` (the exercise), `start_time`, `duration`, `message_index` and `wkt_step_index` ([FIT profile][fit-profile]). `wkt_step_index` is the link from a done set to the prescribed step.

Garmin Connect also keeps the workout that was performed with the activity: the Personal API returns it with its steps, target reps and target weights, and the activity list returns per-exercise totals (`summarizedExerciseSets`: category, sub category, sets, reps, volume, max weight). The original activity file can be downloaded ([Personal API Swagger][personal-swagger]).

Putting these together: prescribed reps and weight come from the workout step, done reps and weight come from the set, and `wkt_step_index` joins them. I have not seen a real file from a structured strength workout, so three points are inferences: that the watch writes the edited values (not the counted ones) into `repetitions` and `weight`, that it fills `wkt_step_index` on every set, and how skipped, added or changed sets appear.

Edits made later in the Garmin Connect app or website are a separate matter. Unverified: a user on the intervals.icu forum found that exercises corrected in the Connect UI are not written back to the FIT file ([intervals.icu forum][intervals-pull]). If true, only what the lifter does on the watch reaches Gainscape.

Two precision notes. A set weight is stored in sixteenths of a kilogram, so 2.5 kg and 1.25 kg steps are exact, but pound loads are not (45 lb is stored as 20.4375 kg, which is 45.06 lb). Gainscape would need to snap a returned weight to the prescribed one when they differ by less than the rounding. And the per-set data is in the FIT file; whether the Activity API's JSON summary or details carry sets is in the portal documentation I could not read. The public Activity API page lists "Strength Training" among the activity types and says FIT files are available "for complete activity details" ([Activity API][activity-api]).

## 4. How the workout reaches the watch, and freshness

Verified, from the Training API page: workouts and training plans are published to the user's Garmin Connect calendar after the user consents. "Garmin Connect handles the interactions with the device. All the user needs to do is sync their device with Garmin Connect" ([Training API][training-api]). On the watch, scheduled workouts show in the training calendar and can be started from there, and workouts sent to the watch show in the strength activity's workout list ([vivoactive 5][manual-va5], [Venu 4][manual-venu4-follow]). The fenix 6 manual adds that scheduled workouts sent from Garmin Connect "overwrite the existing training calendar" ([fenix 6][manual-fenix6]).

Consequences for Gainscape:

- The workout lives on the watch once synced, so the session itself needs no phone. That meets the "phone put away" target.
- Delivery is not instant and not under Gainscape's control. The watch gets a new or changed workout only at its next sync with Garmin Connect, which needs the phone app (or Wi-Fi on models that have it) at some point between Sessions.
- The freshness loop is: the lifter finishes on the watch, the watch syncs the activity, Garmin pushes it to Gainscape, `complete-session` works out the next Prescription, Gainscape creates or updates the next workout through the Training API, and the watch picks it up at a later sync. With a day or more between Sessions this is comfortable. The stale cases are a lifter who logs or edits a Session in the Gainscape app after the last watch sync and then goes to the gym without syncing, and a lifter whose watch never synced the finished activity. In both the watch shows an out-of-date Prescription and nothing on the watch says so.
- Because the Prescription for the next Day depends on the last Session, Gainscape can only ever publish one Day ahead per program. Publishing further ahead would put wrong loads on the calendar.

Not verified: how far ahead the watch downloads scheduled workouts, whether an updated workout replaces the copy already on the watch at the next sync, the rate limits, and whether the API has a way to tell that a workout has reached the device.

A FIT workout file can also be copied to a watch over USB, into the `Garmin/NewFiles` folder ([Encoding Workout Files][fit-cookbook-workout]). That is no product route, but it is a way to test without any API access.

## 5. Access terms: Training API compared with Activity API

Verified, from the program overview as it reads today ([overview][gcdp-overview], [program FAQ][gcdp-faq]):

- The program now has a Personal tier and two business tiers, Starter and Enterprise.
- The Training API and the Activity API sit in the same tiers. Both are in Starter and both are in Enterprise. One application covers both; the FAQ says an app may use "any or all APIs". All use OAuth 2.0.
- Starter: push delivery only, no historical data, "limited" user capacity. Enterprise: push or ping/pull, one month or more of history, unlimited capacity, technical support, with commercial terms "tailored".
- The Personal tier (a self-made API key for one's own data) has activity, health and women's health data, pull only. It has no Training API, and its OpenAPI document has only GET operations ([Personal API Swagger][personal-swagger]). The Personal FAQ says it "is not intended for commercial applications serving multiple end users" ([Personal FAQ][personal-faq]).
- Access to the business tiers is by application and approval, and "all detailed technical information and documentation is available within the Garmin Developer Portal" after approval.

So the two APIs do not differ in terms on the public pages. The difference that matters is with the Personal tier: reading the owner's activities needs only a personal key, but putting a workout on the owner's watch through the API needs approved business access. The Training API also needs a write permission from the user on top of the read consent (unverified: the Scribd repost calls it `WORKOUT_IMPORT`).

Not on the public pages: the Starter user cap, pricing, and the production review. The program research ticket covers these.

## What survives the round trip

| Aspect                        | Sent to the watch                                     | Comes back                                         | Fidelity                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Exercise identity             | Garmin category and name from a mapping table         | Category and name on each set, plus the step index | Good for mapped exercises. Variants Garmin lacks collapse onto a neighbour, so Gainscape must resolve the exercise from the step it sent |
| Prescribed reps and weight    | Reps as the step duration, weight in kg on the step   | The workout steps are kept with the activity       | Good on paper                                                                                                                            |
| Done reps and weight          | Not applicable                                        | One `set` record per set with reps and weight      | Good on paper. Depends on the lifter correcting the rep count; pound loads need snapping                                                 |
| Prescribed against done       | Not applicable                                        | `wkt_step_index` joins set to step                 | Good on paper, not seen in a real file                                                                                                   |
| Warmup sets                   | `intensity = warmup` on the step                      | A set is only `active` or `rest`                   | Recoverable only through the step index                                                                                                  |
| AMRAP sets                    | No native form; a reps step with a minimum and a note | Reps done on the set                               | The number survives, the meaning does not. Whether the watch lets the lifter go past the target without friction is untested             |
| Rest                          | Timed rest step                                       | `rest` set records with duration                   | Good, and not needed by Gainscape                                                                                                        |
| Skipped, added, changed sets  | Not applicable                                        | Unknown                                            | Untested                                                                                                                                 |
| Effort and other Input values | No field                                              | Nothing                                            | Lost                                                                                                                                     |

## Verdict

The native route can carry a Day as it stands today: exercise, target reps, target weight, rest and warmup all have a place in the workout step, and the result carries reps and weight per set with a link back to the step. It costs far less than a Connect IQ app: no watch code, no store listing, no per-model testing, and the lifter gets Garmin's own strength screens, rep counting, rest timer and muscle map. It also turns Watch logging into two things the map already needs or considers: the Activity API feed, and the slice that maps native Garmin strength activities to Lift sets.

It is weaker than a custom app in ways that cannot be fixed from Gainscape's side:

- Gainscape controls nothing on the watch. It cannot make the lifter confirm a set, cannot explain an AMRAP set beyond a name or note, and cannot show program context.
- Reps start from the watch's accelerometer count. An uncorrected miscount would reach the program judge as a failed or exceeded set. The server stays the authority, but it would be judging noisy input.
- Exercises outside Garmin's list are shown as a neighbour or as nothing.
- Freshness depends on Garmin sync timing, and a stale Prescription on the watch is silent.
- It depends on approved business access to the Training API. If Garmin refuses program access, this route is gone, while the map's fallback (file import) and a Connect IQ app do not need the Training API.

Recommendation for the map: treat the native route as the cheap candidate for a first Watch logging slice, conditional on a hands-on test, and keep the Connect IQ app as the route to choose if the test shows that reps, weight or the step link do not come back cleanly, or if AMRAP sets are awkward on the watch.

## Open unknowns

1. The real Training API schema: strength step field names, accepted exercise enums, what it does with an unknown exercise, whether a step may carry both a warmup intensity and an exercise, rate limits, and how updating or deleting a scheduled workout behaves. Needs portal access.
2. Whether the watch pre-fills the prescribed weight and which rep value it defaults to, and what it does with rep counting off.
3. Whether a real activity file from a structured strength workout fills `wkt_step_index`, carries the edited reps and weight, and how skipped, added or changed sets and a warmup step appear.
4. How an AMRAP set behaves on the watch: whether the lifter can simply keep going past the target and whether `notes` or the step name are visible on a strength step.
5. Whether the Activity API's JSON carries sets or only the FIT file does, and whether a later edit in Garmin Connect produces a new notification.
6. How far ahead and how reliably the watch downloads a changed scheduled workout, and whether an old copy can linger.
7. Starter tier limits: the user cap, pricing, and the production review.

## Cheapest way to close the unknowns

Points 2, 3 and 4 need no Garmin approval. Encode one Day as a FIT workout file with the FIT SDK (sport `training`, sub sport `strength_training`, steps with exercise, reps, weight, a warmup step, a rest step and one step meant as AMRAP), copy it to the owner's watch over USB, do it once while deliberately editing reps and weight, skipping a set and overrunning the AMRAP step, then read the activity file. The activity file and the performed workout can be fetched with a Personal API key, or exported from Garmin Connect. Points 1, 5, 6 and 7 need program access.

## Sources

First-party:

- [Garmin Connect Developer Program overview][gcdp-overview]
- [Training API][training-api]
- [Activity API][activity-api]
- [Program FAQ][gcdp-faq]
- [Personal API FAQ][personal-faq]
- [Personal API Swagger documentation][personal-swagger] (OpenAPI 3.0.1, "Garmin Connect Personal API" 1.0.0)
- [FIT profile 21.221.0 in garmin/fit-python-sdk][fit-profile]
- [FIT SDK: Workout file type][fit-workout-file]
- [FIT SDK cookbook: Encoding Workout Files][fit-cookbook-workout]
- Owner's manuals, "Recording a Strength Training Activity": [fenix 8][manual-fenix8], [Forerunner 970][manual-fr970], [Forerunner 265][manual-fr265], [Venu 4][manual-venu4], [Descent G1][manual-descent]
- Owner's manuals, workouts and calendar: [Venu 4, Following a Workout From Garmin Connect][manual-venu4-follow], [vivoactive 5, Viewing Scheduled Workouts][manual-va5], [fenix 6, About the Training Calendar][manual-fenix6]

Third-party, unverified:

- [Scribd repost of a Garmin Training API document][scribd-training]
- [intervals.icu forum, Advanced Strength Workout Builder][intervals-builder]
- [intervals.icu forum, Pulling strength workout data from Garmin][intervals-pull]
- [Terra, Garmin exercise reference][terra-ref]

[gcdp-overview]: https://developer.garmin.com/gc-developer-program/overview/
[training-api]: https://developer.garmin.com/gc-developer-program/enterprise/training-api/
[activity-api]: https://developer.garmin.com/gc-developer-program/enterprise/activity-api/
[gcdp-faq]: https://developer.garmin.com/gc-developer-program/enterprise/program-faq/
[personal-faq]: https://developer.garmin.com/gc-developer-program/personal/personal-faq/
[personal-swagger]: https://developer.garmin.com/gc-developer-program/personal/swagger-docs/
[fit-profile]: https://github.com/garmin/fit-python-sdk/blob/main/garmin_fit_sdk/profile.py
[fit-workout-file]: https://developer.garmin.com/fit/file-types/workout/
[fit-cookbook-workout]: https://developer.garmin.com/fit/cookbook/encoding-workout-files/
[manual-fenix8]: https://www8.garmin.com/manuals/webhelp/GUID-EECCAC99-90D6-4AB1-9A3A-EC433D3365E2/EN-US/GUID-573EC4B6-D45B-46E7-BE37-FB542CBB4FC1.html
[manual-fr970]: https://www8.garmin.com/manuals/webhelp/GUID-025D75CF-3445-49E1-8D81-1AA74AB4E00F/EN-US/GUID-573EC4B6-D45B-46E7-BE37-FB542CBB4FC1.html
[manual-fr265]: https://www8.garmin.com/manuals/webhelp/GUID-F41EAFB3-6CC9-42DE-9C6C-9E358DBB0671/EN-US/GUID-CF2D7922-A1AC-4510-9480-E7CE8119EAF2.html
[manual-venu4]: https://www8.garmin.com/manuals/webhelp/GUID-2CF5620C-E585-4E0A-9CC3-9565533EEE4D/EN-US/GUID-49D892BF-429E-454D-B0C6-D4AE07E9D4A0.html
[manual-venu4-follow]: https://www8.garmin.com/manuals/webhelp/GUID-2CF5620C-E585-4E0A-9CC3-9565533EEE4D/EN-US/GUID-D6E80F0C-F319-47D1-AF95-0884F3386635.html
[manual-descent]: https://www8.garmin.com/manuals/webhelp/GUID-2A58ED2A-14A3-4161-ADB5-259E1781AF1B/EN-US/GUID-573EC4B6-D45B-46E7-BE37-FB542CBB4FC1.html
[manual-va5]: https://www8.garmin.com/manuals/webhelp/GUID-5D183A14-BB43-4A9B-B441-5F824214CE40/EN-US/GUID-D9E73E73-4F56-48D0-BF4D-6F179CF6298F.html
[manual-fenix6]: https://www8.garmin.com/manuals/webhelp/fenix6-6ssport/EN-US/GUID-F5EB9C7C-A74E-4A26-BFB5-1E6DA4399067.html
[scribd-training]: https://www.scribd.com/document/794187143/Garmin-Connect-Developer-Program-Training-API
[intervals-builder]: https://forum.intervals.icu/t/advanced-strength-workout-builder/115495?page=2
[intervals-pull]: https://forum.intervals.icu/t/pulling-strength-workout-exercise-sets-reps-weight-from-garmin/123171
[terra-ref]: https://docs.tryterra.co/planned-workouts-api/garmin-exercise-reference
