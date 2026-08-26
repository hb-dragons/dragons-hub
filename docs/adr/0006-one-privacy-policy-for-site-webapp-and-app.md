---
status: accepted
---

# One Datenschutzerklärung covers the site, the Web-App and the Dragons App

The club runs three front doors — the static site on hbdragons.de, the Web-App on
app.hbdragons.de and the Dragons App — but one set of accounts, one API, one database, one
chatbot and one hosting arrangement behind all of them. The app stores and DSK OH Apps ch. 5.2.4
require the app's own data flows to be described, which the old website-only policy did not do
(it still named IONOS and Strapi, both retired).

Decision: a single document at `/datenschutz/`, with the app-specific processing in a section at
the stable anchor `#app`. The app's Rechtliches entry and both store records link to
`https://hbdragons.de/datenschutz/#app`. The shared parts — hosting, recipients, third-country
transfers, retention, rights — are written once and declared to apply to all three.

Considered and rejected: a second page at `/datenschutz/app/`. It would have duplicated the
hosting, recipient, transfer and rights blocks, and those are exactly the blocks that change when
infrastructure changes — two copies means one goes stale.

The legal bases chosen, where more than one was arguable:

- **Probetraining — Art. 6(1)(b), not (1)(a).** The form's checkbox is a *Kenntnisnahme* of this
  policy, not a consent: the processing is necessary to answer the request, so basing it on
  consent would add a withdrawal duty and a proof obligation for nothing.
- **Names and photos of Vorstand, Trainer and Schiedsrichter — Art. 6(1)(f), not (1)(a).** The
  club holds no signed consent per pictured person. The listing is function-related and the page
  states the Art. 21 objection route explicitly.
- **Accounts — Art. 6(1)(b) via the Mitgliedschaft plus (1)(f).** Accounts are club-created; there
  is no self-registration to consent to.
- **Expo — Standardvertragsklauseln (Modul 2) per its ToS § 3.2, not "AV-Vertrag".** Expo
  publishes no standalone DPA document, so claiming one would be a claim the club cannot produce
  on request.

Consequences:

- The `#app` anchor is load-bearing outside this repo (two store records and the app's Rechtliches
  entry). `legal-citations.test.ts` fails if it disappears; renumbering the section around it is
  fine, removing it is not.
- The page's "6 Monate" claim for Probetraining requests needs the prune job that enforces it
  (#273) to be live before the cutover — a retention promise nothing implements is worse than no
  promise.
- Two statements now exist in two places and are checked against each other: the 30-day deletion
  window and the `datenschutz@hbdragons.de` address, shared with `/konto-loeschen/`.
- The Gemini wording ("keine Nutzung zu Trainingszwecken") holds only on Paid Services. If billing
  on the project behind `GOOGLE_GENERATIVE_AI_API_KEY` is ever switched off, the sentence becomes
  false and the chatbot has a bigger problem than its policy text.
