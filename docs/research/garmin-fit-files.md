# What a Garmin FIT file holds for cardio and strength activities

Research for issue #222, part of the Garmin integration map (#220). Written 2026-11-17 against FIT SDK and profile version 21.221.0.

The repo had no place for research notes, so this file starts `docs/research/`. The branch `research/garmin-fit-files` is throwaway and is not meant to be merged.

## Short answer

- A **cardio** activity can fill a Cardio set's time and distance directly from the file's Session message. Work/rest intervals can be filled only when the Lap messages separate work from rest, which in practice means the user followed a structured workout or pressed the lap button.
- A **strength** activity stores one Set message per set and per rest, with reps, weight, duration and a guess at the exercise. Reps and weight can fill a Lift set. The exercise is the weak part: the watch writes a ranked list of candidate exercise categories, not one exercise.
- The file can be parsed **in the browser and in an Edge Function**. The official `@garmin/fitsdk` package has no dependencies and uses no Node APIs. Its licence is Garmin's own and is not open source, which matters for a public MIT repo that ships code to browsers. An MIT alternative, `fit-file-parser`, decoded the same files.

## How to read the trust marks

- **Docs**: stated in Garmin's own documentation, SDK source or licence text, linked under Sources.
- **Ran it**: checked on this machine by decoding files with the parser. See "What was run".
- **Real file**: observed by the coordinating session in a strength activity recorded on a Forerunner 265 on 2026-11-17 and decoded with `@garmin/fitsdk`. That file was not available to this research and is not in the repo.
- **Unverified**: rests on forum posts, third-party write-ups or general knowledge. Treat as a lead, not a fact.

## 1. The shape of an activity file

A FIT file is a binary stream of typed messages. The FIT Profile names every message and field. An activity file (`file_id.type = activity`, value 4) has these required messages (Docs):

| Message  | What it is                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------- |
| File Id  | First message. File type, manufacturer, product, serial number, time created.                           |
| Activity | One per file, usually last. Number of sessions and the local timestamp, which gives the time zone.      |
| Session  | One per sport. A multisport activity (a triathlon) has several. Totals for that sport.                  |
| Lap      | One or more per session. "Laps or intervals within the session", with the same total fields as Session. |
| Record   | The per-second samples: position, heart rate, speed. Import does not need them.                         |

Session, Lap and Length are "summary messages". Every summary message must carry start time, total elapsed time, total timer time and timestamp (Docs).

Two points about time (Docs):

- **Total elapsed time** is wall-clock time and includes pauses. **Total timer time** is what the watch's stopwatch showed and excludes pauses. Garmin calls timer time "the duration most commonly associated with an activity". Total moving time is a third, optional field.
- Timestamps are seconds since 1989-12-31 UTC. The parser turns them into dates. The Activity message's local timestamp gives the offset to the user's local time; Garmin warns that not every manufacturer writes it and that the Activity message can be missing from a truncated file.

When a file has several sessions, a lap or record belongs to the session whose time span contains its timestamp. Session also carries `first_lap_index` and `num_laps` (Docs, Ran it).

## 2. Cardio: time, distance, laps and intervals

### Session

The Session message carries everything a plain Cardio set needs (Docs, Ran it):

| Field                         | Unit    | Note                                                                |
| ----------------------------- | ------- | ------------------------------------------------------------------- |
| `sport`, `sub_sport`          | enum    | For example running/treadmill, cycling/indoor cycling, swimming/lap |
| `start_time`                  | date    |                                                                     |
| `total_timer_time`            | seconds | Excludes pauses. Millisecond resolution.                            |
| `total_elapsed_time`          | seconds | Includes pauses.                                                    |
| `total_distance`              | metres  | Centimetre resolution. Missing or zero when nothing measured it.    |
| `sport_profile_name`          | text    | The name of the activity profile on the watch, such as "Run".       |
| `pool_length`, `num_lengths`  | metres  | Pool swims only.                                                    |
| `first_lap_index`, `num_laps` | count   |                                                                     |

Decoded examples (Ran it): a walk recorded on a Forerunner 955 gave timer time 309 s and distance 60 m; a run from a fenix 5 gave 56.887 s and 157.56 m; Garmin's pool swim sample gave 840 s and 457.2 m in a 22.86 m pool.

The Profile's sport list has 82 sports and 112 sub-sports. The ones that line up with the catalog's cardio exercises are easy to spot: running (with sub-sports treadmill, trail, track, indoor running), cycling (indoor cycling, spin, road, mountain), swimming (lap swimming, open water), walking, hiking, rowing and fitness equipment (indoor rowing, elliptical, stair climbing), HIIT and jump rope. Building the actual mapping to catalog exercises is a decision for another ticket.

### Laps

A Lap message has the same totals as a Session, plus three fields that say why the lap exists (Docs):

- `lap_trigger`: manual, time, distance, position, session end, fitness equipment.
- `intensity`: active, rest, warmup, cooldown, recovery, interval, other.
- `wkt_step_index`: which step of a structured workout this lap belongs to.

When the user follows a structured workout, "the device will typically include a Lap message for each workout step completed", and the activity file may also contain the Workout and Workout Step messages themselves, so the prescribed work and rest durations can travel with the activity (Docs). They are not always there: Garmin's multisport sample has laps with a `wkt_step_index` but no Workout Step messages (Ran it).

Without a workout, laps come from auto lap (every kilometre, trigger `distance`) or from the lap button (trigger `manual`). In the files decoded here, an unstructured activity had one lap with trigger `session_end`. Whether auto laps and button laps carry a useful `intensity` is **unverified**; expect `active` for all of them.

### Lengths (pool swims)

A pool swim adds a Length message per pool length. A length is `active` or `idle`; idle lengths record the rest between sets. Laps group the lengths: in Garmin's sample the nine laps alternate between a swim lap (four lengths, 91.44 m) and a rest lap (one idle length, distance 0) (Docs, Ran it). A Length has no distance field; distance is the pool length times the active lengths.

### Splits

The Profile also defines Split and Split Summary messages with types such as `interval_active`, `interval_rest`, `run_active` and `rwd_run`/`rwd_walk` (Docs). Which watches write them, and for which activities, is **unverified**. None of the sample files contained one.

### What this means for intervals

A Gainscape interval is one work duration, one rest duration and a number of rounds. A FIT file holds a list of laps that need not be uniform. So an import can fill the interval only when the laps split cleanly into work and rest (by `intensity`, or by the attached workout steps) and the rounds are alike. Otherwise it should fill time and distance only. The rule for "alike" is a decision, not a fact.

## 3. Strength: how sets are stored

### The Set message

Strength data lives in the Set message (number 225). Garmin's prose documentation does not describe it; the Profile and the generated SDK sources are the only primary source (Docs):

| Field                 | Type and unit                | Profile comment                                                     |
| --------------------- | ---------------------------- | ------------------------------------------------------------------- |
| `timestamp`           | date                         | Timestamp of the set                                                |
| `start_time`          | date                         | Start time of the set                                               |
| `duration`            | seconds, ms resolution       |                                                                     |
| `set_type`            | `active` or `rest`           |                                                                     |
| `repetitions`         | whole number                 | Number of repetitions of the movement                               |
| `weight`              | kg, 1/16 kg resolution       | Amount of weight applied for the set                                |
| `weight_display_unit` | `kilogram`, `pound`, `other` | What the user saw; `weight` itself is always kg                     |
| `category`            | list of exercise categories  |                                                                     |
| `category_subtype`    | list of numbers              | "Based on the associated category, see [category]\_exercise\_names" |
| `message_index`       | number                       | Order of the set                                                    |
| `wkt_step_index`      | number                       | The workout step, when a structured workout was followed            |

What a real watch writes (Real file, Forerunner 265, software 29.05):

- The session has sport `training` and sub-sport `strength_training`.
- There were 34 Set messages for the workout and 1,555 Record messages. No Lap messages were listed.
- Each Set carried timestamp, start time, duration, repetitions, weight, category, category subtype, message index and set type.
- Rest periods are Set messages too, with `set_type` `rest`.
- **`category` holds several candidate categories for one active set**, for example bench press, shoulder press and push-up together, with `repetitions` 10 and `weight` 20 kg. The watch's idea of the exercise is a ranked guess, not one exercise.

The exercise vocabulary in the Profile (Ran it): 53 exercise category values (bench press, squat, deadlift, curl, row, plank, carry and so on, with `unknown` among them), and 51 per-category name lists with 1,846 exercise names in total. Category 0 with subtype 1 is "barbell bench press"; squat subtype 6 is "barbell back squat".

The parser returns `category` as names but leaves `category_subtype` as bare numbers. The importer has to look the number up in the name list for that category itself (Ran it). An Exercise Title message (category, name number and a free-text workout step name) also exists in the Profile; when a watch writes it is **unverified**.

### Active against rest

`set_type` separates work from rest, and each has a `duration`. A Lift set needs only the active sets. The rest durations are there if Gainscape ever wants them.

### Holds

A timed hold such as a plank is an active set with a duration and a plank category; the Profile has no separate shape for it (Docs). What a watch writes in `repetitions` for a hold is **unverified**. The Set message has no distance field, so a carried distance cannot be filled from a strength activity.

### How reliable the watch-counted reps are

Garmin's owner's manuals say this about rep counting (Docs):

- "The watch counts your reps. Your rep count appears when you complete at least four reps."
- "The watch can only count reps of a single move for each set."
- "Each rep is counted when the arm wearing the watch returns to the starting position." and "Leg exercises may not be counted."
- After a set the user can "edit the set, the number of reps, and the weight used for the set" on the watch. Rep counting can be turned off.

So reps come from wrist movement and are trustworthy only for exercises where the watch arm moves through a full range. Squats, leg presses, calf raises and anything with still wrists will be wrong or missing unless the user corrects the number on the watch. Weight is never measured; it is whatever the user typed, and it is absent when they skipped it. Reports that the count is often off for pull-ups, push-ups and dips are plentiful on Garmin's forums but **unverified** here.

Edits made later in Garmin Connect (fixing the exercise name, reps or weight) are reported not to reach the exported original file, because that export is the file as the watch wrote it. This rests on one forum thread and on the wording of Garmin's export page, and is **unverified**. If it holds, a file import sees the watch's guess while a user who tidied up their workout in Garmin Connect sees something else.

## 4. Getting a FIT file out of Garmin Connect by hand

From Garmin's support page "How Do I Export Data Out of Garmin Connect?" (Docs):

**One activity.** In a web browser, sign in to Garmin Connect, open Activities, All Activities, pick the activity, open the gear icon at the top right and choose **Export File**. "The file type will be in the original file format from the device, typically a .fit file." The same menu offers TCX, GPX, Google Earth and splits as CSV; those are conversions and drop data. The page documents the website only. Whether the phone app can export the original file is **unverified** (forum posts say it cannot). The download arrives as a zip holding `<activityId>_ACTIVITY.fit` (seen through the Personal API below; the same for the website is **unverified**).

**Everything.** Go to Garmin Account Data Management, choose Export Your Data, then Request Data Export. "A download link will be emailed to you. Links typically are sent in 48 hours but can take up to 30 days." In the zip, open `DI_CONNECT`, then `DI-Connect-Fitness-Uploaded-Files` or `DI-Connect-Uploaded-Files`: "Your activities will show as FIT files." Whether that folder holds further zips, and whether it mixes in non-activity FIT files, is **unverified**; the importer should check `file_id.type` and skip anything that is not an activity. Activities that were uploaded to Garmin as GPX or TCX stay in that format.

**The activity list as CSV.** All Activities has an Export CSV button. It gives one summary row per activity and no sets, so it is not a substitute.

**A third route, the Personal API.** Garmin publishes a client for a "Personal API": the user creates a key in their Garmin Connect settings, and `GET /download-service/files/activity/{id}` returns the original file as a zip holding `<activityId>_ACTIVITY.fit` (Docs for the endpoint; the zip contents were seen by the coordinating session). Its terms and who may use it belong to the program-access research, not this note.

Copying files straight off the watch over USB also yields FIT files; no Garmin page was checked for this, so it is **unverified**.

## 5. Parsers, and where they run

### `@garmin/fitsdk` (official)

- Version 21.221.0 on npm, source at `garmin/fit-javascript-sdk`. Decodes and encodes. Ships TypeScript types. No dependencies (Docs).
- The README requires "Node.js v14.0 or higher, or a browser with a compatible JavaScript runtime engine". The source is plain ES modules and imports nothing from Node; it relies on `ArrayBuffer`, `DataView`, `TextDecoder` and `BigInt` (Ran it: searched the source).
- **Browser**: bundles for the browser with no missing modules. 425 kB minified, 64 kB gzipped, nearly all of it the Profile tables (Ran it). It belongs behind a lazy import.
- **Edge Function**: Deno is not installed on this machine, so loading under Deno was **not run**. Nothing in the source needs Node, and Supabase Edge Functions accept `npm:` imports (Docs), so `npm:@garmin/fitsdk` is expected to work. Supabase's limits are 256 MB memory and 2 s of CPU time per request (Docs).
- **Speed** (Ran it, Node 24): a 94 kB file with 3,601 records decoded in about 60 ms; a 222 kB file with 7,515 records in about 117 ms. A long ride is a few times that, well inside 2 s of CPU.
- **Checks**: `isFIT()` tests the header, `checkIntegrity()` tests the CRC, and `read()` returns `{ messages, errors }`. All sample files passed with zero errors (Ran it).

Things that will bite (Ran it):

- 64-bit developer fields decode as `BigInt`, and `JSON.stringify` throws on them.
- Enum values the bundled Profile does not know come back as numbers instead of names (a device product showed up as `1621`). Expect the same for a sport added after the pinned SDK version.
- `category_subtype` is not turned into a name (see section 3).
- Message lists are keyed in camelCase with a `Mesgs` suffix: `sessionMesgs`, `lapMesgs`, `setMesgs`, `lengthMesgs`.

### The licence

The package's licence field says "SEE LICENSE IN LICENSE.txt". That file is the **FIT Protocol License Agreement**, Garmin's own terms, not an open-source licence (Docs). The parts that matter:

- The grant is "a non-exclusive, royalty-free, non-transferable, non-sublicensable, limited license to use the Licensed Technology for Licensee's internal business purposes, including to use the FIT protocol in any software created by Licensee and to create modifications".
- Section 2c forbids, "except as set forth herein", to "distribute, publish, transfer or otherwise make available the Licensed Technology ... to any third party".
- Section 2d forbids distributing it "so that any part of it becomes subject to any license that requires that the Licensed Technology ... be disclosed or distributed in source code form, or that others have the right to modify it".

What follows from that, read plainly and without legal advice:

- Do not copy the SDK source into this repo. The repo is public and MIT, and MIT gives others the right to modify. Depending on the npm package keeps Garmin's code out of the repo.
- Parsing in an Edge Function uses the SDK on the server and hands nothing to third parties.
- Parsing in the browser ships the SDK's code to every user inside the app bundle. Whether that counts as "distribute ... to any third party" under 2c is a question the licence text does not settle. It is the one licence risk in this design.

### `fit-file-parser` (third party, MIT)

- npm `fit-file-parser`, source `jimmykane/fit-parser`, MIT. Version 6.2.3 was tested. One dependency, `buffer` (Docs, Ran it).
- It decoded the Set messages of a strength file and the Length messages of the pool swim sample with the same values as the official SDK (Ran it). Field names are snake_case and the result is grouped differently (`sessions`, `laps`, `lengths`, `sets`).
- Browser bundle: 289 kB minified, 62 kB gzipped (Ran it). Loading under Deno was not run.
- It is a third party's reading of Garmin's Profile, so new fields arrive later than in the official SDK. It had eight releases between 20 October and 17 November 2026, so pin the version.

Older MIT parsers (`fit-decoder`, `easy-fit`) were last published in 2022 and were not tested.

## 6. Identity and origin

### Which fields identify an activity

- The protocol says the File Id message exists "to uniquely identify the file in a global system", through file type, manufacturer, product, serial number and time created (Docs).
- In practice the usable key is **manufacturer + product + serial number + time created**, backed by the session start time.
- `serial_number` is optional. One Garmin sample from a Forerunner 945 had none in File Id; the Device Info message for the creator device had it (Ran it). Read both.
- `time_created` is not always the start of the workout. In a fenix 5 run it equalled the session start; in a Forerunner 935 file that carries a Connect IQ app's developer data it was later than the end of the activity (Ran it). Use it as part of the file's identity, not as the start time.
- The Garmin Connect activity id is not a field in the file. The Profile has no such field on File Id, Activity or Session (Ran it). It appears only in the exported file's name.

### Which fields say what recorded it

- **File Id** `manufacturer` and `product`: for Garmin watches the product decodes to a model name such as `fr955`, `fenix5`, or `fr265Large` (Ran it, Real file). Files written by other platforms carry their own manufacturer.
- **Device Info** with `device_index` `creator`: manufacturer, product, serial number and software version of the recording device. Garmin's guidance is that every activity file should have one. Further Device Info messages list sensors (Docs, Ran it). The watch model and software version were readable this way in the real strength file.
- **Session** `sport_profile_name`: the name of the activity profile, "Run" or "Walk" for built-in ones. In the Forerunner 935 file with Connect IQ developer data it held a name that is not a built-in profile, "Apnea CWT", which looks like the app's own (Ran it).
- **Developer Data Id**: its `application_id` is 16 bytes, and "Connect IQ Apps use the 128-bit App Id GUID that is generated by the Connect IQ project wizard" for it. It also carries an application version (Docs). The Forerunner 935 file showed exactly this: one Developer Data Id with an application id and version, and eight Field Description messages naming the custom fields (Ran it).
- **Developer fields**: custom values attached to existing messages. Through Connect IQ's FitContributor they can be added to Session, Lap and Record messages only, and an app is limited to 256 bytes per message (Docs).

For the watch-logging track this means: an activity recorded by a Gainscape Connect IQ app can be recognised by the app's GUID in Developer Data Id, and a Session developer field could carry a Gainscape identifier. Whether a Developer Data Id is written when the app creates no custom field is **unverified**, so the app should always write at least one. The documented FitContributor API offers no way to write native Set messages, so a Connect IQ app's sets would have to travel as developer fields or outside the file.

## 7. Which Input values an imported activity can fill

| Input value | Cardio activity                                                                                                  | Strength activity                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Exercise    | From `sport` and `sub_sport`, through a mapping still to be decided                                              | Only a ranked guess of categories. Needs the user to confirm or pick.    |
| Time        | Yes: Session `total_timer_time`                                                                                  | Hold sets: Set `duration` of an active set                               |
| Distance    | Yes when Session `total_distance` is present and above zero                                                      | No. The Set message has no distance.                                     |
| Intervals   | Only when laps separate work from rest and the rounds are alike                                                  | Not applicable                                                           |
| Weight      | Not applicable                                                                                                   | Yes when the user entered it on the watch: Set `weight` in kg            |
| Reps        | Not applicable                                                                                                   | Yes: Set `repetitions`, as counted by the wrist or corrected by the user |
| Warmup flag | Not applicable                                                                                                   | No. Nothing in the Set message marks a warmup.                           |
| Effort      | No. Session has `workout_rpe` and `workout_feel` for the whole workout, not per set, and no sample file had them | No                                                                       |

One activity becomes one Cardio set per session, or several when laps are used. A strength activity becomes one Lift set per active Set message.

## 8. Where the file is parsed

Both places work technically.

- **Edge Function**: fits the rule that the server is the authority, uses the official SDK without shipping it to anyone, and one parser serves both the file import and anything that arrives from Garmin automatically. Cost: the file has to be uploaded, and decoding spends CPU against the 2 s limit, which measured timings leave ample room for.
- **Browser**: nothing is uploaded and a bulk export of hundreds of files can be read locally and sent as small payloads. Cost: about 60 kB gzipped of lazy-loaded code, and the open licence question if the official SDK is the parser. `fit-file-parser` removes the licence question at the price of trusting a third party's Profile.

The choice is a decision for the map. The facts do not rule out either.

## Open unknowns

1. **Deno was not run.** Confirm `npm:@garmin/fitsdk` loads and decodes inside the Supabase Edge runtime, and measure CPU time on a long activity.
2. **Shipping the official SDK in a browser bundle** under section 2c of the FIT licence. Needs a reading of the full agreement or a question to Garmin.
3. **Edits made in Garmin Connect** after the workout: do corrected exercise names, reps and weights reach the exported original file? Test by editing one strength activity and exporting it again.
4. **How good the exercise guess is**: how often the right category is first in the list, and what `category_subtype` holds for a free workout against a structured one.
5. **Holds and bodyweight sets** in a real file: what `repetitions` and `weight` hold for a plank, and whether a skipped weight is absent or zero.
6. **Lap `intensity` on unstructured activities**, and whether current watches write Split messages. Needs a real interval run recorded with and without a structured workout.
7. **Whether a strength activity has Lap messages at all.** None were listed in the real file.
8. **The bulk export's layout**: nested zips, non-activity files in the same folder, and how long the email really takes.
9. **Exporting the original file from the phone app.**
10. **Whether a Connect IQ recording always carries a Developer Data Id**, also when the app adds no custom field.

## What was run

All of it in a scratch directory outside the repo, on Node 24.11. Nothing was added to the repo but this file.

- Installed `@garmin/fitsdk` 21.221.0 and `fit-file-parser` 6.2.3 without install scripts.
- Read the Profile out of the SDK: message and field definitions for File Id, Activity, Session, Lap, Length, Set, Exercise Title, Split, Device Info, Developer Data Id and Field Description, and the enums for sport, sub-sport, intensity, lap trigger, set type and exercise category.
- Decoded Garmin's own sample files: `Activity.fit` and `HrmPluginTestActivity.fit` from the JavaScript SDK's tests and `ActivityDevFields.fit` from the Python SDK's tests.
- Decoded Garmin's pool swim and multisport samples and two real watch recordings (a fenix 5 run and a Forerunner 935 Connect IQ recording). These four came from the test fixtures of third-party parser projects (`muktihari/fit`, `polyvertex/fitdecode`), which say the first two are from the official SDK.
- No public strength sample exists in any of the SDK repositories or the fixture sets searched. A synthetic strength file was written with the SDK's encoder and decoded with both parsers to confirm how Set messages come back. The real-watch facts in section 3 come from the coordinating session's file.
- Bundled both parsers for the browser with esbuild to check for Node dependencies and measure size.

## Sources

Garmin FIT SDK documentation:

- Activity file: https://developer.garmin.com/fit/file-types/activity/
- File types and the File Id message: https://developer.garmin.com/fit/file-types/
- Workout file (intensity values, workout steps): https://developer.garmin.com/fit/file-types/workout/
- FIT protocol: https://developer.garmin.com/fit/protocol/
- Cookbook, decoding activity files: https://developer.garmin.com/fit/cookbook/decoding-activity-files/
- Cookbook, encoding activity files (pool swims): https://developer.garmin.com/fit/cookbook/encoding-activity-files/
- Cookbook, elapsed, timer and moving durations: https://developer.garmin.com/fit/cookbook/durations/
- Cookbook, date and time values: https://developer.garmin.com/fit/cookbook/datetime/
- Cookbook, developer data fields: https://developer.garmin.com/fit/cookbook/developer-data/
- Get the SDK: https://developer.garmin.com/fit/get-the-sdk/

Garmin SDK source:

- JavaScript SDK, README, `LICENSE.txt` and `src/profile.js`: https://github.com/garmin/fit-javascript-sdk
- Field comments for the Set, Lap and Session messages: https://github.com/garmin/fit-csharp-sdk/tree/main/Dynastream/Fit/Profile/Mesgs
- npm package: https://www.npmjs.com/package/@garmin/fitsdk

Garmin support, manuals and Connect IQ:

- How Do I Export Data Out of Garmin Connect?: https://support.garmin.com/en-US/?faq=W1TvTPW8JZ6LfJSfK512Q8
- fēnix 8 owner's manual, Recording a Strength Training Activity: https://www8.garmin.com/manuals/webhelp/GUID-EECCAC99-90D6-4AB1-9A3A-EC433D3365E2/EN-US/GUID-573EC4B6-D45B-46E7-BE37-FB542CBB4FC1.html
- vívoactive 5 owner's manual, same topic with the tips list: https://www8.garmin.com/manuals/webhelp/GUID-5D183A14-BB43-4A9B-B441-5F824214CE40/EN-US/GUID-49D892BF-429E-454D-B0C6-D4AE07E9D4A0.html
- Connect IQ FitContributor: https://developer.garmin.com/connect-iq/api-docs/Toybox/FitContributor.html
- Connect IQ ActivityRecording: https://developer.garmin.com/connect-iq/api-docs/Toybox/ActivityRecording.html
- Personal API client: https://github.com/garmin/connect-personal-api-python

Supabase:

- Edge Function limits: https://supabase.com/docs/guides/functions/limits
- Edge Function dependencies: https://supabase.com/docs/guides/functions/dependencies

Third party, used only where marked:

- `fit-file-parser`: https://github.com/jimmykane/fit-parser
- Sample files: https://github.com/muktihari/fit and https://github.com/polyvertex/fitdecode
- Forum thread on Garmin Connect edits not reaching the file: https://forum.intervals.icu/t/pulling-strength-workout-exercise-sets-reps-weight-from-garmin/123171
