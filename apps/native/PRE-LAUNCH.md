# Pre-launch checklist

Items deferred while the app is in internal-testing phase. Work through
this list before submitting to the public App Store / Play Store.

Last reviewed: 2026-08-25 — the release-readiness audit in
`docs/2026-08-25-app-store-release-readiness.md` (technical, App Store
Connect, DE/EU legal, accounts). Its §6 corrections are applied below. The
audit, not this file, tracks the store forms and the legal texts; this file
stays the engineering checklist. Before that: 2026-08-11 (issue #213 — the
Expo SDK 57 upgrade; this pass corrected the items #118 had left describing
an app that no longer exists) and 2026-07-26 (issue #118).

---

## Store-review blockers

### Unused permissions + camera plugin — resolved (#118)

The app used to declare camera/mic permissions with no code using them.
Fixed: `ios.infoPlist.NSCameraUsageDescription`, the `"expo-camera"`
plugin entry, `android.permission.CAMERA`, and
`android.permission.RECORD_AUDIO` are all removed from `app.json`, and
the `expo-camera` dependency is gone from `package.json`.

`android.permission.USE_FINGERPRINT` is still declared alongside
`USE_BIOMETRIC` in `app.json`. Whether it is needed is moot: the
`expo-local-authentication` config plugin adds both permissions at prebuild
regardless (`plugin/build/withLocalAuthentication.js`), and the module's
own `AndroidManifest.xml` declares them too. The two `app.json` lines are
redundant, not a decision.

### Push notifications — already committed, live in code

Was documented here as "half-wired" with no caller. That's no longer
true: `lib/push/registration.ts` calls `Notifications.getPermissionsAsync`
/ `requestPermissionsAsync` / `getExpoPushTokenAsync` and
`deviceApi.register`; `lib/push/handler.ts` wires the foreground handler
and notification-tap deep-linking. Both have test coverage
(`registration.test.ts`, `handler.test.ts`).

Since #237 the OS prompt is no longer fired from `registerForPush`. Sign-in
opens `app/push-permission.tsx` — a form sheet explaining what the club
sends, that Expo delivers it to Apple/Google, that the token dies on
sign-out and how to switch it off — and only its "Aktivieren" button calls
`requestPushPermissionAndRegister`. Every way out of the sheet — "Später",
swipe, back, or "Aktivieren" itself completing — writes the per-device
deferral (`push_prompt_deferred`); a deferral written right after a grant is
inert, since `decidePushFlow` checks the OS status first. Profile's
"Mitteilungen" row reopens the
sheet or, once the OS has answered, opens the system settings. § 25(1)
TDDDG is the reason; the decision table is `lib/push/pre-prompt.ts`.

The `plugins/remove-push-entitlement.js` this section used to reference
does not exist — there is no `apps/native/plugins/` directory at all, so
there's nothing stripping the iOS `aps-environment` entitlement.

Remaining, still-open:

- [ ] Confirm an Apple push cert / Firebase config are set up via EAS
      for production push. (The Associated Domains entitlement this
      item used to bundle in is a universal-links concern, not a push
      one — it now has its own section below.)
- [ ] Verify APNs / FCM credentials exist for the production EAS profile
      (`eas credentials`). Known on 2026-08-25: there is no
      `google-services.json` and no FCM V1 key has been uploaded, so
      Android push is not wired at all. A build without it still runs —
      `lib/push/registration.ts` catches the token failure and logs a
      warning — but no Android device will ever register.

### iOS universal links — entitlement landed (#217), not yet active

- [x] ~~Add `ios.associatedDomains` to `app.json`.~~ Resolved (#217):
      `"associatedDomains": ["applinks:app.hbdragons.de"]`, the same
      origin the Android intent filter has always auto-verified.
      `lib/app-config.test.ts` compares the two lists and fails if a
      host is claimed on one platform only.
- [x] ~~Host `/.well-known/apple-app-site-association` on
      `app.hbdragons.de`.~~ Shipped in `apps/web/public/.well-known/` with a
      JSON content-type rule in `next.config.ts` (#248);
      `apps/web/src/aasa.test.ts` reads the team and bundle id from
      `app.json`. Still to verify after the next web deploy — the curl
      checks below, Apple's CDN, and a tapped link on a post-#217 device
      build. `app.hbdragons.de` is the Next.js web service,
      so the file goes in `apps/web/public/.well-known/` with a
      `headers()` rule serving `application/json`; `assetlinks.json` sits
      next to it (Android's `autoVerify: true` is already declared and
      silently fails without it — its SHA-256 must be Play's app signing
      key, not the upload key). **This is the activation step**, and it
      is a web-property ticket, not this app's: until that file is live the
      entitlement changes nothing user-visible, because iOS asks for the
      file before it ever routes a link to the app. Landing the native
      side first is deliberate — the entitlement is compiled into the
      binary, so it has to be in a build *before* the web side goes
      live, and it is inert until then.

The file must contain the app's `TeamID.de.hbdragons.app` under
`applinks.details[].appIDs` plus the path patterns to claim. Which paths
is the companion ticket's call, but note how the two URL spaces line up:

- The web app's default locale (`de`) carries **no** URL prefix
  (`next-intl`, `localePrefix: "as-needed"`), so `/schedule`,
  `/standings`, `/teams`, `/team/:id`, `/game/:id` and `/h2h/:id` are
  the same path in the browser and in the app. Universal links to those
  land on the matching screen with no mapping layer: expo-router strips
  the origin off an `https://` launch URL and routes the rest of the
  path as-is (`fork/extractPathFromURL.ts`).
- `/en/...` is the same page in English and matches **no** app route —
  it would open `+not-found`. Either leave `/en/*` out of the claimed
  paths (it opens in Safari, which is correct today) or add
  `app/+native-intent.ts` with a `redirectSystemPath` that strips the
  locale segment. Decide it in the companion ticket; do not claim
  `/en/*` without one of the two.
- Session-gated web surfaces (`/admin/*`, `/profile`, …) are worth
  excluding: the app can route them, but a signed-out tap only reaches
  the sign-in screen.

Verification once the file ships (none of this can be checked from this
repo — it needs a device build and the live origin):

```bash
# 1. Served as JSON, HTTPS, 200, no redirect, no query string.
curl -sSI https://app.hbdragons.de/.well-known/apple-app-site-association
# 2. What Apple's CDN actually handed to devices (it caches; expect lag).
curl -sS https://app-site-association.cdn-apple.com/a/v1/app.hbdragons.de
```

- Install a build made **after** this entitlement landed — an OTA update
  cannot add an entitlement, so a pre-#217 binary will keep opening
  Safari no matter what the AASA says.
- On device: paste a claimed link into Notes/Messages and tap it, or
  `xcrun simctl openurl booted https://app.hbdragons.de/game/1`. Typing
  the URL into Safari deliberately does *not* trigger a universal link.
- Settings → Developer → Universal Links → Diagnostics reports what iOS
  resolved for the domain. To bypass Apple's CDN cache while iterating,
  temporarily claim `applinks:app.hbdragons.de?mode=developer` and turn
  on Associated Domains Development in the same menu.
- EAS: the entitlement needs the Associated Domains capability on the
  provisioning profile. `eas build` syncs capabilities from the
  entitlement; if a build fails with a profile that does not include
  `com.apple.developer.associated-domains`, regenerate it via
  `eas credentials`.

### Unused Expo modules — resolved (#118), corrected (#213)

`expo-camera` and `expo-web-browser` had zero imports and are removed
from `package.json`. `expo-network` turned out to have a real caller
(`lib/swr-native-adapters.ts`, `lib/api.ts` — network-state-aware SWR
reconnect) and was kept.

This section used to claim `expo-linking` was removed on the same
"zero imports" rationale. It never was, and it must not be: zero
imports in our source does not mean unused. `expo-router` declares
`expo-linking` a **required** peer (not optional in
`peerDependenciesMeta`) and calls it directly — `Linking.getLinkingURL`
in `getInitialURL`, `Linking.addEventListener` in `subscribe`,
`Linking.openURL` for external redirects. Dropping it was re-checked on
SDK 57 (#213) and `expo doctor` fails immediately:

```
✖ Check that required peer dependencies are installed
Missing peer dependency: expo-linking — Required by: expo-router
Your app may crash outside of Expo Go without this dependency.
```

`expo-updates` is the other zero-import dependency and stays for the
same kind of reason — it is the OTA infrastructure `RELEASES.md`
describes, driven by the config plugin rather than by an import.

### Android adaptive icon — monochrome

Android 13+ themed icons look bad without a monochrome layer.

- [ ] Generate a single-color monochrome PNG (same silhouette as the
      adaptive icon foreground, white on transparent).
- [ ] Add to `app.json > android.adaptiveIcon`:
  ```json
  "monochromeImage": "./assets/adaptive-icon-mono.png"
  ```

### Privacy / compliance

- [x] ~~Add the app-level `ios.privacyManifests` key to `app.json`.~~ Done
      (#232): the manifest declares UserDefaults `CA92.1`, FileTimestamp
      `C617.1`, SystemBootTime `35F9.1` and DiskSpace `85F4.1`/`E174.1`
      (expo-file-system) with `NSPrivacyTracking: false`, and
      `lib/app-config.test.ts` pins all five. Still open: read the
      ITMS-91053 mail after the first upload of a new build and add any
      API Apple flags; keep the App Store Connect privacy label in step
      (audit §2.2).
- [x] `locales` declares de + en with a translated Face ID prompt and
      `CFBundleAllowMixedLocalizations` is on (#232), so the binary is no
      longer English-only to iOS Settings and the store.
- [ ] Privacy policy URL — App Store Connect requires a live URL at
      submit time. Decided 2026-08-25: the app links to
      hbdragons.de/datenschutz, and that page needs a "Dragons App"
      section first (audit §3.2 lists the 13 items). Today it describes
      the website only.
- [x] `ITSAppUsesNonExemptEncryption: false` — verified 2026-08-25: HTTPS,
      Keychain and the OS Face ID prompt only. Flips if any crypto beyond
      HTTPS is added.
- [ ] What the store forms and DE/EU law ask for beyond this file —
      ~~the in-app Impressum / Datenschutz / support entry~~ (done, #233:
      `components/LegalSection.tsx` on Profile signed in and out, plus the
      sign-in footer; `lib/nav/architecture.test.ts` pins both), ~~an
      account-deletion request~~ (done, #234: Profile row +
      hbdragons.de/konto-loeschen + review notes in `STORE-LISTING.md`),
      ~~the chatbot's AI disclosure (AI Act Art. 50(1))~~ (done, #235, ADR 0005), ~~the push
      pre-permission text~~ (done, #237), EU DSA trader status (non-trader), the age
      rating, the Gemini paid tier — lives in the audit (§1.2, §2, §3)
      and is not duplicated here.

---

## Account / ownership

- [ ] EAS account: migrate from `eshamounskerto` (personal) to a club-
      owned org account. Transfer the project before first public
      release — ownership transfers post-launch are painful.
- [ ] Apple: the harder half, which this list used to skip. Team
      `2ZDTV3KLV2` (the `appleTeamId` in `app.json`) is the maintainer's
      personal membership, and the bundle id `de.hbdragons.app` has been
      locked to it since the April 2026 TestFlight uploads; with no
      released version, Apple's app-transfer path is closed. Decided
      2026-08-25: ask Apple Developer Support to convert the membership
      into an organization membership for the e.V. — keeps the Team ID,
      the bundle id and the App Store Connect record, so `appleTeamId`
      stays correct. Needs the club's D-U-N-S number (requested
      2026-08-25). Fallback: a fresh organization enrollment plus a new
      bundle id. Do not ship v1.0 under a personal name. Audit §4.2.
- [ ] App Store Connect: create the app under that organization team,
      not a personal one.
- [ ] Google Play Console: club-owned organization account. It needs the
      same D-U-N-S number.

---

## Observability

### Crash reporting

Currently only `console.warn` + NSLog. Release-build crashes are
invisible.

- [ ] Pick a service (Sentry, Bugsnag, Crashlytics) and create a
      project for the org.
- [ ] Wire it into `lib/global-error-handler.ts` and `ErrorBoundary`.
- [ ] Upload source maps via EAS build hook (e.g. the Sentry Expo
      config plugin) so stack traces symbolicate.

### Analytics (optional)

If product wants event tracking: decide tool, wire via a thin wrapper
hook so you can swap providers. Add to `PrivacyInfo.xcprivacy`.

---

## Accessibility pass

Testers will tolerate rough a11y; public reviewers may not. Audit
before launch:

- [ ] All `Pressable`s get an `accessibilityRole` and
      `accessibilityLabel`.
- [x] Segment controls + filter pills expose
      `accessibilityState={{ selected: boolean }}`. Done in #218: both pill
      families (`FilterPill`, board `FilterChips`) build their props with
      `filterPillA11y` in `src/lib/ui/a11y.ts`, and a test fails the build
      if either stops using it. Segment controls need nothing — `Segmented`
      wraps the platform `SegmentedControl`, which carries its own traits.
      Still open elsewhere: the board's column pills are a pager selector,
      not a filter, and announce no selected state.
- [ ] Score cards read something meaningful, not just digits (e.g.
      `"Dragons 75 vs Rhein Stars 62, final"`).
- [ ] VoiceOver + TalkBack smoke test on the top 5 screens.
- [ ] Minimum tappable area ≥ 44×44 on all interactive elements.
- [ ] Color contrast: verify destructive red + muted text meet WCAG AA
      on both light and dark palettes.

---

## Testing — corrected (#118), corrected again (#213)

This used to say "native has zero tests" and that `lint` was just
`tsc --noEmit`. Both were stale: there are 60 `*.test.ts(x)` files under
`src/` (counted 2026-08-25), and `lint` runs real ESLint (`eslint .`) separate from
`typecheck`.

`typecheck` is the one package script in the repo that is not plain
`tsc --noEmit`: it runs `expo customize tsconfig.json` first (#217). That
is the CLI's no-dev-server path to regenerating
`.expo/types/router.d.ts`, which is what turns expo-router's `Href` into
the union of this app's routes. The file is gitignored — it is generated
from the route tree, so committing it would just be a second copy to
keep in sync — and without it every `router.push(...)` would be checked
against `string` and pass. `lib/nav/href.ts` carries a type-level
assertion that fails the build if the generation ever silently no-ops,
so the enforcement cannot quietly disappear.

The coverage paragraph then went stale in turn. It quoted 48% branches /
27% functions / 49% lines / 48% statements and said coverage only
instruments `src/lib/**/*.ts`. Both were true until the 2026-07-26
rescope (#109) widened `coverage.include` to all of `src/**`. The live
floors are in `vitest.config.ts` — read them there rather than here —
and they are much lower numbers *because they measure much more*:
`components/`, `app/`, `hooks/` and `theme/` used to be invisible to the
gate. They ratchet up; never lower them.

There is still no React-render test harness (logic-first vitest; RN/Expo
are mocked per test, no component rendering), so what those percentages
buy is coverage of pure logic plus the structural tests in
`src/lib/nav/` that assert against the route tree and source tree
themselves.

Still open:

- [ ] Unit-test pure functions: `partitionGames`, `groupByDate`,
      `claimErrorMessage`, `dropErrorMessage`.
- [ ] Add a render harness (e.g. `@testing-library/react-native`) so
      hooks like `useBiometricLock`, `useAppearanceMode`, `useLocale`
      and screens can get real test coverage instead of only their pure
      helper functions.
- [ ] Add one Maestro flow: launch → browse schedule → open a game →
      sign in → open referee tab.

---

## Code hygiene

### Pre-launch-ish (bundle size / perf)

Two items resolved by #118: `react-native-svg-transformer` moved to
`devDependencies` (it's a build-time Metro transformer, not a runtime
dep); `theme_mode`, `locale_pref`, `biometric_lock_enabled` and the
board filter/sort prefs moved off SecureStore onto plain AsyncStorage
(`@/lib/local-storage`) — Keychain/Keystore round-trips no longer sit on
the cold-start path for these. The auth session token is still on
SecureStore (it's an actual secret).

- [x] ~~Flatten `team/[id].tsx`: the nested `<FlatList scrollEnabled=
      false>` inside `<Screen>`'s ScrollView defeats virtualization.~~
      Done — it is a single `<FlatList>` with `ListHeaderComponent`
      inside `<Screen scroll={false}>`. #216 added a check to
      `lib/nav/architecture.test.ts` so no screen re-nests one: besides
      the virtualization cost, the outer ScrollView is what a native
      large title would track instead of the list.
- [x] ~~Pause inactive-segment SWR in `schedule/index.tsx` and
      `officiating/index.tsx` (`isPaused: segment !== "upcoming"` etc).
      Right now the other segment's 1000-item fetch fires on mount and
      is thrown away.~~ Done in Schedule — each `useSWR` key is `null`
      unless its segment is showing, so the hidden one never fetches and
      SWR still renders the cached response on the way back. Never
      applied to Officiating: it makes one `refereeApi.getGames` call
      and partitions the result across all three segments.
- [x] ~~Fix memoised cards: `MatchCardFull` / `MatchCardCompact` /
      `TeamCard` are `memo`-wrapped but callers pass inline
      `onPress={() => router.push(...)}`, defeating memo. Either
      `useCallback` the handler in the parent or change the card API to
      take an `id` + wrap `router.push` internally via a stable
      callback.~~ Done — Home, Schedule, Teams, team detail and
      head-to-head each pass a `useCallback`-stable handler.

### Polish

- [x] ~~Extract the `SegmentedControl` component duplicated in
      `schedule.tsx` and `referee.tsx`.~~ Done — both tab roots render
      `components/ui/Segmented.tsx`, which wraps the platform control.
- [ ] Extract `getResultBadge` + `resolveName` into a shared match
      helper. Both are duplicated in `MatchCardFull` and
      `MatchCardCompact`, and `ResultChip.tsx:19` carries a third
      `getResultBadge` with a different return shape.
- [ ] Add a `withAlpha(hex, 0.1)` helper; replace inline
      `colors.primary + "1A"` / `"0D"` / `"60"` etc. across the
      codebase.
- [x] ~~Move `ErrorUtils.setGlobalHandler` in `_layout.tsx` from
      module-scope into a `useEffect(..., [])` so fast-refresh doesn't
      chain handlers in dev.~~ Resolved (#213): it lives in
      `lib/global-error-handler.ts`, installing returns the restore
      function, and the effect's cleanup runs it.
- [x] ~~Fix pluralisation in `home.countdown.inDays` — `"In 1 Tagen"` is
      wrong German.~~ Done — `getCountdown` in `(tabs)/index.tsx` returns
      `home.countdown.today` / `.tomorrow` for 0 and 1 day, so `inDays`
      only ever renders with n ≥ 2.
- [x] ~~`LocaleProvider` currently remounts the entire subtree on locale
      change (`Fragment key={locale}`).~~ Done — `useLocale.ts` no longer
      wraps children in `key={locale}`; the comment in `useTheme.tsx`
      (`useTheme()`) records why a context subscription replaces the
      remount.

### Tech debt to watch

- [x] ~~`expo-router/unstable-native-tabs` is unstable API. Abstract
      into a local `<AppTabs>` component so the eventual migration
      touches one file.~~ Resolved (#213):
      `components/nav/AppTabs.tsx` is the wrapper, and
      `lib/nav/architecture.test.ts` fails the build if a second file
      imports the module.
- [ ] This is a managed-workflow Expo project (no `ios/`/`android/`
      directories checked in — native config lives entirely in
      `app.json` and is applied by `expo prebuild`/EAS build). If a
      future need forces a bare-workflow eject, re-audit any Podfile /
      Gradle patches added at that point; there's nothing to watch yet.
      Both directories are in `.gitignore`, so a local `apps/native/ios`
      left behind by an `expo prebuild` / `expo run:ios` is invisible to
      the repo *and* to everyone else's checkout — but it is not
      invisible to your build, which will use the stale copy instead of
      re-applying `app.json`. Delete it by hand (`rm -rf
      apps/native/ios apps/native/android`) after any change to
      `app.json` native keys or the plugin list.

---

## Launch-day preflight

- [ ] Build `production` profile for both platforms: `eas build
      --profile production --platform all`.
- [ ] Verify `EXPO_PUBLIC_API_URL` points at prod and the prod API is
      up + stable.
- [ ] Submit via `eas submit --profile production` to both stores.
- [ ] Confirm `runtimeVersion` — every version bump requires a new
      binary, so decide the first public version before building.
- [ ] Draft App Store / Play Store listing copy, screenshots, keywords.
      Neither store accepts a submission without these.
- [ ] Live privacy policy URL.
- [ ] Tag the release in git (`git tag native-v1.0.0 && git push
      --tags`).
- [ ] Publish the first `production`-channel OTA with a smoke message
      so the update pipeline is warm before public install traffic.
