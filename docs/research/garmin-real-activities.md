# What 150 real Garmin activities show about file import and strength sets

Research for the Garmin integration map (#220), written 2026-11-24. It checks the shipped file import (#238 to #241) against real watch output and gathers facts for the open item "Native Garmin strength activities as Lift sets".

The branch `research/garmin-real-activities` is throwaway and is not meant to be merged, like the earlier research branches.

## Short answer

- **File import reads real files correctly.** All 150 files parsed. The start time, the duration and the distance that Gainscape reads from each file equal what Garmin's own activity list reports for the same activity.
- **Two defects showed up and are fixed** in [pull request 247](https://github.com/sebastianpantin/gainscape/pull/247): auto lap hid a structured interval, and one activity type got the wrong type key.
- **The identity rule holds.** The start second in the file equals `startTimeGMT` in Garmin's JSON for 150 of 150 activities, so a file and a later push of the same activity will meet as one.
- **Strength sets are usable for reps and weight, weak on the exercise.** Reps are present on 99% of active sets and a weight above zero on 88%. The first exercise guess is "unknown" on 18% of sets, and it names only a broad category (for example bench press), not a catalog exercise.

## How this was checked

- Source: the last 150 activities of one account, read through the Garmin Personal API (activity list JSON and the original FIT file of each), from one watch, a Forerunner 265.
- Each file went through the shipped code: `fitActivitiesOf` (`web/src/lib/garmin/fit-file.ts`) and `garminImportCandidate` (`supabase/functions/_shared/domain/garmin-import.ts`). The result was compared with the JSON entry of the same activity.
- Only structure, counts and shares were printed. The files, the list and the token stayed in a scratch directory outside the repo and were deleted afterwards. No file content or measured value is recorded here.
- Limits: one person, one watch model, seven months. Shares are a sample, not a population.

## 1. File import against real files

| Check                                          | Result                              |
| ---------------------------------------------- | ----------------------------------- |
| Files that parse with `fit-file-parser` 6.2.10 | 150 of 150, CRC checked             |
| Sessions per file                              | always 1                            |
| Start second, file against JSON `startTimeGMT` | equal, 150 of 150                   |
| Duration: file `total_timer_time`              | equals JSON `duration`, 150 of 150  |
| Distance: file `total_distance`                | equal in 93, absent in both in 57   |
| Type key derived from `sport` and `sub_sport`  | equals JSON `typeKey` in 144 of 150 |

JSON `duration` is the timer time, not `elapsedDuration` or `movingDuration`. So a server handler that reads Garmin's JSON should take `duration` to agree with the file route.

### What the watch writes for each type

| Garmin `typeKey`      | FIT `sport` / `sub_sport`        |
| --------------------- | -------------------------------- |
| `running`             | `running` / `generic`            |
| `treadmill_running`   | `running` / `treadmill`          |
| `walking`             | `walking` / `generic`            |
| `lap_swimming`        | `swimming` / `lap_swimming`      |
| `open_water_swimming` | `swimming` / `open_water`        |
| `strength_training`   | `training` / `strength_training` |
| `indoor_cardio`       | `training` / `cardio_training`   |

The last row was the defect: Gainscape derived `cardio_training`, Garmin calls it `indoor_cardio`. It made no difference to what the user saw, because neither key is in the catalog, but the stored `garmin_type` would have disagreed with a later push of the same activity.

### Laps and intervals

- 72 activities had several laps and no workout: auto lap, one lap per kilometre. They import as one steady set, as decided.
- 51 strength activities had no lap at all, which answers open unknown 7 of the FIT research: a strength activity has Set messages and no Lap messages.
- 2 activities came from a structured workout. Both files hold the Workout and Workout Step messages, and every lap carries the step it belongs to.
  - One had a work step measured by distance. It imports as one steady set, as decided (an interval needs timed steps).
  - The other had timed work and recovery steps with a repeat. **Auto lap cut each work step into two laps that point at the same step**, so the lap sequence read work, work, recovery, work, work. The mapping wanted strict work and rest turns and fell back to a steady set. Fixed: the laps of one step count as one round when their time adds up to the planned step time.
  - In that file the timer time of every finished step equalled its planned time exactly (ratio 1.000); only the warmup, ended early by hand, was shorter. So lap time against planned time is a reliable way to tell an auto lap from a real repeat, and a step that was cut short.
- Lap `intensity` on that file matched the step intensity (warmup, interval, recovery, cooldown). On plain runs every lap is `active` or `interval` with no step link, so the rule "an interval only from workout steps" stays right.

## 2. Catalog coverage of real activity types

Share of the 150 activities by what the Import review would do with them:

| What happens                        | Share | Types                                           |
| ----------------------------------- | ----- | ----------------------------------------------- |
| Mapped to a Cardio exercise         | 62%   | running, walking, treadmill running, both swims |
| Greyed, "Strength not imported yet" | 34%   | strength training                               |
| "Needs an exercise"                 | 4%    | indoor cardio                                   |

- **Strength is a third of this history.** It is the largest thing file import leaves out, so the strength slice is worth more than any further cardio type.
- **`indoor_cardio` is the one unmapped type.** It is Garmin's generic "Cardio" profile, so no single catalog exercise fits; asking the user is the right behaviour. Whether it deserves a default is a product decision.
- **Four walks ran longer than 4 hours** and are greyed "Over 4 h" (two between 4 and 6 hours, two between 6 and 12). All were recorded as walking. The 4 hour limit of a Cardio set turns away real long walks and hikes; raising it was left out of the first slice in #226 and is worth a decision now that real data shows it.

## 3. Strength activities: what a set holds

51 strength activities, 1,123 active sets, 1,112 rest sets. Between 11 and 25 active sets in most activities.

### Fields

Every Set message has `set_type` (`active` or `rest`), `start_time`, `duration`, `category` and `category_subtype`. Active sets add `repetitions` and `weight`.

| Fact about an active set | Share                       |
| ------------------------ | --------------------------- |
| `repetitions` above zero | 99%                         |
| `weight` above zero      | 88%                         |
| `weight` zero            | 12%                         |
| `weight` field absent    | under 1%                    |
| Linked to a workout step | 0% (all were free workouts) |

- A zero weight does not tell a bodyweight exercise from a forgotten entry: a third of the zero-weight sets had a first category that normally carries load.
- 5% of sets had a weight on a category that is normally bodyweight (pull-up, push-up, sit-up), which is what a weighted pull-up looks like. So the weight must be kept, and the load type has to come from the catalog exercise, not from the category.

### The exercise guess

- `category` is always a list of 3 candidates, and `category_subtype` a matching list of 3.
- The 3 candidates name 3 different categories on 59% of sets and 2 on 23%. On 18% the first candidate is "unknown"; on most of those the second is unknown too.
- The first subtype is a specific exercise number on 31% of sets and empty on 69%. `fit-file-parser` leaves the subtype as a number, with no name.
- 18 distinct first categories appeared, and 26 distinct pairs of category and subtype. A category is broad: "bench press", "row", "deadlift", "curl". It does not say barbell or dumbbell, incline or flat.
- Garmin's activity list JSON carries a summary per category (`summarizedExerciseSets`: category, sets, reps, volume, max weight). Its categories equal the first candidates of the file's sets in 46 of 51 activities. So the JSON summary is the first guess, added up; it holds no better exercise information than the file, and it loses the single sets.

### What this means for the strength slice

1. **Reps, weight and set order can be imported as they are.** They are present and need no guess.
2. **The exercise cannot be mapped by table alone.** A category is a group of catalog exercises, and about one set in five has no guess at all. The Import review needs an exercise choice per group of sets, prefilled where the category narrows it down.
3. **Group the sets before asking.** Consecutive active sets with the same first category are one exercise in practice; asking once per group instead of once per set keeps the review short (a typical activity had 5 to 8 groups).
4. **Never infer the load type or a warmup from the file.** Nothing marks a warmup, and weight zero is ambiguous.
5. **The file is the source, not the JSON.** The per-set values exist only in the FIT file.

## Open unknowns

1. How Garmin Connect edits reach the file: if the user corrects an exercise name, reps or weight in the app after the workout, does the downloaded original change? Not testable from history alone.
2. What a set looks like when it comes from a structured strength workout (`wkt_step_index` set, exercise named by the plan). None of the 51 was structured; the trial in #230 would show it.
3. The names behind the subtype numbers. They are in Garmin's FIT profile; reading them needs a lookup table, which `fit-file-parser` does not ship.
4. Other watch models and other users. Everything here is one Forerunner 265.
