# Pre-launch checklist

Items deferred while the app is in internal-testing phase. Work through
this list before submitting to the public App Store / Play Store.

Last reviewed: 2026-04-21.

---

## Store-review blockers

### Remove unused permissions + camera plugin

The app declares camera/mic permissions but no code uses them. Apple
rejects unused purpose strings; Google flags unused dangerous perms.

**`app.json`:**

- [ ] Remove `ios.infoPlist.NSCameraUsageDescription`.
- [ ] Remove `"expo-camera"` entry from `plugins` (including its options
      block).
- [ ] Remove `android.permission.CAMERA` from `android.permissions`.
- [ ] Remove `android.permission.RECORD_AUDIO` from `android.permissions`.
- [ ] Remove `android.permission.USE_FINGERPRINT` — deprecated API 28+;
      `USE_BIOMETRIC` covers modern devices.

**`package.json`:**

- [ ] Remove `"expo-camera"` dependency.

Run `pnpm install` after.

### Decide on push notifications

Currently half-wired: `expo-notifications` is a dep, `notification.icon`
+ `color` are configured, but `plugins/remove-push-entitlement.js` strips
the iOS `aps-environment` entitlement and no code calls
`Notifications.*` or `deviceApi.register`.

Pick one:

- [ ] **Commit to push:** wire token registration (call
      `deviceApi.register` after session + permission grant), remove
      `plugins/remove-push-entitlement`, add iOS Associated Domains
      entitlement, create Apple push cert + Firebase config via EAS.
- [ ] **Remove:** drop `expo-notifications` dep, the `notification`
      block in `app.json`, the `notification-icon.png` asset, and the
      `./plugins/remove-push-entitlement` plugin entry.

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

### Unused Expo modules

No code imports these — trims bundle, avoids perms prompts.

- [ ] Remove from `package.json` (and their `app.json` plugin entries
      if any): `expo-camera`, `expo-web-browser`, `expo-network`.
      Reassess `expo-notifications` based on the push decision above.

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
- [ ] Wire it into `_layout.tsx` global handler and `ErrorBoundary`.
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

## Testing

Native has zero tests. Monorepo enforces 90/95% on `apps/api`; native
is exempt but shouldn't be forever.

- [ ] Unit-test pure functions: `partitionGames`, `groupByDate`,
      `claimErrorMessage`, `dropErrorMessage`.
- [ ] Unit-test hooks: `useBiometricLock`, `useAppearanceMode`,
      `useLocale` (SecureStore / Appearance mocked).
- [ ] Add one Maestro flow: launch → browse schedule → open a game →
      sign in → open referee tab.
- [ ] Wire into CI (currently `pnpm --filter @dragons/native lint` is
      just `tsc --noEmit` — add a real ESLint run + vitest).

---

## Code hygiene

### Pre-launch-ish (bundle size / perf)

- [ ] Move `react-native-svg-transformer` from `dependencies` to
      `devDependencies` in `apps/native/package.json`.
- [ ] Replace SecureStore with AsyncStorage for non-secret prefs
      (`theme_mode`, `locale_pref`, `biometric_lock_enabled`).
      Keychain / Keystore round-trips slow cold start.
- [ ] Flatten `team/[id].tsx`: the nested `<FlatList scrollEnabled=
      false>` inside `<Screen>`'s ScrollView defeats virtualization.
      Convert to a single `<FlatList>` with `ListHeaderComponent`.
- [ ] Pause inactive-segment SWR in `schedule.tsx` and `referee.tsx`
      (`isPaused: segment !== "upcoming"` etc). Right now the other
      segment's 1000-item fetch fires on mount and is thrown away.
- [ ] Fix memoised cards: `MatchCardFull` / `MatchCardCompact` /
      `TeamCard` are `memo`-wrapped but callers pass inline
      `onPress={() => router.push(...)}`, defeating memo. Either
      `useCallback` the handler in the parent or change the card API to
      take an `id` + wrap `router.push` internally via a stable
      callback.

### Polish

- [ ] Extract the `SegmentedControl` component duplicated in
      `schedule.tsx` and `referee.tsx`.
- [ ] Extract `getResultBadge` + `resolveName` (duplicated in
      `MatchCardFull` and `MatchCardCompact`) into a shared match
      helper.
- [ ] Add a `withAlpha(hex, 0.1)` helper; replace inline
      `colors.primary + "1A"` / `"0D"` / `"60"` etc. across the
      codebase.
- [ ] Move `ErrorUtils.setGlobalHandler` in `_layout.tsx` from
      module-scope into a `useEffect(..., [])` so fast-refresh doesn't
      chain handlers in dev.
- [ ] Fix pluralisation in `home.countdown.inDays` — `"In 1 Tagen"` is
      wrong German. Use i18n-js plural rules or handle 1 vs n
      explicitly.
- [ ] `LocaleProvider` currently remounts the entire subtree on locale
      change (`Fragment key={locale}`). Works but clobbers scroll
      position and dismisses modals. Replace with a per-render i18n
      reader via context value.

### Tech debt to watch

- [ ] `expo-router/unstable-native-tabs` is unstable API. Abstract into
      a local `<AppTabs>` component so the eventual migration touches
      one file.
- [ ] Experimental `RNS_GAMMA_ENABLED=1` in `ios/Podfile` — re-evaluate
      when RN Screens ships a stable replacement.

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
