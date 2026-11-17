# What a Connect IQ watch app can do for standalone set logging

Research for issue #223, part of the Garmin integration plan (Watch logging track). Researched on 2026-11-17 against the Connect IQ documentation for SDK 9.3.0 (API docs generated 2026-10-30).

This file lives in `docs/research/` because the repo had no place for research notes yet. It is on a throwaway branch and is not meant to be merged.

## How to read this

Each claim carries one of three marks.

- **[doc]** The claim is stated in Garmin's own Connect IQ documentation or API reference. The source is linked.
- **[blog]** The claim comes from a post by Garmin staff on the Connect IQ developer news blog. First-party, but older and not part of the reference.
- **[unverified]** The claim rests on developer forum posts, on my own inference, or on general knowledge that I did not re-check. Treat it as a lead to test, not as a fact.

Nothing here was tested on a watch or in the simulator. The SDK was not installed.

## Verdict

A custom Connect IQ device app ("watch app") is a workable route for Watch logging, and it needs no native phone app. It can show each prescribed set, let the lifter confirm or adjust it, run a rest timer with vibration, keep everything on the watch, record a strength activity with heart rate that lands in Garmin Connect, and send the workout to an HTTPS backend. All of that is covered by documented APIs.

It comes with five hard limits.

1. **No phone in range means no network, on almost every watch.** A web request goes through the paired phone over Bluetooth. With the phone away the request fails at once. So the Day has to be on the watch before the session starts, and the logged sets have to wait in watch storage until the phone is back. The exception is a handful of LTE models.
2. **Sign-in needs the phone once.** Every documented way to get a credential onto the watch passes through the phone (or a computer). After that the watch can work alone.
3. **Logged sets cannot become native Garmin strength sets.** An app can write its own "developer fields" into the session, lap and per-second record messages of the activity file. It cannot write the set records that Garmin's own Strength activity produces. The best available result is one lap per set with reps and weight as Connect IQ fields in the lap table, and only for an app installed from the store (or as a beta).
4. **Reach and size.** Only Connect IQ watches qualify, and many mid-range models give a watch app about 128 KB of memory. About 60 of the roughly 150 supported wearables have no touch screen, so the whole flow must work with buttons.
5. **The watch cannot compute what the workout earned.** That follows from Gainscape's own rule that the server is the authority. The watch can only show XP, records and loot after a sync, if at all.

The route costs a second codebase in Monkey C, a device test matrix, and a store listing with a review.

The owner's watch, a Forerunner 265 (46 mm), is a comfortable first target: API level 5.2, about 768 KB for a watch app, touch screen plus five buttons, and no needed API missing. Details are under Devices.

## What works with no phone in range

| Step                                               | Phone away                          | Why                                                            |
| -------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| Open the app, show the Day and each prescribed set | Yes, if the Day was fetched earlier | Stored on the watch with `Application.Storage`                 |
| Confirm or adjust reps and weight                  | Yes                                 | Local input, local storage                                     |
| Rest timer with vibration or tone                  | Yes                                 | `Timer` and `Attention` run on the watch                       |
| Record the activity with heart rate                | Yes                                 | `ActivityRecording` writes a FIT file on the watch             |
| Fetch a Day that is not on the watch yet           | No (LTE models excepted)            | Needs a web request                                            |
| Sign in or pair for the first time                 | No                                  | Needs the phone                                                |
| Send the workout to Gainscape                      | No, it waits                        | Queued in storage, sent when the phone is back                 |
| Activity appears in Garmin Connect                 | No, it waits                        | The watch syncs with Garmin Connect later, as for any activity |

## Network

### How a watch app calls an HTTPS API

- `Communications.makeWebRequest()` makes an asynchronous request and calls back with a response code and the parsed body. It exists since API level 1.3.0 and needs the `Communications` permission. [doc: [JSON REST Requests](https://developer.garmin.com/connect-iq/core-topics/https/)]
- By default the request is proxied by the Garmin Connect app on the phone: "calls to basic web services through Garmin Connect Mobile ... The JSON calls are converted to serialized Monkey C data and sent across the BLE pipe." The same page says this lets a developer build "a wearable web app without having to write their own companion phone app". That is the property a PWA needs. [doc: same page]
- The API reference adds: "This method can be used when connected to WiFi or a mobile device over Bluetooth." [doc: [Toybox.Communications](https://developer.garmin.com/connect-iq/api-docs/Toybox/Communications.html)]
- Methods are GET, PUT, POST and DELETE. There is no PATCH. Request bodies are JSON or URL-encoded; a free-form `:body` and a free-form content type exist only from API level 6.0.3. Custom headers are allowed through `:headers`, so an `Authorization` header can be sent. Responses are parsed as JSON, URL-encoded or plain text; an unknown `Content-Type` is an error. [doc: Toybox.Communications]
- There is an error code for a request that must be HTTPS (`SECURE_CONNECTION_REQUIRED`, -1001). Plan on HTTPS only. Edge Functions already are. [doc: Toybox.Communications]
- A background service can also make web requests. It can be woken on a timer (no more often than every five minutes), or when an activity is completed. It must finish within 30 seconds and runs in a much smaller memory pool than the app. Garmin's FAQ gives 32 KB for the background heap. From API level 3.2.0 it can read and write `Application.Storage`. This is the hook for sending a finished workout later without the lifter opening the app. [doc: [Background Services](https://developer.garmin.com/connect-iq/core-topics/backgrounding/), [Toybox.Background](https://developer.garmin.com/connect-iq/api-docs/Toybox/Background.html), [background service FAQ](https://developer.garmin.com/connect-iq/connect-iq-faq/how-do-i-create-a-connect-iq-background-service/), [Persisting Data](https://developer.garmin.com/connect-iq/core-topics/persisting-data/)]

### Wi-Fi and LTE

- **Wi-Fi.** The API note above mentions Wi-Fi, and the documented Wi-Fi feature is "sync mode": the app asks to sync, the user agrees, the watch turns Wi-Fi on and hands control to a `SyncDelegate` (API level 3.1.0, built for bulk downloads such as music). `Communications.checkWifiConnection()` (3.2.0) tests whether a saved access point is reachable. [doc: [Downloading Content](https://developer.garmin.com/connect-iq/core-topics/downloading-content/), Toybox.Communications]
- Forum posts by experienced developers say that watches do not keep a Wi-Fi connection open for ordinary web requests, that a request without the phone fails with -104, and that only some Edge bike computers behave differently. No Garmin staff answer confirms this. Assume Wi-Fi is not available for normal requests on a watch. [unverified: [forum thread on Wi-Fi requests](https://forums.garmin.com/developer/connect-iq/f/discussion/251935/http-request-over-device-wi-fi-specification), [forum thread on -104 with Wi-Fi set up](https://forums.garmin.com/developer/connect-iq/f/discussion/431114/fenix-7-wifi-setup-makewebrequest-throws-ble_connection_unavailable)]
- **LTE.** From API level 6.0.3 an app can call `Communications.enableConnection()` with `CONNECTION_TYPE_LTE` and check it with `checkLteConnection()`. The connection is switched off when the app goes inactive or after five minutes without a request. The reference lists seven devices for this: fēnix 8 Pro, the fēnix 9 and 9 Pro sizes, and MARQ Gen 3. [doc: Toybox.Communications]
- Whether LTE requests need a paid Garmin LTE plan, and how they behave in practice, I could not confirm. An older forum thread says apps have no LTE access, but it predates this API. [unverified: [forum thread](https://forums.garmin.com/developer/connect-iq/f/discussion/421350/lte-with-new-fenix-8-pro/1972077)]

### With no connection

- The request fails through the callback with a negative code. `BLE_CONNECTION_UNAVAILABLE` (-104) means "No BLE connection is available". Other codes cover timeouts, a dropped connection and a full request queue (`BLE_QUEUE_FULL`, -101). [doc: Toybox.Communications]
- The app can check first: `System.getDeviceSettings().phoneConnected` (API 1.1.0), `connectionAvailable` and `connectionInfo` with `:bluetooth`, `:wifi` and `:lte` keys (API 3.0.0). [doc: [DeviceSettings](https://developer.garmin.com/connect-iq/api-docs/Toybox/System/DeviceSettings.html)]
- Nothing queues or retries for the app. The app has to store the pending upload and try again, either when it is next opened or from a background service.

### Limits on requests and responses

- There are error codes for a request that is too large (`BLE_REQUEST_TOO_LARGE`, -102), a response that is too large (`NETWORK_RESPONSE_TOO_LARGE`, -402) and running out of memory while parsing a response (`NETWORK_RESPONSE_OUT_OF_MEMORY`, -403). The documentation gives no byte figures for any of them. [doc: Toybox.Communications]
- Garmin's FAQ says the Bluetooth link is slow, "generally between 400 and 800 bytes/s", and advises returning only the fields the watch needs. The FAQ is old and the figure may be out of date. [doc: [REST services FAQ](https://developer.garmin.com/connect-iq/connect-iq-faq/how-do-i-use-rest-services/)]
- Forum reports say the response limit depends on the device and on free memory, that the simulator is more generous than real watches, and that a background service can run out near 28 KB. There is an open request to Garmin to document the limits. [unverified: [forum thread on -402](https://forums.garmin.com/developer/connect-iq/f/discussion/414966/understanding--402-response-limit-for-makewebrequest), [bug report asking for documentation](https://forums.garmin.com/developer/connect-iq/i/bug-reports/request-for-documentation-and-simulator-accuracy-on-makewebrequest-limits)]
- Consequence for Gainscape: the watch should not call the existing endpoints as they are. It needs small, purpose-built responses (one Day with exercise names, weights and reps) and a compact upload. A Day and its logged sets are a few kilobytes at most, which is well inside every figure above.

## Storage

- `Application.Storage` is a persistent key-value store on the watch's file system, available since API level 2.4.0. It keeps numbers, strings, booleans, arrays and dictionaries. A value is written to disk when `setValue()` is called, so progress survives the app closing. [doc: [Persisting Data](https://developer.garmin.com/connect-iq/core-topics/persisting-data/), [Application.Storage](https://developer.garmin.com/connect-iq/api-docs/Toybox/Application/Storage.html)]
- A single value is limited to 32 KB. The total size "can vary between devices" and is not published; when it is exceeded `setValue()` throws `StorageFullException`. [doc: Application.Storage]
- One Garmin FAQ page says values are limited to 8 KB. It is older than the reference. Keeping each value well under 8 KB avoids the question. [doc: [audio content provider FAQ](https://developer.garmin.com/connect-iq/connect-iq-faq/how-do-i-create-an-audio-content-provider/)]
- The data is private to the app. For an app installed from the store the stored data is encrypted and cannot be read with the developer tools. [doc: [Security](https://developer.garmin.com/connect-iq/core-topics/security/)]
- This is enough for the job. A Day with, say, eight exercises of five sets, plus the logged result of each set, is a few kilobytes. Storing the Day under one key and each finished workout under its own key keeps every value small. Several unsent workouts fit as well.
- The limit that bites is not storage but working memory, because stored data has to be loaded into the app's memory to be used. See Devices.

## Sign-in

Gainscape signs users in with email and password through GoTrue. The watch needs some credential it can send in a header. There are three documented ways to get one onto the watch, and none needs a native companion app. All three need the phone (or a computer) once.

### 1. OAuth-style sign-in in a web view on the phone

- `Communications.makeOAuthRequest()` (API 1.3.0) and `Authentication.makeOAuthRequest()` (API 3.3.0) exist for this. The watch asks; the phone shows a notification; tapping it opens a web view on the given URL, inside Garmin Connect for the first call and inside the Connect IQ Store app for the second. When the web view reaches the agreed result URL, the named values in that URL are sent back to the watch. The required redirect is `http://localhost` for the first call and `connectiq://oauth` for the second. [doc: [Authenticated Web Services](https://developer.garmin.com/connect-iq/core-topics/authenticated-web-services/), [Toybox.Authentication](https://developer.garmin.com/connect-iq/api-docs/Toybox/Authentication.html)]
- The call "can only be used when connected to a mobile device over Bluetooth". [doc: Toybox.Communications]
- If the app closes before the user finishes, the result is kept and delivered the next time the app registers for it. A background service can also be woken by the result. [doc: Authenticated Web Services, Background Services]
- What the backend has to provide is a web page that signs the user in and then redirects to the result URL with a value in the query string. The mechanism only reads keys from the final URL, so it should work with a Gainscape sign-in page even though GoTrue is not being used as an OAuth provider here. I did not test this. [unverified: inference from the API description]
- A sensible shape is to return a one-time code in the redirect, not a token, and have the watch exchange the code with an Edge Function. That keeps tokens out of URLs. [unverified: design suggestion]
- The web view is a fresh browser inside Garmin's app. The lifter is not signed in there and types the password again. Password sign-in suits this. A sign-in method that depends on another app or browser (a magic link, some social logins) may not complete inside the web view. [unverified]

### 2. A pairing code

- The watch asks an Edge Function for a short code and shows it. The lifter opens Gainscape on the phone, where they are already signed in, and types the code. The watch polls until the pairing is approved and then receives its credential. This uses only `makeWebRequest()`, so it works on every API level the app would target and does not depend on Garmin's web view. [unverified: design based on documented APIs; the pattern is the OAuth device authorization grant]
- It still needs the phone in range at pairing time, because the watch's requests go through it.

### 3. App settings

- An app can declare settings that the user edits on the phone in the Connect IQ Store app or Garmin Connect, or on a computer in Garmin Express. Setting types include `alphaNumeric` and `password`. The app is told through `onSettingsChanged()`. The lifter could paste a pairing token from Gainscape into such a field. [doc: [Properties and App Settings](https://developer.garmin.com/connect-iq/core-topics/properties-and-app-settings/)]
- Settings are a store feature. Garmin describes beta apps as the way to "test app settings and Garmin Connect integration in production", which implies a sideloaded build has no settings screen. [doc: [Beta Apps](https://developer.garmin.com/connect-iq/core-topics/beta-apps/); the implication is mine]
- Typing or pasting a long token is clumsy. This is the fallback, not the first choice.

### What is ruled out

- The Connect IQ Mobile SDK lets a native iOS or Android app exchange messages with the watch app. Gainscape is a PWA and has no such app, so this path is closed. [doc: [Communicating with Mobile Apps](https://developer.garmin.com/connect-iq/core-topics/communicating-with-mobile-apps/)]
- Typing an email and password on the watch is technically possible with a text picker but is not a serious option.

### After sign-in

- The credential lives in `Application.Storage`. The watch can only refresh it while connected, so a short-lived access token alone would often be expired when the watch finally gets a connection after a session. A dedicated watch credential that lasts and can be revoked from the Gainscape account fits better. [unverified: design consequence]

## Recording

### A strength activity with heart rate, at the same time

- Yes. A device app can start, stop, lap, save and discard a FIT recording with `ActivityRecording.createSession()` and the `Session` object, while its own screens stay in front. The steps are: enable the sensors, create the session, `start()`, `stop()`, then `save()` or `discard()`. "Data from the enabled sensors will be recorded into the FIT file." [doc: [Activity Recording](https://developer.garmin.com/connect-iq/core-topics/activity-recording/)]
- The session takes a sport and sub-sport. `SPORT_TRAINING` with `SUB_SPORT_STRENGTH_TRAINING` exists, and a name is required (about 15 characters). [doc: [Toybox.ActivityRecording](https://developer.garmin.com/connect-iq/api-docs/Toybox/ActivityRecording.html), [Toybox.Activity](https://developer.garmin.com/connect-iq/api-docs/Toybox/Activity.html)]
- Heart rate is enabled with `Sensor.setEnabledSensors([Sensor.SENSOR_HEARTRATE])`. [doc: [Sensors](https://developer.garmin.com/connect-iq/core-topics/sensors/)]
- "The FIT file will sync with Garmin Connect." It is then an ordinary activity there. [doc: Activity Recording]
- This needs the `Fit` permission, which only the device app type can hold. Widgets "are not allowed to record activities". An app with this permission is listed among the watch's activities. [doc: [Manifest and Permissions](https://developer.garmin.com/connect-iq/core-topics/manifest-and-permissions/), [App Types](https://developer.garmin.com/connect-iq/connect-iq-basics/app-types/)]
- The sport setting "is not guaranteed to change device behavior". So it is unknown whether the watch's own strength features, such as automatic rep counting, do anything inside a Connect IQ session. Assume they do not. [doc for the quote: Toybox.ActivityRecording; the conclusion is unverified]
- Only one session can exist at a time. [doc: Toybox.ActivityRecording]

### Writing the sets into the activity

- An app can add its own fields to the FIT file with `Session.createField()`. A field belongs to one of exactly three message types: `MESG_TYPE_RECORD` (per second, numbers only), `MESG_TYPE_LAP` (once per lap) and `MESG_TYPE_SESSION` (once per activity). Lap and session fields may be strings. An app may use up to 256 bytes of such fields per message, and field ids run from 0 to 255. [doc: [Toybox.FitContributor](https://developer.garmin.com/connect-iq/api-docs/Toybox/FitContributor.html), [Session](https://developer.garmin.com/connect-iq/api-docs/Toybox/ActivityRecording/Session.html)]
- The `Session` class has these methods and no others: `start`, `stop`, `save`, `discard`, `isRecording`, `addLap`, `createField`, `setTimerEventListener`. There is no call that writes a set, an exercise, reps or weight as native data. [doc: Session]
- Garmin's own Strength activity stores each set as a separate "set" record in the FIT file, and Garmin Connect builds its exercise list, reps and weights from those. FitContributor cannot produce that record type. So sets logged in a Connect IQ app will not show up as native strength sets in Garmin Connect. [doc for what the API allows; the statement about the native set record is from the FIT profile and was not re-checked here, see the FIT file ticket]
- What is possible instead:
  - Call `addLap()` at the end of each set and attach lap fields such as reps, weight and exercise name. Garmin Connect can show lap fields "in the Activity Laps section" of the activity page when the field is declared with `displayInActivityLaps`.
  - Add session fields, such as total volume or a short text summary, shown in the Activity Summary section with `displayInActivitySummary`.
  - Add a per-second record field, shown as a chart with `displayInChart`. This is of little use for sets.

  [doc: Activity Recording]

- Garmin Connect only knows how to label and show these fields from the app's store listing. Garmin says a beta app is what lets a developer "test your developer fields in Garmin Connect". Forum answers say outright that a sideloaded app's fields do not show. The values are still in the FIT file either way. [doc: Beta Apps; unverified: [forum thread](https://forums.garmin.com/developer/connect-iq/f/discussion/6793/fitcontributor-custom-filed-how-to-visualize-it-in-garmin-connect)]
- I could not confirm how lap fields look for a strength-type activity in the current Garmin Connect phone app and website. One old forum question from a developer who tried `addLap()` to get repetitions shown like Garmin's strength app has no answer. This has to be tested with a beta app. [unverified: [forum thread](https://forums.garmin.com/developer/connect-iq/f/discussion/193791/show-individual-exercises-for-strength-training-in-fit)]
- `createField()` has a `:nativeNum` option to mark a developer field as equivalent to a standard FIT field of the same message. It applies only within session, lap and record messages, so it does not open a way to native sets. Whether Garmin Connect honours it at all I did not confirm. The review guidelines also forbid apps from overriding values that normally come from the device. [doc: Session, [App Review Guidelines](https://developer.garmin.com/connect-iq/app-review-guidelines/)]
- Because the sets are in the FIT file as developer fields, a backend that receives the FIT file from Garmin could in principle read them from there. The Activity Recording page points to the Garmin Connect Developer Program for that. That is a separate question with its own ticket. [doc: Activity Recording]

### Reliability notes

- Forum bug reports describe a session left without an owner when the app is terminated mid-recording, and whole-watch resets on saving a session on Venu 4 firmware. These are single reports, not documentation. They argue for saving progress to storage after every set and for testing on real hardware. [unverified: [orphaned session report](https://forums.garmin.com/developer/connect-iq/i/bug-reports/app-terminated-on-wrist-off-during-an-activityrecording-session-leaves-the-session-orphaned-activity-list-blocked-watch-needs-a-reboot), [Venu 4 report](https://forums.garmin.com/developer/connect-iq/i/bug-reports/venu-4-fw-18-32-rtl-trap-full-watch-reset-when-ending-an-activityrecording-session-session-stop-session-save)]

## Devices

### The owner's watch: Forerunner 265 (46 mm)

The owner's watch is a Forerunner 265, 46 mm, on software 29.05 (FIT product 4257, `fr265Large`). Garmin's Connect IQ lists call this model "Forerunner 265"; the 42 mm model is the "265s". The SDK device id is `fr265`.

| Property                        | Forerunner 265                                                                                  | Mark                                                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Connect IQ API level            | 5.2                                                                                             | [doc: Compatible Devices]                                                                                                                                                      |
| Screen                          | 416 x 416, round, AMOLED, 65536 colours                                                         | [doc: Compatible Devices, Device Reference]                                                                                                                                    |
| Touch screen                    | Yes                                                                                             | [doc: Device Reference]                                                                                                                                                        |
| Buttons                         | up, down, enter, back (esc), menu                                                               | [doc: Device Reference]                                                                                                                                                        |
| Memory for a watch app          | 786,432 bytes (768 KB)                                                                          | [unverified: community table built from the SDK device files]                                                                                                                  |
| Memory for a background service | 65,536 bytes (64 KB)                                                                            | [unverified: same table]                                                                                                                                                       |
| Wi-Fi                           | Yes. The manual lists activity uploads, audio content, software updates and workouts over Wi-Fi | [doc: [Forerunner 265 owner's manual](https://www8.garmin.com/manuals/webhelp/GUID-F41EAFB3-6CC9-42DE-9C6C-9E358DBB0671/EN-US/GUID-7089BCD7-BBA9-4AB1-BE0C-3FA4A2FAE861.html)] |
| LTE                             | No. It is not in the device list for the LTE calls                                              | [doc: Toybox.Communications]                                                                                                                                                   |

What this means for the app:

- **Every API the app needs is there.** Web requests, storage, storage from the background service, activity recording with developer fields, background events, both sign-in web views, `Menu2`, pickers, drags and flicks, vibration and tones all exist at or below level 5.2, and the Forerunner 265 appears in the API reference's device list wherever such a list is given for them. [doc: API reference pages]
- **What it lacks is not needed.** It has no LTE calls. It also lacks the two request options that arrived with API level 6.0.3: a free-form `:body` and a free-form content type string. A JSON POST built from a parameters dictionary works without them. In the reference pages I read, it is otherwise absent only from the lists for flashlight control, night mode, font scale, the app active/inactive callbacks, sub-screens and phone-app message errors, none of which the app uses. [doc: Toybox.Communications and the other API reference pages]
- **Memory is not a constraint on this watch.** 768 KB is six times the 128 KB of the mid-range models. An app that fits those will fit here with room to spare. The risk runs the other way: an app developed only on this watch can grow past what a Forerunner 245 or fēnix 6 allows without anyone noticing. Build for a 128 KB device in the simulator from the start.
- **Input.** It has both a touch screen and the full five buttons, so both input styles can be tried on one watch.
- **Wi-Fi does not change the no-phone answer.** The watch has Wi-Fi, and Garmin uses it to upload a finished activity to Garmin Connect. Whether a Connect IQ app's own web request can use it outside sync mode is the open question from the Network section, and this watch is where it can be tested. [unverified]
- I did not confirm that software 29.05 in particular reports API level 5.2. The compatibility page gives one level per device, and the community table gives 5.2.0 as the highest level for this device. [unverified]

### Which watches

- Garmin's compatibility list has 180 devices. Leaving out Edge bike computers and outdoor handhelds, 149 are watches. Their Connect IQ API levels are spread like this (my count from the page):

  | API level  | Watches | Examples                                                                               |
  | ---------- | ------- | -------------------------------------------------------------------------------------- |
  | 1.2 to 2.4 | 15      | fēnix 3, Forerunner 230/235/45/735xt, first vívoactive, vívoactive HR                  |
  | 3.0 to 3.2 | 18      | fēnix 5, Forerunner 645/935, vívoactive 3                                              |
  | 3.3        | 17      | fēnix 5 Plus, Forerunner 245/745/945, Venu, Venu Sq, vívoactive 4                      |
  | 3.4        | 23      | fēnix 6, Forerunner 55/945 LTE, Instinct 2, Enduro, first MARQ                         |
  | 5.0 to 5.2 | 40      | Venu 2/3, Venu Sq 2, fēnix 7, epix Gen 2, Forerunner 165/255/265/955/965, vívoactive 5 |
  | 6.0        | 36      | fēnix 8/9, Forerunner 170/570/970, Venu 4, Venu X1, vívoactive 6, Instinct 3           |

  [doc: [Compatible Devices](https://developer.garmin.com/connect-iq/compatible-devices/)]

- Watches that are not on the list cannot run the app at all. The list has no Lily, vívosmart, vívomove or vívofit, and no first-generation Instinct. [doc: Compatible Devices]

### The API level the app needs

| Need                                         | API                                   | Since         |
| -------------------------------------------- | ------------------------------------- | ------------- |
| Web requests                                 | `Communications.makeWebRequest`       | 1.3.0         |
| Storage                                      | `Application.Storage`                 | 2.4.0         |
| Recording with developer fields              | `ActivityRecording`, `FitContributor` | 1.0.0 / 1.3.0 |
| Background upload                            | `Toybox.Background`                   | 2.3.0         |
| Storage from the background service          | `Application.Storage`                 | 3.2.0         |
| List menus                                   | `WatchUi.Menu2`                       | 3.0.0         |
| Sign-in web view in the Connect IQ Store app | `Toybox.Authentication`               | 3.3.0         |
| Sign-in web view in Garmin Connect           | `Communications.makeOAuthRequest`     | 1.3.0         |
| LTE requests                                 | `Communications.enableConnection`     | 6.0.3         |

[doc: the API reference pages linked above, [Native Controls](https://developer.garmin.com/connect-iq/core-topics/native-controls/)]

A minimum of API level 3.3 or 3.4 is a reasonable line. It covers 116 or 99 of the 149 watches and everything sold in recent years. Nothing the app needs requires level 5 or 6. The manifest's `minApiLevel` enforces the line. [doc: Manifest and Permissions]

### Memory

- The web documentation does not publish per-device memory limits. They are in the device files that ship with the SDK, which I did not install. An app can read its own figures at run time from `System.getSystemStats()` (`totalMemory`, `usedMemory`, `freeMemory`). [doc: [System.Stats](https://developer.garmin.com/connect-iq/api-docs/Toybox/System/Stats.html)]
- A Garmin developer blog post from February 2022 gives the memory for a device app as 128 KB on Forerunner 245, fēnix 6 and 6S, Enduro, Forerunner 55 and the plain Venu Sq, 96 KB on the Instinct 2 series, 768 KB on epix Gen 2 and the Venu 2 series, and 1024 KB on Venu and Venu Sq Music. [blog: [The Real Devices of Connect IQ, part 1](https://forums.garmin.com/developer/connect-iq/b/news-announcements/posts/the-real-devices-of-connect-iq-part-1)]
- A community project publishes the same limits for every device, extracted by script from the SDK device files and last updated on 2026-11-02. It agrees with the blog post where they overlap. Counting watches only:

  | Memory for a watch app   | Watches | Examples                                                                                           |
  | ------------------------ | ------- | -------------------------------------------------------------------------------------------------- |
  | No watch app type at all | 3       | Forerunner 45, Garmin Swim 2                                                                       |
  | 64 KB                    | 9       | fēnix 3, Forerunner 230/235, first vívoactive                                                      |
  | 96 KB                    | 5       | Instinct 2 series, Instinct Crossover, Descent G1                                                  |
  | 128 KB                   | 19      | fēnix 5/6/6S, Forerunner 245/55/645/935, Venu Sq, vívoactive 3, Instinct 3 Solar 45 mm, Instinct E |
  | 512 KB                   | 2       | Forerunner 255                                                                                     |
  | 768 KB                   | 72      | Forerunner 165/265/955/965/570/970, fēnix 7/8/9, epix Gen 2, Venu 2/3/4, vívoactive 5/6            |
  | 1024 KB                  | 15      | Venu, Venu Sq Music, vívoactive 4, vívoactive 3 Music                                              |
  | 1280 KB                  | 26      | fēnix 5 Plus, fēnix 6 Pro, Forerunner 245 Music/745/945                                            |

  The same source gives the background service 32 KB on 75 devices and 64 KB on 95. [unverified: [garmin-dev-tools CSV files](https://github.com/flocsy/garmin-dev-tools/tree/main/csv), third-party, not checked against an installed SDK]

- That budget holds the compiled code, the screens, and whatever data is loaded. A set logger fits in 96 to 128 KB if it stays plain: no bitmaps to speak of, one Day in memory at a time, small server responses. It is the main constraint on design for the mid-range watches, and some of those are current models (Instinct E, Instinct 3 Solar 45 mm). [unverified: my judgement, to be checked with a prototype]
- The low-memory group overlaps with the old API levels but not completely. A minimum API level does not by itself keep the 96 KB and 128 KB watches out.

### Touch against buttons

- The device reference lists, for each device, whether it has a touch screen and which buttons it has. 62 of the 149 watches have no touch screen. Button sets differ: many have up, down, enter, back and menu, while touch-first watches may have only enter and back. [doc: [Device Reference](https://developer.garmin.com/connect-iq/device-reference/)]
- A touch screen can also be switched off by the user. `DeviceSettings.isTouchScreen` is false then. [doc: DeviceSettings]
- So the app must be fully usable with buttons and may add touch as a convenience. Device apps get the most input access of any app type: key presses, taps, swipes, and from API 3.3.0 drags and flicks. The system menus, pickers and confirmation dialogs already work with both input styles, and a picker is the natural control for adjusting reps or weight. [doc: [Input Handling](https://developer.garmin.com/connect-iq/core-topics/input-handling/), Native Controls]
- Screens range from 176 x 176 two-colour to 454 x 454 AMOLED, mostly round. Layouts have to be per screen family. [doc: Device Reference, Compatible Devices]
- Vibration and tones go through `Attention`. Not every device has a tone generator, so the code must check before calling it. [doc: [Toybox.Attention](https://developer.garmin.com/connect-iq/api-docs/Toybox/Attention.html)]

## Shipping

### Sideloading for the owner

- The Visual Studio Code extension builds a `.prg` file for one device model ("Build for Device"). Copying it to the watch's `GARMIN/APPS` folder over USB installs it. [doc: [Your First App](https://developer.garmin.com/connect-iq/connect-iq-basics/your-first-app/)]
- Every build is signed with the developer's own 4096-bit RSA key. A sideloaded app runs at the "Developer" trust level. The same key must sign every later store update; if it is lost the app can no longer be updated. The key must never be committed. [doc: [Security](https://developer.garmin.com/connect-iq/core-topics/security/)]
- A sideloaded build is enough to try logging, storage, the timer, recording and web requests. It is not enough to try app settings or to see developer fields in Garmin Connect. Whether the sign-in web view works for a sideloaded build I could not confirm. [doc: Beta Apps for the first two; the last is unverified]
- The simulator covers most of the rest, including web requests, storage, background events and FIT recording. [doc: Activity Recording, Background Services]

### Beta distribution

- A beta app is uploaded to the store under a second app id with the "Beta App" box ticked. It can be updated as often as wanted, downloaded to the developer's own watch, and used to test settings and Garmin Connect integration. [doc: Beta Apps]
- "URLs to the beta will not be visible outside of your account." So a beta is a staging step for the developer, not a way to hand the app to other testers. I found no documented tester programme. Other people get the app either as a sideloaded file or from the public store. [doc: Beta Apps; the conclusion about testers is mine]

### The public store

- Export an `.iq` file that contains a build for every device named in the manifest, upload it on the developer site, and add a description and screenshots. [doc: [Publishing to the Store](https://developer.garmin.com/connect-iq/core-topics/publishing-to-the-store/)]
- Garmin reviews the submission, normally within 72 hours. Until approval the app is visible only to the developer. A rejection comes with reasons by email and can be fixed and resubmitted. [doc: Publishing to the Store]
- The review guidelines ask for a finished, tested, stable app; honest description; a statement of whether the app needs payment; a note of any third-party hardware or software it depends on (here: a Gainscape account); no claim of partnership with Garmin; no overriding of data that comes from the device; and respect for privacy law. [doc: [App Review Guidelines](https://developer.garmin.com/connect-iq/app-review-guidelines/)]
- The Developer Agreement requires a privacy policy for any app that collects user data, and the policy must say the data goes to the developer and not to Garmin. Garmin's publishing page also puts GDPR duties (consent, access, erasure) on the developer. Gainscape would be sending workout data and possibly heart rate to its own backend, so both apply. [doc: [Developer Agreement on the SDK page](https://developer.garmin.com/connect-iq/sdk/), Publishing to the Store]
- I found no fee for publishing a free app. The fees named in the agreement belong to the optional service for selling apps. I did not find a statement that publishing is free either. [doc: Developer Agreement, read by keyword search, not in full]

## Open unknowns

1. **How Garmin Connect shows lap and summary fields for a strength activity** recorded by a Connect IQ app, on the phone and on the web. This decides whether "sets inside the Garmin activity" is worth building. Needs a beta app and a real sync.
2. **Whether native strength features run inside a Connect IQ session** (rep counting, the native set screens). The documentation only says the sport setting may not change device behaviour.
3. **Wi-Fi for ordinary requests on a watch.** The API note allows it; forum experience says it does not happen. Needs a test with the phone switched off.
4. **LTE requests**: plan requirements and real behaviour on the few LTE models.
5. **Request and response size limits** in bytes, per device. Undocumented.
6. **Total storage quota** per device. Undocumented.
7. **Memory per device**, confirmed from the SDK device files. The figures here come from a 2022 Garmin blog post and a third-party table.
8. **The sign-in web view in practice**: whether it works for sideloaded and beta builds, which phone app hosts it on iOS and on Android, and whether a custom sign-in page that is not a standard OAuth provider is accepted.
9. **What happens to a recording when the app exits or crashes** before `save()`. Only forum reports exist.
10. **Store details**: review of updates, any regional listing requirements, and whether publishing a free app is free of charge.
11. **Whether software 29.05 on the owner's Forerunner 265 reports API level 5.2**, and its real memory figures. One run of a test app printing `System.getDeviceSettings().monkeyVersion` and `System.getSystemStats()` settles both.

## Sources

Garmin Connect IQ documentation, read on 2026-11-17:

- [JSON REST Requests](https://developer.garmin.com/connect-iq/core-topics/https/)
- [Authenticated Web Services](https://developer.garmin.com/connect-iq/core-topics/authenticated-web-services/)
- [Persisting Data](https://developer.garmin.com/connect-iq/core-topics/persisting-data/)
- [Activity Recording](https://developer.garmin.com/connect-iq/core-topics/activity-recording/)
- [Background Services](https://developer.garmin.com/connect-iq/core-topics/backgrounding/)
- [Downloading Content](https://developer.garmin.com/connect-iq/core-topics/downloading-content/)
- [Communicating with Mobile Apps](https://developer.garmin.com/connect-iq/core-topics/communicating-with-mobile-apps/)
- [Properties and App Settings](https://developer.garmin.com/connect-iq/core-topics/properties-and-app-settings/)
- [Manifest and Permissions](https://developer.garmin.com/connect-iq/core-topics/manifest-and-permissions/)
- [Input Handling](https://developer.garmin.com/connect-iq/core-topics/input-handling/)
- [Native Controls](https://developer.garmin.com/connect-iq/core-topics/native-controls/)
- [Sensors](https://developer.garmin.com/connect-iq/core-topics/sensors/)
- [Security](https://developer.garmin.com/connect-iq/core-topics/security/)
- [Beta Apps](https://developer.garmin.com/connect-iq/core-topics/beta-apps/)
- [Publishing to the Store](https://developer.garmin.com/connect-iq/core-topics/publishing-to-the-store/)
- [App Review Guidelines](https://developer.garmin.com/connect-iq/app-review-guidelines/)
- [App Types](https://developer.garmin.com/connect-iq/connect-iq-basics/app-types/)
- [Your First App](https://developer.garmin.com/connect-iq/connect-iq-basics/your-first-app/)
- [Compatible Devices](https://developer.garmin.com/connect-iq/compatible-devices/)
- [Device Reference](https://developer.garmin.com/connect-iq/device-reference/)
- [SDK download page with the Developer Agreement](https://developer.garmin.com/connect-iq/sdk/)
- FAQ: [REST services](https://developer.garmin.com/connect-iq/connect-iq-faq/how-do-i-use-rest-services/), [background service](https://developer.garmin.com/connect-iq/connect-iq-faq/how-do-i-create-a-connect-iq-background-service/), [audio content provider](https://developer.garmin.com/connect-iq/connect-iq-faq/how-do-i-create-an-audio-content-provider/)
- API reference: [Communications](https://developer.garmin.com/connect-iq/api-docs/Toybox/Communications.html), [Authentication](https://developer.garmin.com/connect-iq/api-docs/Toybox/Authentication.html), [Application.Storage](https://developer.garmin.com/connect-iq/api-docs/Toybox/Application/Storage.html), [ActivityRecording](https://developer.garmin.com/connect-iq/api-docs/Toybox/ActivityRecording.html), [Session](https://developer.garmin.com/connect-iq/api-docs/Toybox/ActivityRecording/Session.html), [FitContributor](https://developer.garmin.com/connect-iq/api-docs/Toybox/FitContributor.html), [Background](https://developer.garmin.com/connect-iq/api-docs/Toybox/Background.html), [ServiceDelegate](https://developer.garmin.com/connect-iq/api-docs/Toybox/System/ServiceDelegate.html), [DeviceSettings](https://developer.garmin.com/connect-iq/api-docs/Toybox/System/DeviceSettings.html), [System.Stats](https://developer.garmin.com/connect-iq/api-docs/Toybox/System/Stats.html), [Activity](https://developer.garmin.com/connect-iq/api-docs/Toybox/Activity.html), [Attention](https://developer.garmin.com/connect-iq/api-docs/Toybox/Attention.html)

Other Garmin sources:

- [The Real Devices of Connect IQ, part 1](https://forums.garmin.com/developer/connect-iq/b/news-announcements/posts/the-real-devices-of-connect-iq-part-1), developer blog (February 2022)
- [Forerunner 265 Series owner's manual, Wi-Fi Connectivity Features](https://www8.garmin.com/manuals/webhelp/GUID-F41EAFB3-6CC9-42DE-9C6C-9E358DBB0671/EN-US/GUID-7089BCD7-BBA9-4AB1-BE0C-3FA4A2FAE861.html)

Third-party, used only for claims marked unverified:

- [garmin-dev-tools](https://github.com/flocsy/garmin-dev-tools), per-device memory limits and API levels extracted from the SDK device files (CSV files last updated 2026-11-02)

Developer forum threads, used only for claims marked unverified:

- [HTTP request over device Wi-Fi specification](https://forums.garmin.com/developer/connect-iq/f/discussion/251935/http-request-over-device-wi-fi-specification)
- [Fenix 7 WiFi setup, makeWebRequest throws BLE_CONNECTION_UNAVAILABLE](https://forums.garmin.com/developer/connect-iq/f/discussion/431114/fenix-7-wifi-setup-makewebrequest-throws-ble_connection_unavailable)
- [LTE with new Fenix 8 Pro](https://forums.garmin.com/developer/connect-iq/f/discussion/421350/lte-with-new-fenix-8-pro/1972077)
- [Understanding -402 Response Limit for makeWebRequest?](https://forums.garmin.com/developer/connect-iq/f/discussion/414966/understanding--402-response-limit-for-makewebrequest)
- [Request for documentation and simulator accuracy on makeWebRequest limits](https://forums.garmin.com/developer/connect-iq/i/bug-reports/request-for-documentation-and-simulator-accuracy-on-makewebrequest-limits)
- [FitContributor custom field: how to visualize it in Garmin Connect?](https://forums.garmin.com/developer/connect-iq/f/discussion/6793/fitcontributor-custom-filed-how-to-visualize-it-in-garmin-connect)
- [Show individual exercises for strength training in Fit](https://forums.garmin.com/developer/connect-iq/f/discussion/193791/show-individual-exercises-for-strength-training-in-fit)
- [App terminated during an ActivityRecording session leaves the session orphaned](https://forums.garmin.com/developer/connect-iq/i/bug-reports/app-terminated-on-wrist-off-during-an-activityrecording-session-leaves-the-session-orphaned-activity-list-blocked-watch-needs-a-reboot)
- [Venu 4 reset when ending an ActivityRecording session](https://forums.garmin.com/developer/connect-iq/i/bug-reports/venu-4-fw-18-32-rtl-trap-full-watch-reset-when-ending-an-activityrecording-session-session-stop-session-save)
