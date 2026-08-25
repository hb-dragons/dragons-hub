# App Store release readiness — native app (audit 2026-08-25)

What still stands between `apps/native` and a public App Store (and Play
Store) release: technical, store-metadata, legal and administrative items,
each verified against the code or a primary source on 2026-08-25.

**How this was produced.** Four parallel investigations: (1) a code audit of
`apps/native` at `main` @ `5cdc024d` plus the uncommitted `appleTeamId` line
in `app.json`, running every native quality gate; (2) Apple's App Review
Guidelines, App Store Connect Help and Expo/EAS docs; (3) German/EU statutes
and regulator guidance (gesetze-im-internet.de, DSK, LfD Niedersachsen,
BayLDA; EU texts via full-text mirrors because eur-lex answered with a WAF
challenge) plus the vendors' own terms; (4) Apple Developer Program, App Store
Connect, Expo account and Google Play Console rules. Live EAS state was read
with `eas whoami` / `build:list` / `channel:list` / `update:list`.
`eas credentials` and `apps/native/.env` were not read (blocked by the local
safety net) — credential state is on the manual-check list. Anything a
primary source could not confirm is marked **UNVERIFIED**.

Note: the local `main` is 20 commits behind `origin/main`
(tip `c15946a7`, team-entries work); `git diff --stat HEAD..origin/main --
apps/native` is empty, so every native finding holds for origin too.

Supersedes nothing — `apps/native/PRE-LAUNCH.md` stays the working checklist;
§6 lists the corrections it needs.

---

## Verdict

**Not submittable today.** None of the open items is large engineering; the
long poles are administrative — who owns the Apple team and the bundle id,
the club's D-U-N-S number, and a Datenschutzerklärung that covers the app.
Rough sizing: code items 1–2 developer-weeks; admin and legal 3–6 weeks of
lead time, mostly waiting, and they run in parallel with the code work.

Blockers, in dependency order:

| # | Blocker | Why it blocks | Owner |
|---|---------|---------------|-------|
| B1 | `expo-doctor` fails on 8 outdated packages (`expo` 57.0.12 → ~57.0.16, `expo-router`, `expo-updates`, `expo-notifications`, `expo-constants`, `expo-image`, `expo-linking`, `expo-splash-screen`) | EAS runs doctor inside the build and fails the build on non-zero exit; CI's `native-doctor` job goes red on its next run (last green 2026-08-13). Fix: `npx expo install --check` in `apps/native`, commit the lockfile. | dev |
| B2 | Bundle id `de.hbdragons.app` is locked to Apple team `2ZDTV3KLV2` (two TestFlight builds were uploaded in April 2026), the EAS project is on the personal account `eshamounskerto`, and the app has no released version — so Apple's app-transfer path is closed | Whoever this team belongs to is the App Store "seller" for v1.0, holds the push key, and is the DSA declarant. Decide §4.2 before creating the App Store Connect record. | Vorstand + dev |
| B3 | No privacy policy covers the app, and the app has no Impressum / Datenschutz / support link anywhere (`grep openURL\|mailto apps/native/src` → 0) | Apple 5.1.1(i) requires the link in metadata **and** in-app; § 5 DDG / § 18 MStV require the Impressum reachable from the app; Art. 13 DSGVO requires app-specific information. Google Play's Data safety form also needs the URL. | Vorstand (text) + dev (link) |
| B4 | Current code has never been built: newest EAS build is iOS `preview` 1.0.0 (4) from 2026-08-10 on **SDK 55**; zero Android builds; zero OTA updates; no `production` channel; APNs/FCM credential state unknown | The SDK 57 binary with the associated-domains entitlement, the layered icon and the #226 patch does not exist yet. | dev |
| B5 | App Store Connect record incomplete: EU DSA trader status, age rating (full 2026 questionnaire incl. social-media questions), privacy label, 6.9" iPhone + 13" iPad screenshots, support URL, demo accounts per role | Each is a hard field or a Guideline 2.1 rejection. | dev + Vorstand |

Required before launch but not a hard gate: `ios.privacyManifests`,
`expo.locales`, in-app account-deletion request, chatbot AI disclosure
(AI Act Art. 50(1) applies since 2026-08-02), Gemini on the paid tier with
Google's processor DPA, crash reporting, AASA/assetlinks hosting.

---

## Critical path

| Track | Steps | Lead time | Depends on |
|-------|-------|-----------|------------|
| A — Accounts (Vorstand) | D-U-N-S lookup/request for "Hanover Basketball Dragons e.V." (§7 Q2) → ask Apple Developer Support to convert the personal membership into the club's organization membership (§4.2 option 1; fee-waiver request at the same time) → Expo organization + project transfer → Google Play org account (Android is in scope, §7 Q6) | D-U-N-S ≤ 5 business days + 2 for Apple (Google says up to 30 days); Apple conversion/enrollment has no published SLA — budget 2–3 weeks | nothing; start first |
| B — Legal texts (Vorstand / Datenschutz) | app Datenschutzerklärung → Impressum fixes → processor archive (Google Cloud DPA, Google processor DPA for Gemini, Expo ToS § 3.2) → Verzeichnis entries → DSB headcount note | 1–2 weeks writing | §3 content list |
| C — Code (dev) | B1 doctor fix → `privacyManifests`, `locales`, legal links + support entry, deletion request, AI notice, push pre-prompt → AASA + assetlinks on `app.hbdragons.de` → crash reporter → tests | 1–2 weeks | B for the URLs; A for the Team ID in the AASA |
| D — Store assets (dev + club) | name/subtitle/description/keywords de+en, screenshots (6.9" iPhone, 13" iPad), category, copyright, support URL | days | C for real screens |
| E — Release | `eas build --profile production` → internal TestFlight (no review) → ITMS-91053 check → ASC record + forms → submit → plan one rejection round | build 20 min; 90 % of reviews < 24 h | A–D |

---

## 1. Technical

### 1.1 Build configuration — status against `app.json` / `eas.json`

| Item | Status | Evidence / action |
|------|--------|-------------------|
| Toolchain: Apple requires Xcode 26 / iOS 26 SDK for uploads since 2026-04-28 | OK | EAS default image for SDK 57 is `macos-tahoe-26.5-xcode-26.6` (`eas.json` sets no `image`). Sources: developer.apple.com/news/?id=ueeok6yw, docs.expo.dev/build-reference/infrastructure/ |
| Icon: `ios.icon: ./assets/dragons.icon` (Icon Composer bundle) | OK | Supported by Expo SDK 54+; Xcode renders the 1024 px store icon and pre-iOS-26 fallbacks from it. `assets/icon.png` (1024²) stays as the Android/fallback icon. |
| `ios.privacyManifests` | **missing — required** | SDK 57's prebuild template ships no app-level `PrivacyInfo.xcprivacy`, and Expo documents that Apple mis-parses manifests inside static pods. Add: UserDefaults `CA92.1`, FileTimestamp `C617.1`, SystemBootTime `35F9.1` (union of the manifests shipped by react-native, expo-constants/-localization/-notifications/-device, async-storage — verified in `node_modules`); `NSPrivacyTracking: false`. Then read the ITMS-91053 mail after the first upload. Sources: developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api, docs.expo.dev/guides/apple-privacy/ |
| `expo.locales` / `CFBundleLocalizations` | **missing — required** | Runtime is de + en (`src/lib/i18n.ts`, default `de`) but the binary declares only the `en` development region, so iOS Settings and the store treat it as English-only and the Face ID prompt is never German. Add `locales: { de, en }` with a translated `NSFaceIDUsageDescription`, plus `ios.infoPlist.CFBundleAllowMixedLocalizations: true`. |
| `ITSAppUsesNonExemptEncryption: false` | OK | HTTPS + Keychain + OS Face ID only; no French declaration needed. Source: developer.apple.com/documentation/security/complying-with-encryption-export-regulations |
| Usage descriptions | OK | Only Face ID is used; no camera/mic/photos/location/contacts/local-network code or plugins. iOS notifications need no Info.plist string. |
| Push (`expo-notifications`) | code OK; credentials **unverified** | Registration runs only after sign-in (`src/hooks/usePushRegistration.ts:34-38`) — contextual, good for review. Server sends via Expo's push service (`apps/api/src/services/notifications/expo-push.client.ts:27`), so the APNs `.p8` lives in EAS: run `eas credentials -p ios` on the final Apple team (2-key limit per team). Android: no `google-services.json`, no FCM V1 key uploaded → Android push is not wired. |
| Universal links | entitlement OK; **AASA missing** | `applinks:app.hbdragons.de` is in `app.json`; nothing serves `/.well-known/apple-app-site-association` (`apps/web/public`, routes, `next.config.ts`, `infra/` all empty). `app.hbdragons.de` is the Next.js web service → put the file in `apps/web/public/.well-known/` with a `headers()` rule for `application/json`, no redirect, `appIDs: ["<TEAMID>.de.hbdragons.app"]`. Same for Android `assetlinks.json` (`autoVerify: true` is already declared and will silently fail) — its SHA-256 must be Play's **app signing key**, not the upload key. |
| iPad | acceptable; test it | `supportsTablet: true` + `orientation: portrait` → portrait-only iPad. No Apple rule rejects that, but `UIRequiresFullScreen` is deprecated in iPadOS 26 and the system resizes scenes anyway; Expo already writes it `false`. Test windowed / Split View on an iPad before submitting; 13" iPad screenshots are mandatory. Alternative: `supportsTablet: false` removes all iPad obligations. Source: developer.apple.com/documentation/technotes/tn3192 |
| `runtimeVersion.policy: appVersion`, `version: 1.0.0` | OK | App Store Connect already consumed 1.0.0 builds 1 and 2; EAS's remote counter is at 4 (`eas build:list`). Confirm `autoIncrement` yields ≥ 5, or `eas build:version:set`. |
| `eas.json` `submit.production.ios: {}` | fill in | Add `appleTeamId`, `language: "de-DE"`, `companyName` (legal name), and `ascAppId` once the record exists; store the ASC API key with `eas credentials`. |
| `appleTeamId` line | **uncommitted** | `git diff apps/native/app.json`. Commit or drop deliberately — it must match the team decided in §4.2. |
| `owner: eshamounskerto` | personal account | §4.4. |
| Android monochrome icon layer | optional | Android 16 QPR2 auto-themes icons without one. |
| Local `apps/native/ios/` | stale prebuild (2026-08-12) | Gitignored, ignored by EAS, but `expo run:ios` would use it. `rm -rf apps/native/ios apps/native/android` before any local native build. |
| `#226` expo-modules-jsi patch | reaches EAS | ~~`pnpm-workspace.yaml` `patchedDependencies` → `patches/expo-modules-jsi@57.0.4.patch` is tracked; EAS runs `pnpm install`.~~ (removed in #231 — expo-modules-jsi 57.0.5 ships the upstream fix) |

### 1.2 Code changes required before submission

1. **B1** — `npx expo install --check`; re-run `pnpm --filter @dragons/native check:doctor` (must print 20/20).
2. **`ios.privacyManifests`** and **`locales`** as above.
3. **Legal + support entry point**, reachable signed-out and ≤ 2 taps deep (e.g. a "Rechtliches" group in `profile.tsx` and a footer on `(auth)/sign-in.tsx`): Datenschutz, Impressum (links to hbdragons.de are sufficient — DSK OH Apps 2014, ch. 5.2.3), support contact (`mailto:` a role mailbox), app version + build. Today `profile.tsx` has sign-in / language / roles / biometric / theme / sign-out only.
4. **Account deletion request.** Guideline 5.1.1(v) literally triggers on "supports account creation", which this app does not (`disableSignUp: true`, `apps/api/src/config/auth.ts`), and Apple publishes no guidance for admin-provisioned accounts (UNVERIFIED how review treats it). Google Play's deletion policy has the same trigger. The cheap, defensible path: a "Konto löschen beantragen" action in Profile that mails/POSTs a request, plus a page on hbdragons.de, and a sentence in the review notes. Better-auth's `user.deleteUser` is not enabled; only web admins can `removeUser`.
5. **Chatbot AI disclosure** (AI Act Art. 50(1), in force 2026-08-02; Apple 5.1.2(i) "explicit permission" before sharing with third-party AI): rename to "KI-Assistent", first-interaction notice that answers are generated by Google Gemini, may be wrong, and that no third-party personal data should be entered. `assistant.*` strings in `src/i18n/de.json` contain no AI wording today.
6. **Push pre-permission explanation** (what is sent, that Expo → Apple/Google deliver it, how to switch it off) before the OS prompt — § 25(1) TDDDG "klare und umfassende Informationen"; also satisfies 4.5.4's opt-out expectation if the club ever sends non-operational pushes.
7. **AASA + assetlinks** in `apps/web/public/.well-known/` (after the Team ID is final).
8. **Crash reporting** (Sentry/Bugsnag/Crashlytics) wired into `lib/global-error-handler.ts` and `ErrorBoundary`, source maps via the EAS build hook; add it to `privacyManifests` and the privacy label (Diagnostics). Without it release crashes are invisible.
9. **Tests** for everything above — coverage sits at 17.17 / 11.14 / 21.24 / 16.7 % against floors 17 / 11 / 21 / 16 (`vitest.config.ts:103-106`), i.e. ~0.1 pt of headroom on statements; any untested addition fails the gate.

### 1.3 Recommended (not gating)

- Accessibility: 17 files render a `Pressable` without `accessibilityRole` (`_layout.tsx`, `(tabs)/today/index.tsx`, `referee-game/[id].tsx`, `TeamCard.tsx`, `profile.tsx`, `Card.tsx`, `MatchCardCompact.tsx`, `RefereeGameCard.tsx`, `StandingsTable.tsx`, `(tabs)/officiating/index.tsx`, `ResultChip.tsx`, `game/[id].tsx`, `HeadToHead.tsx`, `MatchCardFull.tsx`, `ClaimGameButton.tsx`, `ErrorBoundary.tsx`; `FilterPill.tsx` is a false positive — it spreads `filterPillA11y`). Score cards read as digits. No VoiceOver pass yet. Apple's Accessibility Nutrition Labels are still voluntary with no date.
- Lint: 0 errors, 15 warnings (`react-hooks/exhaustive-deps` ×10, `no-require-imports` ×5 in `theme/typography.ts`).
- `getResultBadge` / `resolveName` are now **triplicated** (`MatchCardFull.tsx`, `MatchCardCompact.tsx`, `ResultChip.tsx`); 17 inline `colors.x + "1A"` alpha hacks; no render harness, no Maestro flow; `partitionGames`, `groupByDate`, `claimErrorMessage`, `dropErrorMessage` still untested and still defined inside screen files.
- Public read endpoints (schedule/standings/teams) have no per-route rate limit; only `qa`, `mcp`, `public/broadcast`, `public/probetraining` import `rate-limit.ts`. Decide whether Cloud Run/LB protection is enough for anonymous store traffic.
- No EAS automation: no `eas` in `.github/workflows`, no `.eas/workflows/`. Every build, submit and OTA update depends on one laptop logged in as `eshamounskerto`. At least an EAS Workflow for `eas update --branch production` on tag.
- Confirm `CHATBOT_ENABLED=true` on the production API; both `preview` and `production` profiles bake `EXPO_PUBLIC_CHATBOT_ENABLED=true`, and `qa.routes.ts` returns 503 otherwise.

### 1.4 Quality gates on 2026-08-25

| Gate | Result |
|------|--------|
| `typecheck` (`expo customize tsconfig.json && tsc --noEmit`) | pass |
| `lint` | pass — 0 errors, 15 warnings |
| `coverage` (60 test files) | pass — 17.17 / 11.14 / 21.24 / 16.7 vs 17 / 11 / 21 / 16 |
| `check:doctor` | **fail** — 19/20, "8 packages out of date" |
| CI `native-doctor` job | will fail on next run |

### 1.5 Data the binary sends off-device (drives the privacy label and the Datenschutzerklärung)

| Data | To | When | Source |
|------|----|------|--------|
| E-mail + password | club API (`/api/auth/sign-in/email`) | sign-in | `src/app/(auth)/sign-in.tsx:53` |
| Session token (Keychain via SecureStore), as Cookie | club API | every call while signed in | `src/lib/auth-client.ts:28-33` |
| Expo push token, `platform`, device `locale` | club API `/api/devices/register`; token minted by Expo's push service | every boot while signed in | `src/lib/push/registration.ts:41-46`, `packages/contracts/src/devices.ts` |
| Chat messages + `locale` | club API `/qa/chat` (`requireAuth`, 20 req/min) → Google Gemini | user-initiated, signed-in only | `src/lib/assistant/transport.ts`, `apps/api/src/routes/qa.routes.ts:15-24` |
| IP address, platform, runtime version, random update token | Expo Inc. (`u.expo.dev`) | every cold start (`checkAutomatically: ON_LOAD`) | `app.json` `updates` |
| Nothing else | — | — | no analytics, crash, ad or tracking SDK; clipboard, network state, `expo-device.isDevice`, prefs and Face ID are local only |

Displayed personal data: signed-out — team names, venues, scores, standings
(no rosters, no birth data anywhere in the native app, web app or site);
signed-in — the user's own e-mail, referee candidates' names and distance
brackets, board tasks/comments with member names.

---

## 2. Apple App Store Connect

### 2.1 Metadata and assets

- **App Information (set once):** name (30 chars; `expo.name` is "Dragons" — the store name may differ), subtitle, bundle id (locked after first upload), SKU, primary language (German), primary category (Sports), **privacy policy URL**, age rating, **Content Rights** (federation data → "contains third-party content, and I have the rights"), **EU DSA trader status**. Source: developer.apple.com/help/app-store-connect/reference/app-information/app-information
- **Per version:** description (4000), keywords (100 bytes), **support URL** (must carry contact info per local law → point at the Impressum/contact page), copyright ("2026 Hanover Basketball Dragons e.V."), review contact name/e-mail/phone, **sign-in required + demo credentials**, notes.
- **Screenshots:** iPhone 6.9" (1290×2796 or 1320×2868) required; iPad 13" (2064×2752 or 2048×2732) required while `supportsTablet` is true; 1–10 each, de and en; must show the app in use, not the login or splash (Guideline 2.3.3). Source: developer.apple.com/help/app-store-connect/reference/screenshot-specifications
- **Localizations:** add German (primary) and English (U.S.) listings regardless; how the product page's "Languages" row is derived from the binary is UNVERIFIED, so ship `locales` (§1.1) anyway.

### 2.2 Privacy label (answers, all "linked to you", purpose "App Functionality", no tracking)

Contact Info → Email Address, Name; Identifiers → User ID; Identifiers →
Device ID (Expo push token — conservative reading, Apple lists no "push token"
type, UNVERIFIED whether expected); User Content → Other User Content only if
chat messages are retained server-side beyond the request (if not, the
"collect" definition's real-time carve-out applies); Diagnostics → none until a
crash reporter ships. "Data Not Collected" would be wrong. Labels can be edited
without a new build. Source: developer.apple.com/app-store/app-privacy-details/

### 2.3 Age rating

New app → full current questionnaire (tiers 4+/9+/13+/16+/18+); the
social-media questions are mandatory for submissions from September 2026.
Expected answers: no in-app controls; Unrestricted Web Access: No; UGC: No;
Messaging and Chat (user-to-user): No; Advertising: No; Contests: No (league
standings are not an in-app contest); everything else None → **4+**. Apple
states explicitly that chatbot output counts toward sensitive-content
frequency — be ready to justify "none/infrequent". Sources:
developer.apple.com/news/?id=ks775ehf, developer.apple.com/news/?id=tlur8uvi,
developer.apple.com/help/app-store-connect/reference/age-ratings

### 2.4 EU DSA trader status — a decision for the Vorstand

- Apple requires a declaration for every app; apps without one have been
  removed from the EU storefront since 2025-02-17. Traders (organisations)
  get their D-U-N-S address, a verified phone number and e-mail published on
  the EU product page. Apple's factors: revenue, commercial practices, VAT
  registration, "developed in connection with your trade, business, craft or
  profession", legal business status. Non-profits and free apps are not
  addressed. Source: developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements
- DSA Art. 3(f): a trader acts "for purposes relating to his or her trade,
  business, craft or profession"; Art. 30/31 duties attach only to traders
  concluding distance contracts with consumers. A gemeinnütziger e.V. giving
  away a free app with no sales, IAP, ads or sponsorship placements is, on the
  statutory text, **not a trader**. No regulator guidance for Vereine was found
  (UNVERIFIED beyond the text).
- Recommendation: declare **non-trader**, write down the reasoning, and
  re-evaluate before any monetisation (tickets, merch, sponsor ads, paid
  membership in-app). If Apple later disagrees, the cost is switching to
  trader and publishing the contact data the Impressum already publishes.
  Declaring trader is the low-friction alternative if the Vorstand prefers
  zero risk of an EU delisting.

### 2.5 Review preparation (Guideline 2.1 is > 40 % of rejections)

- Persistent demo accounts on the production API for each role (member,
  referee, admin) with sign-in enabled in the review form; notes explaining
  club-provisioned accounts, no password reset in-app, what each role sees,
  chatbot is members-only, Face ID lock is optional, universal-link domain.
- Backend up and stable during review; privacy and support URLs live.
- Internal TestFlight first (≤ 100 App Store Connect users, no Beta App
  Review); external groups trigger a review with the same checks.
- Plan for one rejection round. 90 % of reviews finish in < 24 h.

### 2.6 Checked and not applicable

Sign in with Apple (4.8) — email/password only, no social login. App Tracking
Transparency — no tracking. Encryption declaration — exempt. Paid Apps
agreement — free app. OTA updates — permitted as interpreted code under PLA
3.3.1(B) as long as updates stay within the advertised purpose (no enabling a
new feature category by OTA). Launch-screen requirement — arrives with the
iOS 27 SDK and is already satisfied by the SDK 57 template.

---

## 3. Legal (DE/EU)

### 3.1 Impressum

- Required for the app: § 5 DDG (apps in stores are "geschäftsmäßig" per the
  DSK/Düsseldorfer Kreis OH Apps 2014, ch. 5.1) and, independently of
  "Entgelt", § 18 Abs. 1 MStV for every non-private Telemedium. Sources:
  gesetze-im-internet.de/ddg/__5.html, lda.bayern.de/media/oh_apps.pdf,
  MStV as of 2025-12-01 (die-medienanstalten.de)
- The site Impressum (`apps/site/src/pages/impressum/index.astro`) has every
  e.V. field: name, Kolbergstraße 7, 30175 Hannover, Vorstand per § 26 BGB,
  info@hbdragons.de, Amtsgericht Hannover VR201353. A link from the app to it
  is sufficient (two-click rule, BGH I ZR 228/03).
- Defects to fix: header cites "§ 5 TMG / § 55 Abs. 2 MStV" (TMG repealed
  2024-05-14; § 55 is now § 18 MStV), liability section cites TMG §§ 7–10,
  section numbering jumps 4 → 7, `apps/site/src/lib/strings.ts:248` SEO text
  still says "§ 5 TMG". Confirm the Verein has no USt-IdNr. (only listed
  "sofern vorhanden"). Keep Vorstand names current after elections.

### 3.2 Datenschutzerklärung — an app-specific one is required

The site policy (`apps/site/src/pages/datenschutz/index.astro`, "Stand
10. August 2025") covers the website only, and is stale even there (names
IONOS + Strapi; the CMS is Payload on Cloud Run, Probetraining data and mail
run on GCP). It says nothing about accounts, push, Expo, Google Cloud, Gemini,
the biometric lock, US transfers or retention. Linking a generic web policy
from an app is explicitly insufficient (OH Apps 2014, ch. 5.2.4). Required
content (Art. 13 DSGVO), each with purpose, legal basis, recipients, transfer
and retention:

1. Controller block; "Ein Datenschutzbeauftragter ist nicht benannt" (or the DPO contact, §3.6).
2. Public content: source Basketball-Bund API (Art. 14(2)(f)); server logs on Google Cloud, Art. 6(1)(f).
3. Accounts (e-mail, name, role; created by club admins): Art. 6(1)(b) via Mitgliedschaft/Vereinsordnung or 6(1)(f); Art. 13(2)(e) note; retention until deletion / end of membership.
4. Device storage (session token, prefs, update cache, biometric flag): § 25 Abs. 2 Nr. 2 TDDDG — no consent banner needed.
5. Push: OS opt-in; token + platform on the club server; recipients Expo (USA) → APNs/FCM; safeguard = SCCs in Expo ToS § 3.2 (Expo's own DPF listing UNVERIFIED); how to disable; deleted on logout.
6. expo-updates: request to `u.expo.dev` on every launch (IP, platform, runtime version, random token — no user id), Art. 6(1)(f).
7. Biometric lock: evaluated by the OS, the app receives only success/failure; no biometric data reaches the club → no Art. 9 processing.
8. Chatbot: prompts go via the club API to Google's Gemini API; Google as processor under its DPA; no training use (paid tier / EEA terms); transient retention; instruction not to enter third-party personal data; AI disclosure; Art. 13(2)(f) no automated decisions.
9. Hosting: Google Cloud (Cloud Run, Cloud SQL, GCS, Secret Manager) in `europe-west3` Frankfurt under the Cloud Data Processing Addendum (contracting Google entity UNVERIFIED, expected Google Ireland).
10. App stores: Apple / Google as independent controllers (Apple Distribution International Ltd for the EEA).
11. Third-country section: USA — DPF adequacy (Google LLC certified; upheld by the General Court T-553/23 on 2025-09-03, appeal C-703/25 P pending) + SCCs; how to obtain a copy.
12. Rights block (exists), Art. 13(2)(c) withdrawal, Art. 21 objection, Art. 77 with LfD Niedersachsen.
13. Fix the website part (Payload on GCP, Probetraining storage and SMTP).

Publish it at a stable URL (e.g. `/datenschutz/app/`), link it from the app
and from both store records.

### 3.3 Processors (Art. 28) — archive the instruments

| Processor | Instrument | Action |
|-----------|------------|--------|
| Google Cloud | Cloud Data Processing Addendum, incorporated into the GCP terms automatically | download and archive a copy (Art. 28(9)); check subprocessor list |
| Google Gemini API | "Data Processing Addendum for Products where Google is a Data Processor" v10 (2026-05-07); its service list names **"Gemini API Paid Services"** only | see §3.4 |
| Expo (650 Industries, Inc.) | ToS § 3.2: processor, SCC Module Two deemed completed; no standalone DPA document | archive ToS + subprocessor list (AWS, Cloudflare, Apple, Google, …); optionally request a signed confirmation |
| Apple, Google Play, Basketball-Bund | independent controllers | no DPA; list as recipients |
| Hetzner (site/mail), IONOS | existing AV contracts per the site policy | keep Hetzner if still used; retire IONOS |
| SMTP relay, WAHA host, GitHub dispatch | only channels enabled in production | DPA + policy entry per channel |

### 3.4 Gemini tier

Gemini API Additional Terms (2026-03-23): on **Unpaid Services** Google
"uses the content you submit … to provide, improve, and develop Google
products … human reviewers may read, annotate, and process your API input"
and says "Do not submit sensitive, confidential, or personal information".
EEA users get the Paid-Services data terms even on unpaid quota, but the
processor DPA's coverage list names only "Gemini API Paid Services". Action:
**enable billing on the Cloud project behind `GOOGLE_GENERATIVE_AI_API_KEY`**
so the club is unambiguously on Paid Services and the DPA applies; archive
it. Which tier the current key is on is not derivable from the repo. Sources:
ai.google.dev/gemini-api/terms, business.safety.google/processorterms/,
business.safety.google/services/; DSK OH KI 2024-05-06 Rn 24/32/48.

### 3.5 AI Act Art. 50(1)

Applies since 2026-08-02 (Art. 113; the 2026 Digital Omnibus left Art. 50(1)
untouched per consistent secondary reporting — UNVERIFIED against the OJ
text). The club puts the "Vereins-Assistent" into service under its own name
→ it is the provider of that AI system for Art. 50(1) and must inform users
"at the latest at the time of the first interaction" that they talk to an AI,
unless obvious — a screen titled "Vereins-Assistent" with "Neu generieren"
is not obvious. Fix in §1.2 item 5. Not high-risk; transparency only. Record
the classification in the Verzeichnis or an ADR.

### 3.6 Verzeichnis (Art. 30) and Datenschutzbeauftragter (§ 38 BDSG)

- Verzeichnis: required. DSK Kurzpapier 1, LfD Niedersachsen ("Datenschutz
  im Verein", June 2023, p. 33) and BayLDA all say Vereine cannot use the
  < 250 exemption because member administration is not occasional. Add
  entries for accounts/roles, push, update checks, chatbot, referee sync,
  result publication, server logging. BayLDA template:
  lda.bayern.de/media/muster/muster_1_verein_verzeichnis.pdf
- DSB: only if ≥ 20 persons — **volunteers count, heads not FTE** (LfD Nds
  p. 39–40) — regularly process personal data with automated means. Count the
  admin/coach/referee accounts that handle other people's data. Below 20:
  record the decision and state "kein DSB benannt" in the policy.

### 3.7 Push notifications

Operational member messages (schedule changes, referee assignments, task
reminders) rest on Art. 6(1)(b)/(f) with the OS opt-in as the user's request
— no marketing consent, § 7 UWG not engaged. Any promotional push (merch,
tickets, sponsors) needs prior express consent by analogy to § 7 Abs. 2 Nr. 2
UWG (whether push is "elektronische Post" is the prevailing commentary view;
no court ruling located — UNVERIFIED) and an easy opt-out. The OS dialog alone
is not "informed" consent under § 25(1) TDDDG → pre-permission explanation
(§1.2 item 6). Delete tokens on logout (already done: `src/lib/auth/sign-out.ts:30`).

### 3.8 Checked and not applicable today

- **Minors / rosters:** Art. 8 DSGVO is not triggered (no child accounts, no
  consent-based service aimed at children). Roster publication (Art. 6(1)(f)
  per LfD Nds: name, team, results, table — never birth date or address;
  parental consent advised for youth) does not apply because **no surface
  shows player rosters today** (native, web and site all render team names,
  scores, standings only; `player-photos` exists only as a schema for the
  web admin social feature). Revisit — Datenschutzordnung clause, parental
  consent, "hide from roster" flag — before any roster or player-photo
  feature ships.
- **BFSG:** out of scope — no Verbrauchervertrag is concluded through the
  app (§ 2 Nr. 26), and the club is a Kleinstunternehmen (§ 3 Abs. 3).
- **§ 25 TDDDG consent banner:** not needed; every local store is
  "unbedingt erforderlich" (Abs. 2 Nr. 2).
- **Custom EULA:** optional; Apple's Standard EULA governs otherwise. Account
  rules belong in the Satzung/Vereinsordnung. If written: short, shown on
  first login with explicit accept (§ 305 Abs. 2 BGB), no blanket liability
  exclusions.

---

## 4. Accounts and administration

### 4.1 Apple Developer Program — organization enrollment

- An e.V. qualifies (legal entity; DBAs/trade names are rejected). Needs: a
  **D-U-N-S number** for "Hanover Basketball Dragons e.V." at the registered
  address (free via Apple's lookup; ≤ 5 business days + 2 for Apple to
  ingest; Google says up to 30 days — start it first), an **Account Holder**
  with legal authority (a vertretungsberechtigtes Vorstandsmitglied per
  § 26 BGB) on an `@hbdragons.de` Apple Account with 2FA, and the public
  website. The organisation's name becomes the App Store seller name.
  Sources: developer.apple.com/programs/enroll/, developer.apple.com/support/D-U-N-S/
- Fee: 99 USD/year, "listed in local currency during enrollment" (EUR figure
  UNVERIFIED on Apple). **Non-profit fee waiver** exists for organisations
  verified by "a local register of charities in the E.U." that distribute
  only free apps and never sign the Paid Apps agreement — have the
  Freistellungsbescheid and Vereinsregisterauszug ready and request it during
  enrollment. Source: developer.apple.com/support/membership-fee-waiver/
- Timeline: no published SLA; budget 2–3 weeks including D-U-N-S.

### 4.2 The bundle-id ownership problem (B2)

Facts: builds 1.0.0 (1) and (2) were uploaded to App Store Connect under
team `2ZDTV3KLV2`; Apple: "if you've uploaded a build, your bundle ID can't be
reused" and an explicit App ID that was uploaded cannot be deleted; app
transfer requires "at least one version that was released to the App Store"
— a TestFlight-only record cannot be transferred. **Confirmed 2026-08-25
(Q1): `2ZDTV3KLV2` is the maintainer's personal membership**, not the
club's. Options in order of preference — option 1 is the recommendation:

1. **Convert the individual membership to the club's organization
   membership** via Apple Developer Support — keeps Team ID, App IDs and
   the ASC record if Apple preserves them (UNVERIFIED; Apple only says
   "contact us"). Needs D-U-N-S + Vorstand as Account Holder + org-domain
   e-mail. Source: developer.apple.com/support/enrollment/
2. **Ship 1.0 from the personal team, then transfer** — a member's personal
   name is the seller for v1.0 and the DSA declarant; the transfer then costs
   a new APNs key, an AASA update with the new Team ID (keep both listed
   during rollout) and one forced re-login (Keychain).
3. **Enroll the org fresh and use a new iOS bundle id** (e.g.
   `de.hbdragons.dragons`); the Android package can stay `de.hbdragons.app`.
   Costs: new ASC record, `ios.bundleIdentifier` change, AASA `appIDs`, EAS
   remote version counter restarts.
4. Ask Apple Developer Support to release the App ID from the personal team
   — anecdotal only.

After any team change: `eas credentials -p ios` for a new APNs key, update
`ios.appleTeamId`, republish AASA, and `eas build:version:set` so iOS build
numbers stay above what App Store Connect already holds.

### 4.3 App Store Connect setup

- Roles: Account Holder (Vorstand; signs agreements, renews, must accept
  every new Program License Agreement or uploads stop), Admin (maintainers),
  App Manager for a CI/submit identity.
- ASC API key: generated by Account Holder/Admin (Users and Access →
  Integrations → Team Keys, access "App Manager"); `.p8` downloadable once;
  store via `eas credentials -p ios` and in the club password manager.
- Record: `eas submit -p ios` creates it (registers the bundle id, asks for
  name/SKU/language), or create it by hand first to answer DSA, age rating
  and privacy before the first upload; then set `ascAppId` in `eas.json`.
- Free app → only the PLA; no Paid Apps agreement, no bank/tax forms.

### 4.4 Expo / EAS ownership

- Create an Expo **Organization**, invite `eshamounskerto` as Owner/Admin
  there, transfer project `dragons` from Project settings (Owner/Admin on
  both sides; limited number of transfers), set `owner` in `app.json`.
  Whether `projectId` / `updates.url` and stored credentials survive is
  UNVERIFIED in Expo's docs — nothing is in production, so do it **before**
  the first store build and check `extra.eas.projectId` afterwards.
  Source: docs.expo.dev/accounts/account-types/
- Generate the Android keystore and upload the FCM V1 key only after the
  transfer so they live under the org; download a `credentials.json` backup.
- Free plan: 15 iOS + 15 Android builds/month, low-priority queue, 1K MAU for
  updates — enough for a club; Starter is $19/month. Source: expo.dev/pricing
- Re-link the `hb-dragons` GitHub org to the Expo org for EAS Workflows.

### 4.5 Operational hygiene

- Role mailboxes (`app@`, `datenschutz@`, Vorstand mailbox) — Play publishes
  the developer e-mail, Apple shows the support URL; a member's private
  address would leak and break when they leave.
- 2FA is mandatory for the Account Holder and every ASC user.
- Keep the ASC API key, APNs `.p8`, Android keystore, Play/Firebase service
  accounts, D-U-N-S and the signing fingerprints in a shared club password
  manager; record Account Holder handover in the Vereins-Übergabeprotokoll.
- Issue hygiene: #212–#226 (native modernisation) are still open although
  `feat/native-modernization` is merged — close what is done so the tracker
  reflects the release backlog; file the items in this document as issues.

---

## 5. Google Play (only if Android ships with v1)

- Organization account: US$25 one-time; D-U-N-S, government ID of the
  enroller + Vereinsregisterauszug, OTP-verified e-mail/phone, hbdragons.de
  verified via Search Console under the club's Google account; legal name,
  address, developer e-mail and phone become **public**. The "12 testers for
  14 days" closed-test rule applies to personal accounts created after
  2023-11-13 only. Sources: support.google.com/googleplay/android-developer/answer/6112435, …/answer/14151465
- Target API 36 required from 2026-08-31 — Expo SDK 57 targets 36, no override needed.
- Mandatory forms: Data safety (needs the privacy URL; declares account data,
  push token/device id), IARC (expect USK 0), Financial features = none,
  Health = none, account-deletion questions (same trigger as Apple; declare
  the deletion page).
- Play App Signing is automatic; EAS holds the upload key; first AAB must be
  uploaded by hand before `eas submit -p android` works with a service
  account. `assetlinks.json` needs the **app signing key** fingerprint from
  Play Console, not `keytool`'s.
- FCM: Firebase project under the club's Google account, `google-services.json`
  + FCM V1 service-account key in EAS — none of this exists yet.
- Assets: 512 px icon, 1024×500 feature graphic, 2–8 phone screenshots, 4+
  tablet screenshots if tablets are supported. Monochrome icon layer optional.
- `USE_BIOMETRIC` / `USE_FINGERPRINT` are normal permissions (no declaration
  form); the explicit entries in `app.json` are redundant — the
  `expo-local-authentication` plugin adds both anyway.

---

## 6. Corrections owed to `PRE-LAUNCH.md` / `RELEASES.md`

| Doc | Says | Reality |
|-----|------|---------|
| PRE-LAUNCH §permissions | `USE_FINGERPRINT` "pending a decision" | moot — the plugin adds both permissions regardless |
| PRE-LAUNCH §privacy | "Verify `PrivacyInfo.xcprivacy` covers every SDK" | a default app manifest is generated at prebuild; what is missing is the app-level `ios.privacyManifests` key (and a matching ASC label) |
| PRE-LAUNCH §polish | `home.countdown.inDays` pluralisation wrong | fixed — `(tabs)/index.tsx:23-27` special-cases 0/1 |
| PRE-LAUNCH §polish | `LocaleProvider` remounts the subtree | fixed — `useTheme.tsx:62-66`, no `key={locale}` remains |
| PRE-LAUNCH §polish | `getResultBadge` duplicated in two cards | triplicated — also `ResultChip.tsx:19` |
| PRE-LAUNCH §testing | 57 test files | 60 |
| PRE-LAUNCH §account | "migrate EAS account before release" | still true, and the harder half is the Apple side (§4.2), which the doc does not mention |
| RELEASES §doctor | "all 20 pass" | 19/20 — 8 packages behind the SDK pins |
| RELEASES §state | last build April 2026 | 2026-08-10, iOS `preview` 1.0.0 (4), SDK 55; still no Android build, no OTA, no `production` channel |
| both | nothing on legal texts, DSA, age rating, AI Act, Gemini tier | this document |

Applied to both files on 2026-08-25 (same day, follow-up session). The
live EAS build list turned out to hold six builds, not four: the two
2026-08-10 `preview` builds (3 errored, 4 finished) sit on top of the
April ones.

---

## 7. Answers from the club (2026-08-25) and resulting decisions

| # | Question | Answer | Consequence |
|---|----------|--------|-------------|
| Q1 | Is Apple team `2ZDTV3KLV2` the club's? | No — the maintainer's personal membership. | B2 is real. **Do:** §4.2 option 1 — ask Apple Developer Support (developer.apple.com/support/enrollment/ → "contact us") to convert the individual membership into an organization membership for "Hanover Basketball Dragons e.V."; keeps Team ID, bundle id and the existing ASC record. Prerequisites: D-U-N-S (Q2), an Apple Account on `@hbdragons.de`, and an Account Holder with legal authority — the Impressum names Talha Dis and Kianusch Pour Rahimi as Vorstand, so either one of them holds the role or the maintainer gets a written Vollmacht from the Vorstand. The maintainer's personal membership ceases to exist as such — acceptable if it publishes nothing else. Fallback if Apple declines: option 3 (fresh org enrollment + new iOS bundle id). Do not ship v1.0 under a personal name (option 2). Commit the `appleTeamId` line — it stays correct under option 1. |
| Q2 | Does a D-U-N-S exist? | Unknown → **requested via Apple's lookup on 2026-08-25** (expect the number by ~2026-09-01, Apple ingest by ~09-03). | **Check:** Apple's D-U-N-S lookup, developer.apple.com/enroll/duns-lookup/ (sign in with any Apple Account; enter the exact Vereinsregister name "Hanover Basketball Dragons e.V.", Kolbergstraße 7, 30175 Hannover). If D&B has a record it e-mails the number; if not, the same form requests one — free, ≤ 5 business days, then 2 for Apple to ingest. Alternative: D&B Germany, dnb.com/de-de/kleinunternehmen/duns/duns-request.html. The name must match the Registerauszug character for character; Google Play reuses the same number. **Not only for companies:** D&B assigns D-U-N-S numbers to any legal entity — Apple's own page names educational institutions and government organizations besides companies, and its non-profit fee waiver presupposes non-profits enrolling as organizations with one; an e.V. is a juristische Person (§ 21 BGB) and qualifies. Google Play makes it mandatory for every organization account ("You will not be able to create a developer account for an organization without one"), with exceptions only for known government bodies and regions D&B does not cover. Many German Vereine already have one without knowing — D&B compiles from the Vereinsregister — hence: look up first. |
| Q3 | Gemini key on Paid Services? | Yes — runs on Google startup credits, i.e. a billing-enabled Cloud project. | Google's processor DPA applies; no training use. Verify once in AI Studio → API keys: the key's project shows plan "Paid". Archive the DPA (business.safety.google/processorterms/). Closed. |
| Q4 | People regularly processing member data? | Fewer than 20. | No DSB (§ 38 BDSG). Record the headcount in the Verzeichnis; add "Ein Datenschutzbeauftragter ist nicht benannt" to the policy. Closed. |
| Q5 | Can the app link to the website's Datenschutz? | Wants to. | **Yes for the link** — the in-app entry and both store URLs point at hbdragons.de/datenschutz. **Not yet for the text** — it describes the website only; DSK OH Apps ch. 5.2.4 and Apple 5.1.1(i) both require the app's own data flows to be described. Add a "Dragons App" section with the 13 items in §3.2 to that same page (one URL for everything) and fix the stale IONOS/Strapi part while editing. |
| Q6 | Android in v1? | Test an Android build beforehand. | Safe now: push registration wraps `getExpoPushTokenAsync` in try/catch (`src/lib/push/registration.ts:37-45`), so a build without FCM logs a warning and continues. Recipe below. Must follow B1 (doctor). Keystore: EAS creates the upload keystore on the first Android build under whichever account owns the project — transfer the Expo project first if that is imminent, otherwise `eas credentials -p android` → download `credentials.json` as a backup. Play org account, FCM and `assetlinks.json` remain on the list for the store release. |
| Q7 | DSA trader or not? | "Don't understand." | When the app record is created, App Store Connect asks one question: are you a *trader* under the EU Digital Services Act? A trader sells something or acts commercially. The club gives the app away, sells nothing inside it, shows no ads → answer **No (non-trader)**. Nothing is published, no verification. Only if the club ever sells tickets, merch or memberships *inside the app* must it switch to trader, which publishes the club's address, phone and e-mail on the EU store page. The answer is the same while the account is still personal. |
| Q8 | Keep iPad? | Yes. | 13" iPad screenshots (de + en); windowed-mode / Split View test on an iPad before submission. |
| Q9 | Role mailboxes? | Any can be created. | Create `app@hbdragons.de` (support URL contact, App Review contact, Play developer e-mail), `datenschutz@hbdragons.de` (policy contact, deletion requests), an Apple Account mailbox for the Account Holder (e.g. `apple@hbdragons.de`, 2FA on that person's phone), and a club Google account for Play Console + Firebase (e.g. `play@hbdragons.de`). |
| Q10 | AV contracts exist? | Partly signed. | Nothing new to sign: Google Cloud, Gemini and Expo are all incorporated in their terms — download and archive copies (§3.3). Hetzner exists per the site policy. Retire IONOS if unused. |

### Android test build recipe (Q6)

```bash
cd apps/native
npx expo install --check                        # B1 — EAS fails the build otherwise
pnpm check:doctor                               # must print 20/20
eas build --platform android --profile preview  # .aab for Play; EAS generates the keystore on first run
```

An `.aab` cannot be installed on a device directly. For a device test without
a Play account add a profile to `eas.json`:

```json
"preview-internal": { "extends": "preview", "distribution": "internal" }
```

With `distribution: internal` EAS builds an APK on Android by default
(docs.expo.dev/eas/json/, `android.buildType`), so
`eas build -p android --profile preview-internal` returns an install link.
Expect on that build: no push (warning in logs), `https://app.hbdragons.de`
links open the browser until `assetlinks.json` exists, and the chatbot
answers only if the production API has `CHATBOT_ENABLED=true`. First
Android run is also the first look at the adaptive icon, the splash and
the datetimepicker on Android — none has ever been seen on a device.

---

## Sources

Apple: developer.apple.com/app-store/review/guidelines/ ·
developer.apple.com/news/?id=ueeok6yw · developer.apple.com/news/?id=ks775ehf ·
developer.apple.com/news/?id=tlur8uvi · developer.apple.com/news/upcoming-requirements/ ·
developer.apple.com/help/app-store-connect/reference/app-information/app-information ·
developer.apple.com/help/app-store-connect/reference/screenshot-specifications ·
developer.apple.com/help/app-store-connect/reference/age-ratings ·
developer.apple.com/app-store/app-privacy-details/ ·
developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api ·
developer.apple.com/support/third-party-SDK-requirements/ ·
developer.apple.com/support/offering-account-deletion-in-your-app/ ·
developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements ·
developer.apple.com/documentation/security/complying-with-encryption-export-regulations ·
developer.apple.com/documentation/technotes/tn3192-migrating-your-app-from-the-deprecated-uirequiresfullscreen-key ·
developer.apple.com/documentation/xcode/supporting-associated-domains ·
developer.apple.com/programs/enroll/ · developer.apple.com/support/D-U-N-S/ ·
developer.apple.com/support/membership-fee-waiver/ · developer.apple.com/support/enrollment/ ·
developer.apple.com/help/app-store-connect/transfer-an-app/app-transfer-criteria ·
developer.apple.com/help/app-store-connect/create-an-app-record/remove-an-app ·
developer.apple.com/help/account/identifiers/delete-an-app-id/ ·
developer.apple.com/help/app-store-connect/get-started/app-store-connect-api ·
developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview ·
developer.apple.com/support/downloads/terms/apple-developer-program/Apple-Developer-Program-License-Agreement-English.pdf (LYL255, 2026-08-18)

Expo: docs.expo.dev/build-reference/infrastructure/ · docs.expo.dev/guides/apple-privacy/ ·
docs.expo.dev/guides/localization/ · docs.expo.dev/app-signing/app-credentials/ ·
docs.expo.dev/push-notifications/push-notifications-setup/ · docs.expo.dev/push-notifications/fcm-credentials/ ·
docs.expo.dev/linking/ios-universal-links/ · docs.expo.dev/submit/ios/ · docs.expo.dev/eas/json/ ·
docs.expo.dev/build-reference/app-versions/ · docs.expo.dev/accounts/account-types/ ·
docs.expo.dev/distribution/app-transfers/ · expo.dev/pricing · expo.dev/terms · expo.dev/privacy ·
expo.dev/privacy/subprocessors · docs.expo.dev/technical-specs/expo-updates-1/

Google: support.google.com/googleplay/android-developer/answer/6112435 · …/answer/13628312 ·
…/answer/14151465 · …/answer/10787469 · …/answer/13327111 · …/answer/11926878 ·
developer.android.com/training/app-links/verify-android-applinks ·
ai.google.dev/gemini-api/terms · business.safety.google/processorterms/ ·
business.safety.google/services/ · cloud.google.com/terms/data-processing-addendum ·
policies.google.com/privacy/frameworks

DE/EU law and regulators: gesetze-im-internet.de/ddg/__5.html · gesetze-im-internet.de/tddsg/__25.html ·
gesetze-im-internet.de/bdsg_2018/__38.html · gesetze-im-internet.de/bfsg/__1.html, __2.html, __3.html ·
gesetze-im-internet.de/uwg_2004/__7.html · gesetze-im-internet.de/bgb/__305.html ·
MStV (7. MÄStV, 2025-12-01): die-medienanstalten.de · DSGVO Art. 6, 8, 9, 13, 28, 30, 37, 44–46 (CELEX 32016R0679, via gdpr-info.eu) ·
DSA Art. 3, 30, 31 (CELEX 32022R2065, via eu-digital-services-act.com) ·
AI Act Art. 3, 4, 50, 113 (CELEX 32024R1689, via artificialintelligenceact.eu) ·
DSK OH Apps 2014: lda.bayern.de/media/oh_apps.pdf · DSK OH Telemedien 2021 v1.1 ·
DSK OH KI und Datenschutz 2024-05-06 · DSK Kurzpapier Nr. 1 ·
LfD Niedersachsen "Datenschutz im Verein" (June 2023) · BayLDA "DS-GVO in Vereinen", Muster Verzeichnis ·
General Court T-553/23 press release 106/25 (curia.europa.eu) ·
commission.europa.eu adequacy decisions page · apple.com/legal/privacy/en-ww/
