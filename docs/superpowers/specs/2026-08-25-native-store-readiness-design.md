# Native store readiness — code track (design)

Date: 2026-08-25. Tracking issue #230; this spec covers the code slices
#231, #232, #233, #234, #235, #237 and #248. Source of every requirement:
`docs/2026-08-25-app-store-release-readiness.md` (§1.1, §1.2, §3.5, §3.7)
and the club's decisions in its §7.

## Goal

Make the native binary and its web counterpart submittable on the
engineering side: a green `expo-doctor`, the two missing `app.json`
declarations, the legal / support / deletion entry points the stores and
DE/EU law require, the AI disclosure the AI Act requires, a push
pre-permission step, and the universal-links file that activates the
entitlement already compiled into the binary.

Not in this branch: the web assistant's AI notice (#236), the site
Impressum citations (#242), crash reporting (#238), the Android build
(#244), `assetlinks.json` (#249). Each needs either an account a human
has to create or a decision outside the app.

## Constraints that shape every part

- **Coverage headroom is ~0.1 pt** on statements (floors 17 / 11 / 21 / 16
  in `apps/native/vitest.config.ts`). There is no render harness, so a
  screen's JSX is uncovered by construction. Every decision therefore lives
  in a `lib/` module with a test, and screens only wire those modules to
  the UI. The gate is checked after every part; if it fails, more logic
  moves out of the screen, never the other way round.
- **Fans (signed out) must reach the legal links** — two taps from launch.
  Home → Profile is one tap today, so Profile is the natural host, with the
  sign-in screen as the second host because it is where a Fan meets the
  app's first form.
- **Prefs go through `lib/local-storage.ts`** (AsyncStorage), never
  SecureStore. New keys follow the `snake_case` pattern of `locale_pref`
  and `biometric_lock_enabled`.
- **Strings exist in `de.json` and `en.json`**; `i18n/locales.test.ts`
  keeps the two in parity. i18n-js interpolation is `%{name}`.
- **New routes are declared three times**: the file under `src/app/`, the
  `Stack.Screen` in `app/_layout.tsx`, and `APP_ROUTES` in
  `lib/nav/href.ts` (`lib/nav/routes.test.ts` fails when the three
  disagree). Session-gated routes are also listed in that test.
- **Docs move with the code**: `apps/native/PRE-LAUNCH.md` and
  `RELEASES.md` are corrected in the same commit as the change they
  describe.

## Part 1 — `expo-doctor` 20/20 (#231)

`npx expo install --fix` in `apps/native` moves the eight lagging packages
onto the SDK 57 pins. `expo-constants` is also pinned by the `overrides`
block in `pnpm-workspace.yaml`, so that override is bumped to the same
version in the same commit; otherwise pnpm resolves two copies and the
"duplicate native modules" check fails instead.

Verification: `pnpm --filter @dragons/native check:doctor` prints 20/20,
tests and typecheck pass, lockfile committed. `RELEASES.md` "`expo doctor`
gates the build" loses its 19/20 paragraph.

## Part 2 — `ios.privacyManifests` and `locales` (#232)

`app.json` gains:

```json
"ios": {
  "infoPlist": { "CFBundleAllowMixedLocalizations": true, ... },
  "privacyManifests": {
    "NSPrivacyTracking": false,
    "NSPrivacyAccessedAPITypes": [
      { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults", "NSPrivacyAccessedAPITypeReasons": ["CA92.1"] },
      { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp", "NSPrivacyAccessedAPITypeReasons": ["C617.1"] },
      { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategorySystemBootTime", "NSPrivacyAccessedAPITypeReasons": ["35F9.1"] },
      { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryDiskSpace", "NSPrivacyAccessedAPITypeReasons": ["85F4.1", "E174.1"] }
    ]
  }
},
"locales": { "de": "./locales/de.json", "en": "./locales/en.json" }
```

`apps/native/locales/{de,en}.json` each hold `NSFaceIDUsageDescription`
(German: "Mit Face ID die Dragons-App entsperren"). The four API
categories are the union of what react-native, async-storage,
expo-constants, expo-device, expo-localization, expo-notifications,
expo-file-system and expo-application declare in their own manifests
(verified in `node_modules` on 2026-08-25).

Tests (`lib/app-config.test.ts`): tracking is `false`; each of the four
categories is present with its reason codes; `locales` names `de` and `en`;
each named file exists and carries a non-empty `NSFaceIDUsageDescription`;
mixed localizations are on. PRE-LAUNCH: the privacy item becomes "done,
read the ITMS-91053 mail after the first upload".

## Part 3 — Rechtliches and support entry (#233)

New module `lib/legal/links.ts`:

- `LEGAL_LINKS = { privacy: "https://hbdragons.de/datenschutz", imprint: "https://hbdragons.de/impressum" }`
- `SUPPORT_MAILBOX = "app@hbdragons.de"`, `PRIVACY_MAILBOX = "datenschutz@hbdragons.de"`
- `buildMailto({ to, subject, body })` — percent-encodes subject and body
  (`encodeURIComponent`), joins with `?subject=…&body=…`.
- `buildSupportMailto({ version, build, platform })` — subject
  `Dragons App <version> (<build>) <platform> — Support`.
- `appVersionLabel({ version, build })` — `"1.0.0 (5)"`, falling back to
  `"dev"` when both are null (Expo Go / tests).

New module `lib/legal/app-version.ts`: reads
`Application.nativeApplicationVersion` / `nativeBuildVersion` from
`expo-application` (new SDK dependency, installed with `expo install`;
it is a native module, which is fine because a rebuild is owed anyway).
Kept separate from `links.ts` so the pure module stays free of native
imports in tests.

New component `components/LegalSection.tsx`: `SectionHeader`
"Rechtliches" plus four rows — Datenschutz, Impressum, Support (mail),
and a non-interactive version line. Rows are `Pressable` with
`accessibilityRole="link"`, opening via `Linking.openURL`. Optional
`children` slot so Profile can append the deletion row (Part 4) inside
the same group.

Wiring: `app/profile.tsx` renders `<LegalSection />` in both the
signed-out and the signed-in branch, below the language segment.
`app/(auth)/sign-in.tsx` renders a caption footer "Datenschutz · Impressum"
under the "no account" hint, using the same `LEGAL_LINKS`.

Tests: `links.test.ts` (URLs are https on the club domain; mailto encoding
of umlauts, spaces and newlines; version label with and without build);
`lib/nav/architecture.test.ts` gains one assertion that both
`profile.tsx` and `sign-in.tsx` import `LegalSection` or `LEGAL_LINKS`,
which is the "reachable signed out" guarantee in the absence of a render
harness.

Strings: `legal.title`, `legal.privacy`, `legal.imprint`, `legal.support`,
`legal.version` (`Version %{version}`), in both locales.

## Part 4 — Account-deletion request (#234)

`lib/legal/links.ts` adds `buildDeletionMailto({ email, version })` →
`mailto:datenschutz@hbdragons.de` with subject
`Dragons App: Konto löschen — <email>` and a body that names the account,
the app version, and that the club deletes the account and its device
tokens within 30 days.

UI: inside the signed-in Profile's `LegalSection`, a final row "Konto
löschen beantragen" in `colors.destructive`; tapping opens the mail. Fans
never see it (the signed-out branch renders `LegalSection` without
children).

Site: `apps/site/src/pages/konto-loeschen/index.astro` — Layout, PageHeader,
one paragraph on how to request deletion (mail or the in-app action),
what is deleted, the 30-day window, and the Datenschutz link. Strings via
`lib/strings.ts` (`strings.kontoLoeschen.*`, plus `strings.seo.kontoLoeschen`).

Review notes: new `apps/native/STORE-LISTING.md` with a "Review notes"
section (club-provisioned accounts, no in-app password reset, the deletion
request path, KI-Assistent is Staff-only, Face ID optional, universal-link
domain). #245 later fills the listing copy in the same file.

Tests: `links.test.ts` covers the deletion mailto; the site's existing
page tests, if any, gain the new page the same way the other legal pages
are covered.

## Part 5 — KI disclosure on the assistant (#235)

Strings: `assistant.title` → "KI-Assistent" / "AI assistant";
`assistant.open` → "Den KI-Assistenten fragen" / "Ask the AI assistant";
new `assistant.notice.title`, `assistant.notice.body` (three sentences:
answers are generated by Google Gemini; they can be wrong — check
schedules against the official source; enter no other person's personal
data), `assistant.notice.acknowledge` ("Verstanden" / "Got it"),
`assistant.hint` ("Antworten erzeugt Google Gemini und können Fehler
enthalten." / "Answers are generated by Google Gemini and may be wrong.").

New module `lib/assistant/ai-notice.ts`:

- `AI_NOTICE_KEY = "assistant_ai_notice_ack"`, value `"1"`.
- `readAiNoticeAcknowledged(): Promise<boolean>` /
  `acknowledgeAiNotice(): Promise<void>` over `localStorage`.
- `resolveNoticeState({ loaded, acknowledged })` →
  `"pending" | "show" | "hidden"` — pure, so the screen has no branching
  of its own.

Screen: a small `useAiNotice()` hook (in `hooks/`) loads the flag once and
exposes `{ state, acknowledge }`. While `state !== "hidden"` the
`ListEmptyComponent` is a `AiNoticeCard` (title, body, "Verstanden"
button) instead of `EmptyState`, and `ChatComposer` receives
`disabled` (new prop, greys the send button and ignores `onSend`). Once
acknowledged the normal empty state and composer return. The permanent
hint is a caption line rendered under the composer inside the same
`KeyboardStickyView` block, visible in every state.

ADR `docs/adr/0005-ai-assistant-transparency.md`: the club is the provider
of the "KI-Assistent" AI system for AI Act Art. 50(1) (transparency
obligation only, not high-risk); the notice is shown before the first
interaction and acknowledged explicitly; the wording is quoted; the same
duty applies to the web widget (#236).

Tests: `ai-notice.test.ts` (state table; storage round trip with a mocked
`localStorage`); `ChatComposer` gets a pure `composerState({ busy,
disabled, hasText })` helper if it does not already have one, tested;
`locales.test.ts` parity covers the new keys automatically.

## Part 6 — Push pre-permission (#237)

Today `registerForPush()` calls `requestPermissionsAsync` itself the
moment a session exists. Two changes:

`lib/push/registration.ts`:

- `getPushPermissionStatus(): Promise<"granted" | "denied" | "undetermined">`
  (maps `getPermissionsAsync`; `canAskAgain === false` counts as denied).
- `registerForPush()` no longer requests. It returns early unless the
  status is `granted`. A new `requestPushPermissionAndRegister()` does the
  OS prompt and, on grant, registers — the only place the prompt is
  triggered.

New module `lib/push/pre-prompt.ts`:

- `PUSH_PROMPT_DEFERRED_KEY = "push_prompt_deferred"`.
- `decidePushFlow({ isDevice, signedIn, status, deferred })` →
  `"register" | "prompt" | "none"`: not a device or signed out → none;
  granted → register; undetermined and not deferred → prompt; otherwise
  none.
- `readPushPromptDeferred()` / `deferPushPrompt()` / `clearPushPromptDeferral()`
  over `localStorage`.

Hook `hooks/usePushRegistration.ts`: on a session, evaluate
`decidePushFlow` and either call `registerForPush()` or
`router.push("/push-permission")`. The route opens once per sign-in
session (a ref guards re-entry while the sheet is up).

New route `app/push-permission.tsx`, presented as a form sheet
(`formSheetOptions` with `HALF_THEN_FULL`, no native header, grabber,
swipe-dismiss = "Später"). Content: title, four short points (what the
club sends; delivered via Expo's push service to Apple/Google; token
deleted on sign-out; switch off any time in system settings), primary
button "Benachrichtigungen aktivieren" → `requestPushPermissionAndRegister()`
→ dismiss; secondary "Später" → `deferPushPrompt()` → dismiss. A swipe
dismiss also defers, so the sheet never nags.

Profile (signed in): a "Benachrichtigungen" row under the biometric
section showing the status; tap → `undetermined`: open the sheet (and clear
the deferral); `denied`: `Linking.openSettings()`; `granted`:
`Linking.openSettings()` too, since that is where it is switched off.
The status text comes from `pushStatusLabelKey(status)` in `pre-prompt.ts`.

Route bookkeeping: `Stack.Screen name="push-permission"` in
`app/_layout.tsx` using `formSheetOptions({ name: "push-permission",
detents: [0.5, 1] })`; `APP_ROUTES["/push-permission"]`; the route joins
the session-gated list in `routes.test.ts`.

Strings: `push.title`, `push.point1`–`point4`, `push.enable`, `push.later`,
`push.statusGranted` / `statusDenied` / `statusUndetermined`,
`push.settingsRow`.

Tests: `pre-prompt.test.ts` (decision table, deferral round trip, status
labels); `registration.test.ts` updated — `registerForPush` never calls
`requestPermissionsAsync`; `requestPushPermissionAndRegister` does, and
registers only on grant; `handler.test.ts` untouched.

PRE-LAUNCH: the push section notes the pre-permission step; RELEASES
"Current state" untouched (JS-only).

## Part 7 — `apple-app-site-association` (#248)

Static file `apps/web/public/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["2ZDTV3KLV2.de.hbdragons.app"],
        "components": [
          { "/": "/en/*", "exclude": true },
          { "/": "/admin/*", "exclude": true },
          { "/": "/profile", "exclude": true },
          { "/": "/schedule*" }, { "/": "/standings*" }, { "/": "/teams*" },
          { "/": "/team/*" }, { "/": "/game/*" }, { "/": "/h2h/*" }
        ]
      }
    ]
  }
}
```

The proxy's matcher (`/((?!_next|api|.*\..*).*)`) already skips dotted
paths, so the file bypasses the locale and session redirects. Next.js
serves extension-less public files as `application/octet-stream`, so
`next.config.ts` `headers()` gains a rule for
`/.well-known/apple-app-site-association` setting
`Content-Type: application/json` (kept in the same array as the security
headers).

Test `apps/web/src/aasa.test.ts`: parses the file; the single `appIDs`
entry equals `<ios.appleTeamId>.<ios.bundleIdentifier>` read from
`apps/native/app.json` (drift guard for the team conversion); every
`PUBLIC_PATH_PREFIXES` entry that maps to an app route
(`/schedule`, `/standings`, `/teams`, `/team`, `/game`, `/h2h`) is
claimed; `/en/*` and `/admin/*` are excluded; the header rule exists in
`next.config.ts` with the JSON content type.

Manual verification (recorded in PRE-LAUNCH, not automatable here):
`curl -sSI https://app.hbdragons.de/.well-known/apple-app-site-association`
after deploy → 200, `application/json`, no redirect; then Apple's CDN
endpoint and a tapped link on a post-#217 device build.

## Order and commits

One commit per part, in the order above: 1 first because it changes the
lockfile everything else builds on; 2 next because it is config only;
3 → 4 → 5 → 6 touch Profile in turn; 7 is independent and last. Every
commit passes `pnpm --filter @dragons/native typecheck`, `lint`,
`coverage`, `check:doctor`, `pnpm check:ai-slop`, and — for part 7 —
`pnpm --filter @dragons/web test`.

## Error handling

- `Linking.openURL` rejections are caught in one `openExternal` helper and
  surfaced with a system `Alert` (`legal.openFailed`); nothing crashes
  because a device has no mail client.
- Push: every Expo call keeps its existing try/catch; the sheet closes on
  any outcome so a permission failure cannot strand the user in it.
- AI notice: a failed storage read counts as "not acknowledged" (the
  safe direction — one extra notice, never a missing one).
