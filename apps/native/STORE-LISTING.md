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

Draft 2026-10-25 (#245), for the club to review before submission. Limits
are App Store Connect's (name 30, subtitle 30, promotional text 170,
keywords 100 bytes, description 4000) and Play's (title 30, short
description 80, full description 4000). Recount after
editing.

### Shared fields

| Field | Value |
|---|---|
| Name / Play title | HB Dragons |
| Category | Sports (Play: Sport) |
| Copyright | 2026 Hanover Basketball Dragons e.V. |
| Support URL | https://hbdragons.de/impressum |
| Privacy policy URL | https://hbdragons.de/datenschutz |
| Marketing URL | https://hbdragons.de |
| Account deletion URL (Play) | https://hbdragons.de/konto-loeschen/ |
| Contact mail | app@hbdragons.de |

### Deutsch (primary)

**Untertitel (App Store):** Spielplan, Tabellen, Teams

**Werbetext (App Store):**
Alle Spiele, Ergebnisse und Tabellen der Hanover Basketball Dragons an
einem Ort – mit Mitteilungen, wenn sich ein Spiel verschiebt.

**Kurzbeschreibung (Play):**
Spielplan, Ergebnisse und Tabellen der Hanover Basketball Dragons.

**Schlüsselwörter (App Store):**
Basketball,Hannover,Spielplan,Tabelle,Ergebnisse,Verein,Schiedsrichter,Jugend,Liga,DBB

**Beschreibung:**

Die offizielle App der Hanover Basketball Dragons e.V.

Für Fans, Eltern und Spieler – ohne Anmeldung:
• Spielplan aller Dragons-Teams mit Halle, Datum und Uhrzeit
• Ergebnisse, sobald der Verband sie meldet
• Tabellen aller Ligen, in denen unsere Teams spielen
• Teamseiten und der direkte Vergleich mit dem nächsten Gegner

Für Mitglieder mit Vereinskonto:
• „Heute“: die Spiele und Aufgaben des Tages auf einen Blick
• Schiedsrichter-Einsätze ansehen, übernehmen und abgeben
• Aufgaben-Boards für Vorstand und Trainer
• KI-Assistent für Fragen zu Spielplan und Verein (nur für Mitglieder,
  beantwortet von Google Gemini – die App weist beim ersten Öffnen darauf
  hin)
• Mitteilungen bei Spielverlegungen, neuen Einsätzen und fälligen
  Aufgaben
• Optional mit Face ID entsperren

Die Spieldaten stammen aus dem Spielbetrieb des Deutschen
Basketball-Bunds. Vereinskonten werden vom Verein vergeben; eine
Registrierung in der App gibt es nicht.

Fragen und Feedback: app@hbdragons.de

### English

**Subtitle (App Store):** Schedule, standings, teams

**Promotional text (App Store):**
Every game, result and league table of the Hanover Basketball Dragons in
one place, with a notification when a game is moved.

**Short description (Play):**
Schedule, results and standings of the Hanover Basketball Dragons.

**Keywords (App Store):**
basketball,Hanover,Hannover,schedule,standings,results,club,referee,youth,league

**Description:**

The official app of Hanover Basketball Dragons e.V.

For fans, parents and players, no sign-in needed:
• Schedule for every Dragons team with venue, date and tip-off time
• Results as soon as the federation reports them
• Standings for every league our teams play in
• Team pages and head-to-head records against the next opponent

For members with a club account:
• "Today": the day's games and tasks at a glance
• View, take on and hand back referee assignments
• Task boards for the board and coaches
• AI assistant for questions about the schedule and the club (members
  only, answered by Google Gemini; the app says so on first use)
• Notifications for rescheduled games, new assignments and due tasks
• Optional Face ID unlock

Game data comes from the German Basketball Federation (DBB). Club
accounts are issued by the club; there is no sign-up in the app.

Questions and feedback: app@hbdragons.de
