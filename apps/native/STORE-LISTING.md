# Store listing and review notes

Everything App Store Connect and Google Play ask for in text form, kept in
the repo so the next submission does not start from memory. The copy and
screenshot sections are filled by #245; the review notes below ship with
the first submission (#250).

## Review notes (paste into "Notes" in App Store Connect / Play)

Accounts in this app are created by club administrators; there is no
sign-up and no in-app password reset. The demo accounts below cover every
role. Fans (signed out) see the public schedule, standings and teams.
Signed-in Staff additionally see Today, the board tools and the
"KI-Assistent", a members-only Q&A over club data powered by Google
Gemini (a first-use notice explains this in-app); users with
referee-assignment duties see an Officiating tab in place of Standings.
Face ID lock is optional and off by default. Account deletion: Profile →
Rechtliches → "Konto löschen beantragen" opens a prefilled mail to
datenschutz@hbdragons.de; the club deletes the account within 30 days
(https://hbdragons.de/konto-loeschen/). Universal links are claimed for
https://app.hbdragons.de. Push notifications are operational only
(schedule changes, referee assignments, task reminders) and are explained
before the system prompt.

Demo accounts (production API): filled in by #250 before submission.

## Privacy label (App Store Connect) / Data safety (Play)

Both forms must match `ios.privacyManifests.NSPrivacyCollectedDataTypes`
in `app.json` and § 11 of the Datenschutzerklärung. Since #238 the app
collects one category:

- **Diagnostics → Crash Data** and **Diagnostics → Other Diagnostic
  Data** — crash and error reports sent to the club's GlitchTip project.
  Purpose **App Functionality**; **not** linked to the user's identity;
  **not** used for tracking. The SDK runs with `sendDefaultPii: false`,
  so no name, mail address or account id is attached.

Everything else the app sends (account data, push tokens, assistant
prompts) goes to the club's own backend and is covered by the
"Contact Info"/"User Content" answers, not by Diagnostics.

## Listing copy

Filled by #245.
