# What the Garmin Connect Developer Program allows Gainscape

Research for issue #221. All sources were read on 2026-11-17.

## Verdict

Automatic Import is possible for every Gainscape user who has a Garmin account, on Garmin's free Starter access, with three conditions:

1. Garmin must approve the application. The form is written for companies and asks for a legal company name, a company website, a privacy policy and a business model. Garmin's FAQ says the program also supports individual developers, but no Garmin page says whether a solo developer with a non-commercial app and no registered company is approved. The only way to find out is to apply.
2. Starter access delivers activities from the moment a user links their account. It includes no historical data. History has to come from the file import, as the plan already assumes.
3. Starter access has a limited user capacity. Garmin's page does not give the number. Press reports say 1,000 connected users.

The cost in money is zero on Starter. The cost in work is a public privacy policy, a server endpoint that receives Garmin's pushes, the OAuth link and disconnect flows, Garmin attribution on every screen that shows imported data, and the legal duties listed under "Duties on the app". Above the Starter capacity the Enterprise tier is paid. Press reports give a 1,000 USD entry fee that counts toward a negotiated bill per monthly active user.

Most of the API detail (the push payload, rate limits, the evaluation and production steps) sits behind the Garmin Developer Portal login and could not be read. Those gaps are listed under "What I could not read".

## How the sources are graded

- **Primary**: Garmin's own public pages and documents. Claims marked this way were read in the source itself.
- **Press**: DC Rainmaker's article of 21 October 2026, which reports what Garmin told the author. It is well informed, but it is not a Garmin document.
- **Unverified**: third-party integration guides and forum posts. They are useful as hints and nothing more.

## The program since 21 October 2026

Garmin closed the program to new applicants in March 2026 and reopened it on 21 October 2026 with three access levels (press [P1]; a third-party post gives the same date [U2]; forum posts from applicants confirm the pause [U3]). The overview page lists them [G1]:

| Level                 | For whom                                                              | Activity data | Delivery          | Historical data | User capacity | Support    |
| --------------------- | --------------------------------------------------------------------- | ------------- | ----------------- | --------------- | ------------- | ---------- |
| Personal              | One person reading their own data with a self-made API key            | JSON and FIT  | Pull only         | not stated      | one person    | not stated |
| Starter (Business)    | "Organizations building apps with Garmin Connect API access"          | JSON and FIT  | Push only         | Not included    | Limited       | not listed |
| Enterprise (Business) | "Companies operating at scale"; commercial terms tailored per company | JSON and FIT  | Push or Ping/Pull | 1 month +       | Unlimited     | Included   |

Starter and Enterprise both include the Activity, Courses, Health, Training and Women's Health APIs. Enterprise adds a Golf API [G1].

## Who qualifies

**What Garmin says in public (primary).**

- The FAQ: "The Garmin Connect Developer Program supports a broad range of organizations, from individual developers and startups to companies operating at significant scale." [G2]
- The FAQ on Starter: "Developers can gain immediate access and launch with Garmin, with access to core data and tools." [G2]
- The application form opens with: "This application is intended for businesses, organizations and other commercial entities seeking access to the Garmin Connect Developer Program for integration into their application, products or services. If you are looking to access your own Garmin data for personal use, please use the Personal Garmin Connect API." It adds that the request "must be submitted by the organization that owns, operates, or distributes the application". [G3]
- The agreement allows a person as the licensee: it binds "you or, if you are entering into this Agreement on behalf of a corporation, governmental organization, or other legal entity, then the corporation". [G6, G7]

**What the form asks for (primary, [G3]).** Every field below is required:

- Company name (the tooltip says "legal company name"), company website URL, company privacy policy URL ("this is a legal requirement").
- Contact name ("Must have legal authority to represent your company"), job title, email address, country and region.
- The company's primary business service and the industry it serves, each chosen from a fixed list. "Fitness & Wellness" and "Personal Training & Coaching" are among the industries.
- An overview of the application, the user experience and how the APIs will be used.
- The business model for the products or services that use the API.
- Every contractor, hosting provider or other third party that will process or store Garmin data, including analytics and AI providers. For Gainscape this means the database host and the web host at least.
- Which APIs are wanted.
- Expected connected Garmin users within 12 months: "0-100", "100-1000" or "1000>".
- Whether the applicant has already been in contact with Garmin.

**Fees (primary).** The agreement says "no license fees or other payments will be due under this Agreement". Garmin "reserves the right to charge fees for future use of or access to the API", effective on 30 days' notice, and may charge for request volume above the documented limits (sections 10.1 and 10.2) [G6, G7].

**Fees (press, [P1]).** Personal and Starter are free. Starter covers up to 1,000 users. Enterprise has a 1,000 USD entry fee that is a credit toward a bill per monthly active connected user, and the rate is negotiated per company. Existing partners became Enterprise automatically, pay no entry fee, and start paying by 1 April 2027.

**How approval works.**

- Primary: after approval the applicant gets access to the Garmin Developer Portal, where "all detailed technical information and documentation" lives. "A typical integration takes between 1 and 4 weeks." [G2]
- Primary: Garmin may require the application to be submitted for review before it is published, may decline it "in its sole discretion", and may suspend a key at any time (section 4.2) [G6, G7].
- Press: approvals for Starter "should be virtually instant". The author words this as what "it sounds like" [P1].
- Unverified: a third-party guide advises applying as a company, from a company-domain email address, and says Garmin rejects free mail addresses and generic inboxes [U1]. That guide may describe the process before the October 2026 change.

**Evaluation against production access.**

- Primary: the Health API page says "After approval, you will have access to an evaluation environment". The Activity API page lists "auto-verification of your integration before production" among the developer tools [G4, G5].
- Not readable: what separates an evaluation key from a production key, what the verification checks, and whether the Starter level still has this two-step path.
- Unverified: a third-party guide describes creating an app of the type "Connect Developer - Evaluation" first, passing a partner verification, and receiving production credentials only after Garmin approves the evaluation app. The same guide gives the Starter capacity as up to 1,000 connected users. [U1]

**What this means for Gainscape.** A solo developer is not excluded by any text. A non-commercial app with no company behind it does not fit the form: it has no legal company name and no business model to describe. The honest way through is to apply as an individual, say plainly that the app is free and has no revenue, and see what Garmin answers. Gainscape needs a public privacy policy before applying.

## The Activity API

**What Garmin says in public (primary, [G4]).**

- "The Activity API provides access to the detailed fitness data captured during an activity on the user's wearable device or cycling computer." Strength training is one of the listed activity kinds.
- "The Activity API offers access to JSON summaries or FIT files."
- "Activity data files (.FIT, GPX, .TCX formats) available for complete activity details."
- "After initial consent, end-users sync their device with Garmin Connect to upload device data, at which point it is accessible via the API."
- Backfill of user data and multi-project support are marked "Supported with Enterprise Access only".

**How a new activity reaches a third party.** On Starter access delivery is "Push only": Garmin sends the data to a server endpoint the app registers. Ping/Pull, where Garmin sends a notification and the app then fetches the data, is an Enterprise option [G1]. Push and ping notifications carry Garmin's user ID, so the app can match the data to its own user [G8].

**What the summary holds.** Not readable. The field list of the activity summary is in the portal documentation. Two hints:

- Garmin's public Personal API specification [G11] describes Garmin's own activity summary. It has `totalSets`, `activeSets`, `totalReps` and a `summarizedExerciseSets` list, where each entry has a category, a sub-category, reps, sets, volume, maximum weight in grams and duration. That entry is a total per exercise, not one row per set. This is a different API from the partner Activity API, so it only shows what Garmin stores, not what the Activity API sends.
- The FIT file is the place to look for each set. Issue #222 covers the file's content.

**Whether the original FIT file can be downloaded.** Yes, according to Garmin's public pages: Starter includes "Activity API: JSON & .FIT" [G1, G4]. How the file is fetched under push delivery, and how long a download link stays valid, is not readable. One press remark says the FIT file from the API may lack some data that Garmin treats as proprietary and that a manual export from the device still has [P1]. The author words this as hearsay. It matters for Import and should be tested with a real strength activity.

**How far back a backfill reaches.**

- Primary: Starter: "Historical Data: Not included". Enterprise: "1 month +" [G1].
- Unverified: a third-party guide says a backfill returns about the last month, that each data type can usually be backfilled once, and that the user must switch on the historical data permission on the consent screen, where it is off by default [U1].
- Unverified: a forum post from 2025 reports that the older pull endpoints returned only about 18 days of data [U4]. A Garmin employee answered only that the forum is the wrong place for API questions.

For Gainscape: on Starter access there is no backfill at all. History through the file import is the only route.

## How a user links a Garmin account

Garmin publishes its OAuth specification as a PDF on the developer portal site without a login [G8]. Everything in this section is primary unless marked.

**The flow.** OAuth 2.0 with PKCE. "All APIs in the Developer Program use OAUTH 2.0." [G2]

1. The app creates a code verifier (43 to 128 characters) and its SHA-256 challenge, and sends the user to `https://connect.garmin.com/oauth2Confirm` with `response_type=code`, `client_id`, `code_challenge`, `code_challenge_method=S256`, and optionally `redirect_uri` and `state`.
2. The user logs in to Garmin Connect and chooses which permissions to grant. "Users can control what permissions are granted."
3. Garmin redirects back with a `code`. The app exchanges it at the token endpoint with `grant_type=authorization_code`, `client_id`, `client_secret`, `code` and `code_verifier`.
4. The app fetches the user's Garmin API user ID (`GET https://apis.garmin.com/wellness-api/rest/user/id`) and the permissions the user granted (`GET https://apis.garmin.com/wellness-api/rest/user/permissions`).

The exchange needs the client secret and "CORS pre-flight requests (OPTIONS) are not supported", so it must run on the server (an Edge Function), never in the browser.

Two copies of the PDF are public. The June 2025 copy gives the token endpoint as `https://connectapi.garmin.com/di-oauth2-service/oauth/token`, the July 2025 copy as `https://diauth.garmin.com/di-oauth2-service/oauth/token` [G8, G9]. Use the one the portal gives at integration time.

**Permissions.** The scope string is fixed and cannot be changed by the app. Which API sections the app uses is set when the app is created in the portal. The user grants permissions one by one, for example `ACTIVITY_EXPORT`, `WORKOUT_IMPORT`, `HEALTH_EXPORT`, `COURSE_IMPORT` and `MCT_EXPORT`. A user may grant fewer than the app asked for, so the app must read the granted list after linking. Later changes are announced "via the User_Permission webhook".

**Token lifetime and refresh.**

- The example token response has `expires_in: 86400`, so an access token lasts 24 hours.
- The same response has `refresh_token_expires_in: 7775998`, about 90 days.
- A refresh (`grant_type=refresh_token` with the client ID and secret) returns a new access token and a new refresh token every time. Store the newest one.
- Garmin recommends subtracting 600 seconds or more from the expiry to leave room for network trouble.
- The prose in the PDF says "Access tokens expire three months after they are created". That contradicts the 24 hours in its own example. The reading that fits both is that the refresh token is the one that lasts three months. This should be checked against a real token.

For Gainscape this means a server job must refresh each linked user's token at least once every 90 days, or the user has to link again. Whether push delivery itself needs a valid user token is not readable.

**User ID.** Each Garmin Connect user has one API user ID that stays the same when the user disconnects and links again, and across several apps of the same partner.

**When the user removes the permission in Garmin Connect.**

- Primary: the PDF confirms that a user can delete "their association through Garmin Connect", which it calls "the normal Garmin Connect consent removal process", and that linking again gives the same user ID.
- Primary: when the app offers its own "Disconnect" or "Delete My Account", it must call `DELETE https://apis.garmin.com/wellness-api/rest/user/registration`. Garmin says this endpoint "must be called" in "any other case where the user would reasonably believe the partner program is allowing them to remove their consent to share Garmin data".
- Not readable: what Garmin sends the app when the user removes the permission on Garmin's side. The public PDF names only the User_Permission webhook for changes after consent. A search result pointed to a third-party page that describes a separate deregistration notification, but that page could not be opened, so this stays unconfirmed.

## Duties on the app

The agreement is the source for this section. Two public copies exist, and neither is certain to be the text a new applicant accepts today (see "What I could not read"). Section numbers refer to the 2026 copy [G6]. Each duty below is also in the 2023 copy [G7] unless marked "2026 copy only".

**Rate limits.** Not readable as numbers. The agreement forbids use "that exceeds reasonable request volume, constitutes excessive or abusive usage" as judged by Garmin (section 5.2), and lets Garmin charge for volume above the limits in its documentation (section 10.2). Under push delivery the app makes few calls of its own, so this is unlikely to bite.

**Data use, retention and deletion.**

- Data from the API may be used "solely for internal business purposes", only to format and display it in the app, and only "as allowed by law and in compliance with each End User's consent" (section 4.1).
- Before collecting data the app must show a privacy policy, confirm the user's consent, and "provide the End User with the ability to easily withdraw such consent" (section 15.4).
- The app must answer user requests "to access, rectify, erase, object to, restrict the Processing of, or export" their data, as the law requires (section 15.4). For Gainscape's users in the EU this is the GDPR.
- No selling of user data without the user's lawful consent (section 15.5).
- The app must not ask for the user's Garmin password or build its own authorization around Garmin's (section 15.8).
- The agreement sets no fixed retention period, and neither copy says that imported activities must be deleted when the user disconnects. It ties processing to the user's consent, so the safe reading is: when the user disconnects, stop importing, and delete the Garmin data when the user asks. Whether the portal documentation adds a stricter rule is not readable.
- If user data is processed by or used to train AI systems, the privacy policy needs an "AI Transparency Statement" (section 15.10, 2026 copy only).
- Garmin may ask for information to check compliance (section 15.7).

**Security.** Keep a security program at industry level, and notify Garmin by email and by phone within 24 hours of finding a weakness that threatens Garmin's systems or data, and within 24 hours of any confirmed breach (section 5.1).

**Towards users.** Monitor the app for abuse and restrict offending users, give users a way to report abuse, and have a written agreement with each user that protects Garmin at least as much as the program agreement does (section 5.3). In practice that is a terms of service page. Gainscape is "solely responsible" for user support (section 3.2).

**Branding.**

- The app "must include the Garmin Brand Features" where it tells users they can fetch their data from Garmin Connect (section 6.1), and must follow the brand guidelines (section 6.2).
- Garmin's API Brand Guidelines require a "Garmin [device model]" attribution on every view that shows Garmin data: next to the title on main views, visible in detail views, on every exported page or image, and as a named source where Garmin data is combined with other data. If the device model is unknown, name Garmin as the source. Never hide the attribution in a tooltip or a footnote. [G10]
- Section 6.4 makes this attribution a contract duty. Garmin gives 14 days to fix a breach, may then cut the data, and after 14 more days may suspend access (section 6.5). The app must give Garmin 30 days' written notice before it introduces a new way of displaying Garmin data, with mockups (section 6.6). Sections 6.4 to 6.6 are in the 2026 copy only.
- For Gainscape: a workout that came from Garmin needs a visible "Garmin [device model]" label in the workout view, the history list and the friends feed.

**Other limits that matter.**

- No income from the API without Garmin's written permission (section 5.2). A free app is unaffected.
- No passing of the key, the API or the user data to third-party services Garmin has not approved in writing (section 5.2).
- No use of the API "to compete with Garmin", and no advertising of products that compete with Garmin's (section 5.2). A strength logger overlaps with Garmin Connect's own strength features. Garmin decides what competing means.
- The agreement's terms, the API and "any related information provided to Licensee by Garmin" are Garmin's confidential information (section 8.1). The Gainscape repository is public. Code that talks to the API is normal in open-source projects, but portal documentation must not be copied into the repository or into issues.
- No press releases or public statements about Garmin or the agreement without written approval (section 8.4).
- Garmin may show the app's name and logo as a partner (section 7.1).

**Production review and termination.** Garmin may require a review before the app is published (section 4.2). Garmin may end the agreement with 30 days' notice for any reason, and it ends at once if the licensee breaks a term (sections 9.2 and 9.4). Garmin may change the agreement, and continued use counts as acceptance (section 16). Import must therefore be a feature Gainscape can lose without breaking.

## The Personal API is not a route for Gainscape's users

Since October 2026 any Garmin user can create a Personal API key in Garmin Connect in a few seconds and read their own activities, including the original activity file as a ZIP (`GET /download-service/files/activity/{activityId}`) [G11, G12, G13]. It is tempting to let each Gainscape user paste such a key. The public facts speak against it:

- Garmin's FAQ: the Personal API "is not intended for commercial applications serving multiple end users". The Developer Program "is designed for organizations building integrations for multiple users". [G12]
- The key expires after 30, 90, 180 or 365 days at the user's choice, and there are no refresh tokens. Access tokens last 24 hours. Every user would have to paste a new secret at least once a year. [G12]
- Delivery is pull only, so Gainscape would have to poll for every user. [G1]
- The user accepts terms and conditions when creating the key. Those terms are shown only inside Garmin Connect and could not be read. They may forbid handing the key to another service.

The Personal API is useful for one thing: the developer can use their own key to read real strength activities and files while building the importer, before or without program approval.

## What it costs to get there

| Item                                                     | Cost                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Starter access                                           | Free (press); the agreement names no fee (primary)                                                  |
| Application                                              | A filled form, a public privacy policy, a public website, a list of data processors                 |
| Waiting for approval                                     | Unknown. "Immediate" in Garmin's FAQ, "virtually instant" in the press                              |
| Integration work                                         | Garmin says 1 to 4 weeks is typical                                                                 |
| Server side                                              | A push endpoint, the OAuth exchange and token refresh, the disconnect call                          |
| App side                                                 | Link and disconnect screens, Garmin attribution on imported workouts, a terms of service page       |
| More than the Starter capacity (reported as 1,000 users) | Enterprise: reported 1,000 USD entry fee credited against a negotiated monthly bill per active user |
| History before linking                                   | Not available on Starter; the file import covers it                                                 |
| Ongoing risk                                             | Garmin can add fees or end access with 30 days' notice                                              |

## What I could not read

- **The Garmin Developer Portal** (`developerportal.garmin.com` behind login, `apis.garmin.com/tools`). This holds the Activity API specification: the push payload, the summary fields, how the FIT file is fetched, backfill rules, rate limit numbers, the deregistration notification, and the evaluation and production steps.
- **The agreement a new applicant accepts today.** Two copies are public. One names Garmin International, Inc. and dates from October 2023 [G7]. The other dates from March 2026, names Garmin China Shanghai RHQ Co., Ltd., and adds China-specific clauses next to the attribution and AI clauses [G6]. Both carry the same form number and revision. Garmin changed the program in October 2026, so the current text for a European applicant may differ from both, in particular on fees and tiers.
- **The Personal API terms and conditions.** Shown only when a logged-in user creates a key.
- **Garmin's own announcement of the October 2026 change.** I found none. The fee figures and the 1,000-user limit rest on the press article [P1] alone.

## Open unknowns

1. Does Garmin approve a solo developer with a free, non-commercial app and no registered company? Only an application answers this.
2. What is the Starter user capacity, in Garmin's own words, and what happens when it is reached?
3. Does the Activity API push for a strength activity carry each set (exercise, reps, weight), or only totals, so that the FIT file must be parsed?
4. Is the FIT file from the API the same as the one exported by hand, or is data stripped from it?
5. What does Garmin send when a user removes the permission in Garmin Connect, and must stored activities then be deleted?
6. What are the rate limits, and does a separate production review still exist for Starter access?
7. Does the current agreement differ from the two public copies?
8. Does Garmin see a strength logger with its own watch logging as competing with Garmin Connect?

## Sources

Primary, Garmin:

- [G1] Program overview and tier table: https://developer.garmin.com/gc-developer-program/overview/
- [G2] Program FAQ: https://developer.garmin.com/gc-developer-program/enterprise/program-faq/
- [G3] Starter access request form (field labels read from the page data): https://www.garmin.com/en-US/forms/StarterGarminConnectDeveloperAccess/
- [G4] Activity API page: https://developer.garmin.com/gc-developer-program/enterprise/activity-api/
- [G5] Health API page: https://developer.garmin.com/gc-developer-program/enterprise/health-api/
- [G6] Garmin Connect Developer Program Agreement, FRM-0952 Rev. B, 19 pages, file dated 3 March 2026, Garmin China Shanghai RHQ Co., Ltd.: https://www8.garmin.com/en-US/GARMINCONNECTDEVELOPERPROGRAMAGREEMENT/GARMINCONNECTDEVELOPERPROGRAMAGREEMENT_EN.pdf
- [G7] Garmin Connect Developer Program Agreement, FRM-0952 Rev. B, 14 pages, file dated 4 October 2023, Garmin International, Inc.: https://developerportal.garmin.com/sites/default/files/Garmin%20Connect%20Developer%20Program%20Agreement.pdf
- [G8] OAuth2.0 PKCE Specification, file dated 11 June 2025: https://developerportal.garmin.com/sites/default/files/OAuth2PKCE.pdf
- [G9] OAuth2.0 PKCE Specification, file dated 23 July 2025: https://developerportal.garmin.com/sites/default/files/OAuth2PKCE_1.pdf
- [G10] Garmin Developer API Brand Guidelines, version 6.30.2025: https://developer.garmin.com/downloads/brand/Garmin-Developer-API-Brand-Guidelines.pdf
- [G11] Personal API Swagger documentation (OpenAPI 3.0.1, "Garmin Connect Personal API" 1.0.0): https://developer.garmin.com/gc-developer-program/personal/swagger-docs/
- [G12] Personal API FAQ: https://developer.garmin.com/gc-developer-program/personal/personal-faq/
- [G13] Personal API setup page: https://developer.garmin.com/gc-developer-program/personal/personal-api/

Press:

- [P1] DC Rainmaker, "Garmin Revamps and Opens Up Connect Developer API Program: All the Details", 21 October 2026: https://www.dcrainmaker.com/2026/10/garmin-connect-api-revamps-connect-developer.html

Unverified, third party:

- [U1] Open Wearables, Garmin API integration guide: https://openwearables.io/docs/providers/garmin-api-integration.md
- [U2] Open Wearables, "Garmin Connect Developer Program reopened: what changes": https://openwearables.io/blog/garmin-connect-developer-program-reopened
- [U3] Garmin developer forum, "Developer onboarding blocked" (posts by applicants, no Garmin answer): https://forums.garmin.com/developer/fit-sdk/f/discussion/435484/developer-onboarding-blocked
- [U4] Garmin developer forum, "Data Retention Period for Wellness API": https://forums.garmin.com/developer/connect-iq/f/showcase/409293/data-retention-period-for-wellness-api
