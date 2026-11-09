# iOS HIG and platform-convention audit — native app (2026-11-09)

Audit of `apps/native` against Apple's Human Interface Guidelines, the App Store
Review Guidelines, and current Expo / React Native capabilities. Scope, in
priority order: profile and account navigation, the sign-in flow, navigation
overall, typography and design, accessibility basics. No app code was changed.

Builds on two earlier notes and does not repeat them:
[`2026-08-11-ios-navigation-state-of-the-art.md`](./2026-08-11-ios-navigation-state-of-the-art.md)
(what native tabs, native stack, sheets, Liquid Glass and SF Symbols offer) and
[`2026-08-25-app-store-release-readiness.md`](./2026-08-25-app-store-release-readiness.md)
(store metadata, privacy, legal).

**Versions audited** (`apps/native/package.json`): `expo ~57.0.31`,
`expo-router ~57.0.29`, `react-native 0.86.3`, `react-native-screens ~4.26.0`,
`expo-symbols ~57.0.3`, `expo-haptics ~57.0.3`, `react-native-keyboard-controller 1.21.9`,
`react-native-reanimated 4.5.1`, `better-auth 1.7.15`. iOS deployment target
16.4 (`app.json`). For comparison, Bluesky's `social-app` currently pins
`expo 58.0.23` / `react-native-screens 4.30.1` (its `package.json` on `main`), so
SDK 58 is out; nothing below depends on it.

Severity legend:

- **C** — compliance: plausible App Store rejection.
- **H** — high: a user cannot find or use something the HIG says must be easy.
- **M** — medium: deviates from a stated HIG rule, users notice.
- **P** — polish.

---

## Summary — top findings by impact

| # | Sev | Finding | Where |
|---|-----|---------|-------|
| 1 | **C** (risk, not certain) | Account deletion is a pre-filled `mailto:` draft. Apple: apps "should not require people to … send an email". Whether 5.1.1(v) applies to admin-created accounts is not addressed by Apple. | `src/app/profile.tsx:226-239`, `src/lib/legal/links.ts` `buildDeletionMailto` |
| 2 | **H** | Profile (and therefore sign-out, settings and deletion) is reachable only from a custom avatar on the Home tab. The other four tab roots have no path to it. | `src/app/(tabs)/index.tsx:101-136`, `src/components/nav/TabRootStack.tsx:16-22` |
| 3 | **H** | Password AutoFill is half-wired: no `webcredentials:` associated domain, and the e-mail field is typed `emailAddress` where Apple asks for `username`. iOS can't offer the user's saved club password for this app. | `app.json` `ios.associatedDomains`, `apps/web/public/.well-known/apple-app-site-association`, `src/app/(auth)/sign-in.tsx:130-160` |
| 4 | **M** | Sign-in is a `fullScreenModal` with a hand-placed close button. HIG reserves full-screen modals for in-depth content or complex tasks; a short optional sign-in is a sheet. | `src/app/_layout.tsx:90-96`, `src/app/(auth)/sign-in.tsx:101-118` |
| 5 | **M** | The assistant modal has a header but no Close button. HIG: "Always give people an obvious way to dismiss a modal view." | `src/app/_layout.tsx:106-114` |
| 6 | **M** | Dynamic Type: text scales (RN default), but fixed-width columns and fixed-size containers will clip at accessibility sizes; body text is 15 pt against Apple's 17 pt default; nothing has been checked at AX sizes. | `src/theme/typography.ts:63-67`, `src/components/StandingsTable.tsx:98-121`, `src/app/(tabs)/index.tsx:118-125` |
| 7 | **M** | VoiceOver: section headings carry no `header` role (one in the whole app), so the rotor's Headings navigation is empty; the biometric-lock `Switch` has no label. | `src/components/SectionHeader.tsx:14`, `src/app/profile.tsx:197-201` |
| 8 | **P** | Profile duplicates system settings that the HIG says to leave to iOS: an in-app theme picker, an in-app language picker, and an opt-in biometric toggle labelled generically. | `src/app/profile.tsx:182-224` |
| 9 | **P** | Sign out is an unconfirmed tinted button; destructive account actions are not grouped. | `src/app/profile.tsx:242-256` |
| — | n/a | Sign in with Apple is **not** required (4.8 exemption: own account system only). Passkeys are optional. | — |

What already matches current platform practice, and should stay: native tabs
with SF Symbols (`src/components/nav/AppTabs.tsx:60-71`, `src/lib/nav/tabs.ts:78-115`),
native-stack large titles on tab roots (`src/lib/nav/headers.ts:38-45`),
`Stack.Toolbar` bar items and native `UIMenu` overflow
(`src/components/nav/HeaderActions.tsx:61-91`), every sheet a native form sheet
with grabber and swipe-dismiss (`src/lib/nav/sheet-routes.ts`), native
`UISegmentedControl` (`src/components/ui/Segmented.tsx:17-45`), haptics mapped
to Apple's three semantic categories (`src/lib/haptics.ts`), a 44 pt tap-target
helper used across chrome (`src/lib/ui/a11y.ts:58-87`), and no
`UIDesignRequiresCompatibility` opt-out of Liquid Glass.

---

## 1. Profile and account navigation

### 1.1 Where profile lives and how it is reached

**Current state.**
- Profile is a route on the root stack, pushed with a standard header
  (`src/app/_layout.tsx:97-105`).
- Its only entry point is a 36×36 initial-letter avatar drawn in the Home tab's
  scroll content (`src/app/(tabs)/index.tsx:101-136`; `hitSlop={8}` brings the
  touch area to 52 pt, so the size is fine).
- Home has no navigation bar at all. The other tab roots (Schedule, Standings
  or Officiating, Today, Teams) each sit in a one-screen native stack with a
  large title (`src/components/nav/TabRootStack.tsx:16-22`), and none of them
  puts anything in the bar. A signed-in referee working in Officiating has to
  switch to Home to sign out, change a setting, or find account deletion.
- Signed-in users already have five tabs (`packages/shared/src/nav-tabs.ts:12-18`).

**HIG / guideline.**
- Tab bars: "Use a tab bar to support navigation, not to provide actions" and
  "Avoid overflow tabs … the trailing tab becomes a More tab"
  ([HIG: Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)).
  A sixth "Profile" tab would push the bar into the More tab on iPhone.
- Toolbars: the trailing edge "contains important items that need to remain
  available" ([HIG: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)).
- Account deletion must be easy to discover: "Provide a clear way to initiate
  account deletion within your app … Make the link easy to discover"
  ([HIG: Managing accounts](https://developer.apple.com/design/human-interface-guidelines/managing-accounts)).
- Observation, not a written rule: Apple's own tab-based apps (App Store,
  Music, Podcasts) put an account avatar at the trailing edge of each tab's
  large-title bar and open the account screen as a sheet with a Done button.

**Recommendation.**
1. Put a profile button in the trailing toolbar of **every** tab root. The
   place to do it once is `TabRootStack`: a
   `<Stack.Toolbar placement="right">` with either
   `<Stack.Toolbar.Button icon="person.crop.circle" accessibilityLabel=…>` or,
   for the initial-letter avatar, a `<Stack.Toolbar.View>` wrapping the
   existing `Pressable`
   ([Expo: Stack toolbar](https://docs.expo.dev/router/advanced/stack-toolbar/),
   [Stack.Toolbar.View API](https://docs.expo.dev/versions/latest/sdk/router/stack/)).
   Route it through `HeaderActions` so the Android fallback stays in one place.
2. Give Home the same shape: move `(tabs)/index.tsx` under a
   `(tabs)/home/_layout.tsx` stack (or render `TabRootStack` for it) so it gets
   the bar and the same button. If the wordmark must stay, use it as the
   `headerTitle` rather than as scroll content. This removes the last tab root
   whose chrome is hand-drawn.
3. Present Profile as a page sheet with its own stack: make `app/profile/` a
   directory with `_layout.tsx` (`<Stack>`), `index.tsx` (today's
   `profile.tsx`), and push `contact`, notification settings and the deletion
   flow inside it. Register it on the root stack with `presentation: "modal"`
   (iOS page sheet; "allows for a nested stack to be rendered inside the
   screen" — [Expo Router NativeStackNavigationOptions](https://docs.expo.dev/versions/latest/sdk/router/)),
   and a trailing **Done** toolbar button. This matches the HIG sheet rules —
   one sheet at a time, Done on the trailing edge, swipe to dismiss
   ([HIG: Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)) —
   and fixes a latent issue: today `profile-contact` is a form sheet presented
   over a pushed Profile, which is fine, but over a sheeted Profile it would be
   a sheet on a sheet. Pushing it inside the Profile stack avoids that.
   Keeping Profile as a push is acceptable too; point 1 is the part that
   matters.

### 1.2 Settings structure

**Current state** (`src/app/profile.tsx`): identity card with role badges
(105-170), staff contact section (174), notifications (177-180), biometric lock
(183-204), theme segmented control (207-214), language segmented control
(217-224), legal links + deletion (227-240), sign out (243-256). Hand-built
cards and stacked sections, not an inset grouped list.

**HIG.**
- "Avoid offering an app-specific appearance setting. An app-specific
  appearance mode option creates more work for people … they may think your
  app is broken because it doesn't respond to their systemwide appearance
  choice" ([HIG: Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)).
- "Respect people's systemwide settings and avoid including redundant versions
  of them in your custom settings area" and "Minimize the number of settings
  you offer" ([HIG: Settings](https://developer.apple.com/design/human-interface-guidelines/settings)).
- "In general, avoid offering an app-specific setting for opting in to
  biometric authentication" and "Always identify the authentication method you
  offer … 'Sign In with Face ID' instead of a generic phrase"
  ([HIG: Managing accounts](https://developer.apple.com/design/human-interface-guidelines/managing-accounts)).

**Recommendation (P).**
- Theme: drop the picker on iOS, or at least keep "System" as default and move
  it lower. `userInterfaceStyle: "automatic"` is already set.
- Language: declare the locales to iOS so the per-app language appears in
  iOS Settings — `["expo-localization", { "supportedLocales": ["de", "en"] }]`
  in `app.json` plugins ([Expo: Localization guide](https://docs.expo.dev/guides/localization/),
  [expo-localization config](https://docs.expo.dev/versions/latest/sdk/localization/)) —
  and replace the segmented control with a row that opens
  `Linking.openSettings()` (already used by `PushSettingsRow`). The in-app
  picker can stay on Android if wanted.
- Biometric lock: this is an app lock, not a sign-in method, so the HIG
  sentence is guidance rather than a hard rule. If it stays, label it with the
  actual type from `LocalAuthentication.supportedAuthenticationTypesAsync()`
  ("Mit Face ID sperren"), and make the unlock button say the same instead of
  "Tap to unlock" (`src/app/_layout.tsx:165`).
- Layout: group rows the way iOS Settings does — Account (contact data,
  notifications) / App (lock) / Info (Datenschutz, Impressum, Support,
  version) / a final group with Sign out and Delete account. No new dependency
  is needed; the existing `Card` + `LegalRow` pieces can render inset groups.

### 1.3 Sign out

**Current state.** A full-width tinted destructive button, no confirmation
(`src/app/profile.tsx:242-256`); the routine itself is correct and shared with
the forced 401 path (`src/lib/auth/sign-out.ts`).

**Reference.** Bluesky puts "Sign out" as the last row of Settings, marked
destructive, behind a confirmation prompt with Cancel / Sign out
(`src/screens/Settings/Settings.tsx` lines ~299-336 on
[bluesky-social/social-app](https://github.com/bluesky-social/social-app/blob/main/src/screens/Settings/Settings.tsx)).

**Recommendation (P).** A destructive row in the last group, confirmed with
`Alert.alert(title, message, [{ style: "cancel" }, { style: "destructive" }])`.
This matters more here than in most apps because sign-out wipes the device's
push registration and cached boards for a shared device.

### 1.4 Account deletion — compliance item

**Current state.** "Konto löschen" is a `LegalRow` with `accessibilityRole="link"`
that opens a pre-filled e-mail to `datenschutz@hbdragons.de`
(`src/app/profile.tsx:226-239`, `src/lib/legal/links.ts` `buildDeletionMailto`).
If no Mail account is configured, `openExternal` shows "could not open"
(`src/lib/legal/open-external.ts:11-12`) and the user has no path at all.
The readiness audit chose this as the cheap path and flagged Apple's position
as unverified (`docs/2026-08-25-app-store-release-readiness.md` §1.2 item 4).

**Guideline.**
- 5.1.1(v): "If your app supports account creation, you must also offer
  account deletion within the app"
  ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).
- Apple's deletion page: "Apps not operating in highly regulated industries
  should not require people to make a phone call, send an email, use a chat
  support flow, or go through other support flows." Confirmation and identity
  checks are allowed; "apps that make it unnecessarily difficult … will not
  pass review." If deletion finishes on a website, "include a link directly to
  the page" ([Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)).
- The page does not address accounts created outside the app by an
  administrator. The trigger wording ("supports account creation") arguably
  does not fire, since `disableSignUp: true` and accounts are created on the
  web admin. That is an argument to make in review notes, not a guarantee.

**Recommendation.** Replace the mailto with an in-app request that needs no
mail client:
1. Row "Konto löschen" (destructive, `accessibilityRole="button"`) → a
   confirmation alert or a short form sheet explaining what is deleted, what
   the club must keep (referee assignments are federation records), and the
   30-day window. The HIG asks for exactly this: "clearly describe the
   situation … Tell people when account deletion will complete"
   ([HIG: Managing accounts](https://developer.apple.com/design/human-interface-guidelines/managing-accounts)).
2. Confirm → `POST` to a new authenticated API endpoint that records the
   request, mails the Datenschutz inbox server-side (the SMTP channel already
   exists), and returns a status the Profile row can show ("Löschung
   beantragt am …").
3. Optionally, full self-service: better-auth's `user.deleteUser` with
   `sendDeleteAccountVerification` and a `beforeDelete` hook for cleanup
   ([better-auth: Users & accounts](https://www.better-auth.com/docs/concepts/users-accounts)).
   Hard deletion is disabled by default and would need care with the user's
   links to referee and staff records, which is why a request queue is the
   better first step.

Bluesky (Settings → Account → "Delete account" dialog that sends an e-mailed
code and deletes in-app — `src/screens/Settings/AccountSettings.tsx:187-205`,
`components/DeleteAccountDialog.tsx`) and Expensify
(`src/pages/settings/Security/CloseAccount/CloseAccountPage.tsx` +
`CloseAccountValidateCodePage.tsx`,
[Expensify/App](https://github.com/Expensify/App/tree/main/src/pages/settings/Security/CloseAccount))
both do it this way: a destructive row, a confirmation step, a code, done
in-app. Worth copying in shape; both are larger than this app needs.

---

## 2. Login / auth flow

### 2.1 Presentation

**Current state.** `(auth)` is presented `fullScreenModal` with
`slide_from_bottom` (`src/app/_layout.tsx:90-96`); the inner stack hides its
header (`src/app/(auth)/_layout.tsx:4`). The screen draws its own close button
absolutely positioned at the top leading corner
(`src/app/(auth)/sign-in.tsx:101-118`) and needs special-case dismiss logic
(`sign-in.tsx:35-44`). Sign-in is optional: public content works signed out,
which is right ("Delay sign-in for as long as possible" — HIG: Managing accounts).

**HIG.** "Consider using a full-screen modal style for in-depth content or a
complex task" and "Always give people an obvious way to dismiss a modal view …
people typically expect to find a button in the top toolbar or swipe down"
([HIG: Modality](https://developer.apple.com/design/human-interface-guidelines/modality)).
"Use the standard Back and Close buttons … don't use a text label that says
Back or Close" ([HIG: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)).
Sheets: Cancel/Close on the leading edge, support swipe to dismiss
([HIG: Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)).

**Recommendation (M).** Present `(auth)` with `presentation: "modal"` (page
sheet). Show the inner stack's header (transparent, no title) and put the
close button in it:
`<Stack.Toolbar placement="left"><Stack.Toolbar.Button icon="xmark" …/></Stack.Toolbar>`.
The system then draws the glass close button, places it, and handles swipe
dismissal; the absolute positioning and inset math go away. Block swipe
dismissal only while the request is in flight (`gestureEnabled: !loading`).

### 2.2 Fields, keyboard and Password AutoFill

**Current state** (`src/app/(auth)/sign-in.tsx`):
- E-mail: `keyboardType="email-address"`, `textContentType="emailAddress"`,
  `autoComplete="email"` (130-145).
- Password: `secureTextEntry`, `textContentType="password"`,
  `autoComplete="current-password"`, return key `go` submits (147-160). Good.
- Placeholders are the only labels (132, 150).
- `KeyboardAvoidingView` from `react-native-keyboard-controller` around a
  vertically centred, non-scrolling column (97-100, 252-256).
- Server error text is shown raw for anything but invalid credentials (62).
- `app.json` `ios.associatedDomains` is `["applinks:app.hbdragons.de"]` only;
  the AASA file (`apps/web/public/.well-known/apple-app-site-association`) has
  only an `applinks` block.

**Apple.**
- "If your site uses email addresses as user names, set the input view's
  textContentType property to username, and set the keyboardType property to
  emailAddress"
  ([Enabling Password AutoFill on a text input view](https://developer.apple.com/documentation/security/enabling-password-autofill-on-a-text-input-view)).
- "Password AutoFill recommends credentials only for your app's associated
  domain"; enabling it fully means setting the content types *and* setting up
  associated domains ([Password AutoFill](https://developer.apple.com/documentation/security/password-autofill),
  [Supporting associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains),
  whose AASA example carries a `webcredentials.apps` array).
- React Native: "Avoid using both textContentType and autoComplete …
  textContentType takes precedence when both properties are set"
  ([RN TextInput](https://reactnative.dev/docs/textinput#textcontenttype-ios)).
- Text fields: "Because placeholder text disappears when people start typing,
  it can also be useful to include a separate label"
  ([HIG: Text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields)).

**Recommendation (H for autofill, P for the rest).**
1. E-mail field: `textContentType="username"` (keep
   `keyboardType="email-address"`). Use `autoComplete` only via
   `Platform.select` for Android (`"username"` or `"email"`), so iOS sees one prop.
2. Add `"webcredentials:app.hbdragons.de"` to `ios.associatedDomains` and a
   `"webcredentials": { "apps": ["<TeamID>.<bundleId>"] }` block to the AASA
   file, next to `applinks`. The web admin is where people already save the
   password, so iOS will then offer it in the QuickType bar and offer to save
   on first in-app sign-in. Extend `apps/web/src/aasa.test.ts` to assert the
   block. **Note:** the bundle identifier is changing with the new Apple
   organisation enrolment; the AASA `appIDs` and this entry must use the new
   one.
3. Wrap the form in `KeyboardAwareScrollView` (same package) so the column
   scrolls at accessibility text sizes with the keyboard up.
4. Visible field labels above the inputs (Bluesky does exactly this:
   `label={l\`Username or email address\`}`, `placeholder={null}`,
   `textContentType="username"` — `src/screens/Login/LoginForm.tsx:309-319`).
   Expensify's login field is also `textContentType="username"`
   (`src/pages/signin/LoginForm/BaseLoginForm.tsx:260-261`).
5. Map unknown server errors to a localized message instead of `error.message`.

### 2.3 Sign in with Apple — not required

Guideline 4.8 only applies to apps that use "a third-party or social login
service … to set up or authenticate the user's primary account", and lists as
the first exemption "Your app exclusively uses your company's own account setup
and sign-in systems" ([App Review Guidelines 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services)).
The app signs in with club-issued e-mail/password through better-auth and no
social provider, so nothing is needed. If Google sign-in is ever added to the
web, it must not reach the app without Sign in with Apple
(`expo-apple-authentication`) alongside it.

### 2.4 Passkeys — optional, later

The HIG now says: "If you don't use Sign in with Apple … prefer using a
passkey" ([HIG: Managing accounts](https://developer.apple.com/design/human-interface-guidelines/managing-accounts);
[Supporting passkeys](https://developer.apple.com/documentation/authenticationservices/supporting-passkeys)).
This is a preference, not a review rule. Passkeys need the same
`webcredentials` association as item 2.2.2, so doing that first is the
prerequisite either way. better-auth ships a passkey plugin; the native side
would need a WebAuthn bridge. Not worth it for a club app until autofill is
in place and someone asks.

---

## 3. Navigation overall

| Area | Current state | Platform capability | Verdict |
|---|---|---|---|
| Tab bar | `NativeTabs` (UITabBarController), SF Symbols with filled selected variants, `minimizeBehavior="onScrollDown"`, no colours on iOS so Liquid Glass shows (`AppTabs.tsx:60-71`, `tabs.ts:42,59-76`) | [Expo native tabs](https://docs.expo.dev/router/advanced/native-tabs/) | Matches. |
| Tab set | Four tabs signed out, five signed in; Officiating replaces Standings by role (`nav-tabs.ts:12-18`) | HIG: "Don't disable or hide tab bar buttons" | Acceptable: the set changes per user, not per moment. Keep at five. |
| Tab-root headers | Native stack with large title; Home has none (`TabRootStack.tsx`, `index.tsx`) | `headerLargeTitleEnabled`, `Stack.Toolbar` | Give Home a stack (see 1.1). |
| Detail pushes | Root-stack routes with transparent header, minimal back button (`headers.ts:67-86`) | native back swipe, glass | Matches. |
| Bar actions | `Stack.Toolbar.Button` + `Stack.Toolbar.Menu` on iOS (`HeaderActions.tsx:61-91`) | [Stack toolbar](https://docs.expo.dev/router/advanced/stack-toolbar/) | Matches. |
| Sheets | All route-level form sheets with detents and grabber (`sheet-routes.ts`) | [Expo Router modals](https://docs.expo.dev/router/advanced/modals/) | Matches. |
| Search | `headerSearchBarOptions` on referee assignment and board (`referee-assign.tsx:145-148`, `admin/boards/[id].tsx:343-346`) | native `UISearchController` | Matches. |
| Modals | Sign-in full-screen; assistant `modal` with header, **no close button** (`_layout.tsx:106-114`) | `Stack.Toolbar placement="left"` | Fix (M). |

**Assistant modal (M).** Add a leading or trailing Close (`xmark`) toolbar
button. With a text composer on screen, people will not discover swipe-down as
the only exit, and the HIG says "Always give people an obvious way to dismiss a
modal view" ([HIG: Modality](https://developer.apple.com/design/human-interface-guidelines/modality)).

**iPad.** `supportsTablet: true` is set. Native tabs give the iPadOS tab
bar/sidebar automatically; the custom sign-in layout and Profile cards are
untested at regular width. Check them once on an iPad simulator before release.

---

## 4. Typography and design

### 4.1 Font and Dynamic Type

**Current state.** One custom family, Bricolage Grotesque, loaded via
`expo-font` (`src/theme/typography.ts:18-23`), matching the web and site
(`packages/ui/DESIGN-SYSTEM.md` §Typography). Fixed point sizes with fixed
line heights: body 15/22, caption 13/18, label 11/14
(`typography.ts:63-80`). No `allowFontScaling`, `maxFontSizeMultiplier` or
font-scale reads anywhere in `src`. Native chrome (tab labels, large titles,
toolbar items, alerts) renders in SF Pro, content in Bricolage.

**What RN does.** `Text` and `TextInput` scale with the iOS text-size setting
by default (`allowFontScaling` defaults to true; `maxFontSizeMultiplier`
unset means no cap — [RN TextInput](https://reactnative.dev/docs/textinput#maxfontsizemultiplier)).
So the custom font does follow Dynamic Type, linearly. The risk is layout,
not scaling.

**HIG.**
- iOS default size 17 pt, minimum 11 pt, "for both custom and system fonts".
- "If you use a custom font, make sure it implements the same behaviors"
  (Dynamic Type, Bold Text).
- "Make sure your app's layout adapts to all font sizes … turn on Larger
  Accessibility Text Sizes … and confirm that your app remains comfortably
  readable"; "Keep text truncation to a minimum"; "consider using a stacked
  layout" at large sizes
  ([HIG: Typography](https://developer.apple.com/design/human-interface-guidelines/typography)).

**Findings (M).**
- Fixed-width numeric columns in the standings table (`StandingsTable.tsx:98-121,
  196-284`, widths 24-36 pt) and the quarter table (`QuarterTable.tsx:153-195`,
  72 pt) will clip or wrap digits at AX sizes.
- Fixed-size boxes holding text: the Home avatar (36×36, `index.tsx:118-125`),
  badges and chips.
- Body at 15 pt is below Apple's 17 pt default. That is a design-system choice
  shared with the web; flag it, don't silently change it.
- Bold Text: static font files mean iOS "Bold Text" has no effect on content.
  `AccessibilityInfo.isBoldTextEnabled()` can switch `fontFamilies.body` to the
  SemiBold file when it is on.

**Recommendation.**
1. Run the app once at the largest accessibility size (Settings → Accessibility
   → Display & Text Size → Larger Text) and list what breaks; fix tables with
   `minWidth` instead of `width` and allow wrapping or a stacked row layout
   above a font-scale threshold (`useWindowDimensions().fontScale`).
2. Cap only true chrome that cannot grow (scoreboard digits, table headers) with
   `maxFontSizeMultiplier` around 1.5-2; leave body and captions uncapped.
3. Decide deliberately whether native large titles should use Bricolage
   (`headerLargeTitleStyle: { fontFamily }`) or whether SF in chrome and
   Bricolage in content is the intended split. Either is defensible; today it
   is undocumented.

### 4.2 Colour and dark mode

Theme tokens with light and dark sets (`src/theme/colors.ts`), app follows the
system by default (`userInterfaceStyle: "automatic"`). The iOS header and tab
bar deliberately set no background so Liquid Glass shows
(`_layout.tsx:65-68`, `tabs.ts:47-48`) — the HIG asks for this: "Instead of
applying a solid or semi-opaque background color beneath controls, use a scroll
edge effect" ([HIG: Layout](https://developer.apple.com/design/human-interface-guidelines/layout)).
Only issue is the in-app theme override (§1.2). The unlock screen hard-codes
the dark palette (`_layout.tsx:132-170`); harmless.

### 4.3 Symbols, haptics, hit targets, safe areas

- **SF Symbols**: single wrapper `Icon` over `expo-symbols` with a role
  vocabulary (`components/ui/Icon.tsx`, `lib/ui/icons.ts`). Matches.
- **Haptics**: notification / selection / impact used per Apple's meanings,
  selection on segment change (`Segmented.tsx:38-41`). Matches
  ([HIG: Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)).
- **Hit targets**: `MIN_TAP_TARGET = 44`, `tapTargetSlop`, `TEXT_LINK_SLOP`,
  44 pt rows (`lib/ui/a11y.ts:58-87`, `LegalSection.tsx:25`,
  `ChecklistSection.tsx:73`). Matches the 44×44 pt default
  ([HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)).
- **Safe areas**: `Screen` uses `SafeAreaView` edges and native content-inset
  adjustment under headers (`components/Screen.tsx`). Matches.
- **Corner radius**: `radius.md = 4` (`theme/spacing.ts`) on buttons and
  inputs. Square-ish controls look foreign next to iOS 26's rounded glass
  chrome. Design-system decision; worth a look, not a defect.

---

## 5. Accessibility basics

| Check | State | Action |
|---|---|---|
| Labels on icon-only controls | Present: close button, avatar, toolbar items, filter pills (`sign-in.tsx:102`, `index.tsx:115-117`, `HeaderActions.tsx:68`) | none |
| Heading semantics | `SectionHeader` renders a plain `Text` (`SectionHeader.tsx:14`); one `accessibilityRole="header"` in all of `src` | Add `accessibilityRole="header"` to `SectionHeader` and screen titles drawn in content (M) |
| Switch labels | Biometric `Switch` beside a `Text`, not linked (`profile.tsx:194-201`) | `accessibilityLabel={i18n.t("profile.biometricLock")}` on the `Switch` (M) |
| Destructive row role | Deletion row is `link` (correct while it opens mail) | becomes `button` with the in-app flow |
| Live errors | Sign-in error has `accessibilityRole="alert"` + live region (`sign-in.tsx:162-170`) | none |
| Busy state | Sign-in button sets `accessibilityState.busy` (`sign-in.tsx:179`) | none |
| Brand images | `Wordmark` / `Logo` SVGs carry no accessibility props | Mark decorative (`accessibilityElementsHidden`) or label "HB Dragons" on sign-in |
| Reduce Motion | All animation is Reanimated 4, whose default is `ReduceMotion.System` — animations jump to their end state when the setting is on, including the skeleton `withRepeat` shimmer ([Reanimated: Accessibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/)) | none; keep new animations on Reanimated |

HIG reference for the Reduce Motion row: "ensure your app … responds by
reducing automatic and repetitive animations"
([HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)).

---

## 6. Reference apps — what to take

| App | What it does | Copy? |
|---|---|---|
| **Bluesky** `social-app` | Login: visible label, `textContentType="username"`, `autoComplete="username"`, `current-password`, `one-time-code` (`src/screens/Login/LoginForm.tsx:309-426`). Settings: a list with a destructive "Sign out" last row behind a confirm prompt (`src/screens/Settings/Settings.tsx`). Account deletion in Settings → Account, e-mailed code confirmed in-app (`AccountSettings.tsx:187-205`, `components/DeleteAccountDialog.tsx` calling `com.atproto.server.requestAccountDelete`). | **Yes** for the login field setup, the sign-out confirm and the deletion shape. **No** for navigation: it uses a JS bottom bar (`src/view/shell/bottom-bar/BottomBar.tsx`) with the profile as a tab, which this app has already moved past with native tabs, and its profile tab is a public profile, not an account screen. |
| **Expensify** `App` | Login field `textContentType="username"` (`src/pages/signin/LoginForm/BaseLoginForm.tsx:260-261`). Close account under Settings → Security with a reason step and a validate-code step (`src/pages/settings/Security/CloseAccount/`). | The two-step close-account flow is a good model for the confirm + request in §1.4. The rest is too large to be useful. |
| **Apple first-party apps** (App Store, Music, Podcasts) | Account avatar trailing in each tab's large-title bar → sheet with Done. | Yes; this is the shape §1.1 proposes. (Observed behaviour, not a documented HIG rule.) |

---

## 7. Prioritized action list

| Pri | Sev | Action | Files |
|---|---|---|---|
| 1 | C | Replace deletion `mailto:` with an in-app confirmed request (API endpoint + server-side mail + status in Profile). Add a review-notes sentence explaining admin-provisioned accounts. | `src/app/profile.tsx`, `src/lib/legal/links.ts`, new API route + `AGENTS.md` row |
| 2 | H | Profile button in the trailing toolbar of every tab root; give Home a stack. | `src/components/nav/TabRootStack.tsx`, `src/components/nav/HeaderActions.tsx`, `src/app/(tabs)/index.tsx` → `(tabs)/home/` |
| 3 | H | Password AutoFill: `textContentType="username"` on the e-mail field, `webcredentials:` associated domain, AASA `webcredentials` block + test (use the new bundle id). | `src/app/(auth)/sign-in.tsx`, `app.json`, `apps/web/public/.well-known/apple-app-site-association`, `apps/web/src/aasa.test.ts` |
| 4 | M | Close button on the assistant modal. | `src/app/_layout.tsx`, `src/app/assistant.tsx` |
| 5 | M | Sign-in as page sheet with native header close; `KeyboardAwareScrollView`; visible labels. | `src/app/_layout.tsx`, `src/app/(auth)/_layout.tsx`, `src/app/(auth)/sign-in.tsx` |
| 6 | M | `accessibilityRole="header"` on `SectionHeader`; label the biometric `Switch`. | `src/components/SectionHeader.tsx`, `src/app/profile.tsx` |
| 7 | M | Dynamic Type pass at AX5: tables to `minWidth`/stacked rows, selective `maxFontSizeMultiplier`, Bold Text font swap. | `src/components/StandingsTable.tsx`, `QuarterTable.tsx`, `src/theme/typography.ts` |
| 8 | P | Profile as a sheet with nested stack and Done; grouped settings; destructive sign-out row with confirmation. | `src/app/profile.tsx` → `src/app/profile/` |
| 9 | P | `expo-localization` `supportedLocales`; replace language picker with "open iOS Settings" on iOS; drop or demote the theme picker; name Face ID / Touch ID explicitly. | `app.json`, `src/app/profile.tsx`, `src/hooks/useBiometricLock.ts` |
| 10 | P | Decide large-title font and control corner radius in the design system. | `packages/ui/DESIGN-SYSTEM.md`, `src/lib/nav/headers.ts` |

Items 2, 4, 5 and 8 are one piece of navigation work and fit one PR; 1 needs
an API change and a Vorstand decision on what "deletion" means for referee
records; 3 is small but must wait for the new bundle identifier.

---

## 8. Open questions

1. **Does App Review treat admin-provisioned accounts as "supports account
   creation"?** Apple's guidance is silent. The in-app request (action 1)
   removes the question; the mailto keeps it open.
2. **What does deleting an account delete?** A user row is linked to referee
   and staff records the club must keep. Decide whether deletion unlinks and
   anonymises or removes, before choosing request-queue vs. better-auth
   `deleteUser`.
3. **Which domain hosts `webcredentials`?** The web admin's sign-in origin
   (assumed `app.hbdragons.de`) is where passwords are saved; confirm, and add
   the apex too if anyone signs in there.
4. **Keep the in-app theme and language pickers?** HIG says no for theme and
   redundant for language; Android has no per-app language UI before API 33,
   so the Android picker may stay.
5. **Profile: sheet or push?** The sheet is the Apple-app pattern; the push is
   cheaper. Either is fine once the entry point is on every tab.
6. **Brand font in native chrome?** SF in bars and Bricolage in content today.
   A design decision, not a guideline issue.
