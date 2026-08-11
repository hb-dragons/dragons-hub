# Pre-launch checklist

Items deferred while the app is in internal-testing phase. Work through
this list before submitting to the public App Store / Play Store.

Last reviewed: 2026-08-11 (issue #213 — the Expo SDK 57 upgrade; this pass
corrected the items #118 had left describing an app that no longer exists).
Before that: 2026-07-26 (issue #118).

---

## Store-review blockers

### Unused permissions + camera plugin — resolved (#118)

The app used to declare camera/mic permissions with no code using them.
Fixed: `ios.infoPlist.NSCameraUsageDescription`, the `"expo-camera"`
plugin entry, `android.permission.CAMERA`, and
`android.permission.RECORD_AUDIO` are all removed from `app.json`, and
the `expo-camera` dependency is gone from `package.json`.

`android.permission.USE_FINGERPRINT` is still declared alongside
`USE_BIOMETRIC` — unverified whether it's still needed for pre-API-28
support; left as-is pending a decision.

### Push notifications — already committed, live in code

Was documented here as "half-wired" with no caller. That's no longer
true: `lib/push/registration.ts` calls `Notifications.getPermissionsAsync`
/ `requestPermissionsAsync` / `getExpoPushTokenAsync` and
`deviceApi.register`; `lib/push/handler.ts` wires the foreground handler
and notification-tap deep-linking. Both have test coverage
(`registration.test.ts`, `handler.test.ts`).

The `plugins/remove-push-entitlement.js` this section used to reference
does not exist — there is no `apps/native/plugins/` directory at all, so
there's nothing stripping the iOS `aps-environment` entitlement.

Remaining, still-open:

- [ ] Confirm the iOS Associated Domains entitlement and an Apple push
      cert / Firebase config are set up via EAS for production push.
- [ ] Verify APNs / FCM credentials exist for the production EAS profile
      (`eas credentials`).

### iOS universal links

Android has an intent filter for `https://app.hbdragons.de`; iOS does
not. Without the entitlement iOS silently opens the link in Safari.

- [ ] Add to `app.json > ios`:
  ```json
  "associatedDomains": ["applinks:app.hbdragons.de"]
  ```
- [ ] Host `/.well-known/apple-app-site-association` on
      `app.hbdragons.de` with the app's `TeamID.bundleId` and path
      patterns.

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

- [ ] Verify `PrivacyInfo.xcprivacy` covers every SDK you use (Better
      Auth client, any analytics you add, etc.). Apple requires this.
- [ ] Draft privacy policy URL — App Store Connect requires a live URL
      at submit time.
- [ ] Confirm `ITSAppUsesNonExemptEncryption: false` is still true; if
      you add any crypto beyond HTTPS, this flips.

---

## Account / ownership

- [ ] EAS account: migrate from `eshamounskerto` (personal) to a club-
      owned org account. Transfer the project before first public
      release — ownership transfers post-launch are painful.
- [ ] App Store Connect: create the app under the club's Apple
      Developer Program account, not a personal one.
- [ ] Google Play Console: same — club-owned developer account.

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
- [ ] Segment controls + filter pills expose
      `accessibilityState={{ selected: boolean }}`.
- [ ] Score cards read something meaningful, not just digits (e.g.
      `"Dragons 75 vs Rhein Stars 62, final"`).
- [ ] VoiceOver + TalkBack smoke test on the top 5 screens.
- [ ] Minimum tappable area ≥ 44×44 on all interactive elements.
- [ ] Color contrast: verify destructive red + muted text meet WCAG AA
      on both light and dark palettes.

---

## Testing — corrected (#118), corrected again (#213)

This used to say "native has zero tests" and that `lint` was just
`tsc --noEmit`. Both were stale: there are 36 `*.test.ts(x)` files under
`src/`, and `lint` runs real ESLint (`eslint .`) separate from
`typecheck` (`tsc --noEmit`).

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
- [ ] Pause inactive-segment SWR in `schedule/index.tsx` and
      `officiating/index.tsx` (`isPaused: segment !== "upcoming"` etc).
      Right now the other segment's 1000-item fetch fires on mount and
      is thrown away.
- [ ] Fix memoised cards: `MatchCardFull` / `MatchCardCompact` /
      `TeamCard` are `memo`-wrapped but callers pass inline
      `onPress={() => router.push(...)}`, defeating memo. Either
      `useCallback` the handler in the parent or change the card API to
      take an `id` + wrap `router.push` internally via a stable
      callback.

### Polish

- [x] ~~Extract the `SegmentedControl` component duplicated in
      `schedule.tsx` and `referee.tsx`.~~ Done — both tab roots render
      `components/ui/Segmented.tsx`, which wraps the platform control.
- [ ] Extract `getResultBadge` + `resolveName` (duplicated in
      `MatchCardFull` and `MatchCardCompact`) into a shared match
      helper.
- [ ] Add a `withAlpha(hex, 0.1)` helper; replace inline
      `colors.primary + "1A"` / `"0D"` / `"60"` etc. across the
      codebase.
- [x] ~~Move `ErrorUtils.setGlobalHandler` in `_layout.tsx` from
      module-scope into a `useEffect(..., [])` so fast-refresh doesn't
      chain handlers in dev.~~ Resolved (#213): it lives in
      `lib/global-error-handler.ts`, installing returns the restore
      function, and the effect's cleanup runs it.
- [ ] Fix pluralisation in `home.countdown.inDays` — `"In 1 Tagen"` is
      wrong German. Use i18n-js plural rules or handle 1 vs n
      explicitly.
- [ ] `LocaleProvider` currently remounts the entire subtree on locale
      change (`Fragment key={locale}`). Works but clobbers scroll
      position and dismisses modals. Replace with a per-render i18n
      reader via context value.

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
