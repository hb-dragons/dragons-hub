# iOS navigation and native-component integration in React Native / Expo — state of the art, August 2026

Research notes to ground an upcoming audit of `apps/native`. This documents what a
well-built Expo iOS app is expected to use as of August 2026, area by area, with
primary sources. It does not audit the app; it only records where the app's pinned
versions sit relative to the state of the art.

**Where `apps/native` stands** (`apps/native/package.json`): `expo ~55.0.0`,
`expo-router ~55.0.0`, `react-native 0.83.4`, `react-native-screens ~4.23.0`,
`expo-glass-effect ~55.0.11`, `expo-haptics ~55.0.14`, `@gorhom/bottom-sheet ^5.2.14`,
`@react-navigation/native ^7.2.4`. No `expo-symbols`, no `zeego`, no `@expo/ui`.

**SDK landscape**: the current Expo SDK is **57** (released June 30, 2026, React
Native 0.86, described as a non-breaking upgrade from 56 — [SDK 57
changelog](https://expo.dev/changelog/sdk-57)). Before it: [SDK 56](https://expo.dev/changelog/sdk-56)
(May 21, 2026, RN 0.85, Expo Router decoupled from React Navigation, Expo UI stable),
[SDK 55](https://expo.dev/changelog/sdk-55) (February 25, 2026, RN 0.83, React 19.2,
New Architecture only), [SDK 54](https://expo.dev/changelog/sdk-54) (September 10,
2025, iOS 26 / Liquid Glass support, native tabs introduced). The app is on SDK 55 —
**two SDK releases behind current**. npm dist-tags as of 2026-08-11: `expo@latest =
57.0.12`, `react-native-screens@latest = 4.27.0` (verified against the npm registry).

---

## 1. Expo Router and native tabs

**What it is.** Expo Router is Expo's file-based router; the entry point
`expo-router/entry` and an `app/` directory of layouts is the standard app skeleton.
Since SDK 55, all Expo packages — including `expo-router` — carry the SDK's major
version: "As of SDK 55, all Expo SDK packages use the same major version as the SDK"
([SDK 55 changelog](https://expo.dev/changelog/sdk-55)). So `expo-router@55.x` is the
SDK 55 router, `56.2.x` the SDK 56 router, `57.0.x` current.

**Model change in SDK 56.** Expo Router was decoupled from React Navigation: the
changelog describes the decision for "Expo Router to fork the parts of React
Navigation that it builds around," with a codemod
(`npx expo-codemod sdk-56-expo-router-react-navigation-replace`) to migrate imports
([SDK 56 changelog](https://expo.dev/changelog/sdk-56)). Direct
`@react-navigation/*` imports in an Expo Router app are now migration debt.
`react-native-screens` remains the native layer underneath (see §2).

**SDK 55 router additions** ([SDK 55 changelog](https://expo.dev/changelog/sdk-55)):
a Colors API for Material 3 styling, the Apple Zoom shared-element transition on iOS,
the `Stack.Toolbar` API for iOS header/toolbar items, experimental SplitView support,
and form-sheet footers on Android. SDK 57 extended `Stack.Toolbar.Badge` placements
([SDK 57 changelog](https://expo.dev/changelog/sdk-57)).

**Native tabs.** `expo-router/unstable-native-tabs` exports `NativeTabs`, which
renders the platform's real tab bar (UITabBarController on iOS) instead of a
JS-drawn one. Introduced in SDK 54 — "Beta support for native tabs on iOS and
Android. Unlike the JS tabs implementation, this enables liquid glass tabs, automatic
scrolling on tab press, and many other beautiful native effects" ([SDK 54
changelog](https://expo.dev/changelog/sdk-54)). The docs currently classify it as
**alpha**: "Native tabs is in alpha and is available in SDK 54 and later. Its API is
subject to change" ([Native tabs guide](https://docs.expo.dev/router/advanced/native-tabs/)).
SDK 55+ uses compound components (`NativeTabs.Trigger.Label` / `.Icon` / `.Badge`).

iOS capabilities ([Native tabs guide](https://docs.expo.dev/router/advanced/native-tabs/),
[API reference](https://docs.expo.dev/versions/latest/sdk/router/native-tabs/)):
SF Symbols icons via the `sf` prop (with `{ default, selected }` variants), badges,
a dedicated search tab role (iOS 26 with Xcode 26), `minimizeBehavior="onScrollDown"`
(the iOS 26 tab-bar minimize effect), automatic Liquid Glass tab bar with
scroll-edge transparency (`disableTransparentOnScrollEdge` to opt out),
`DynamicColorIOS` for adaptive label/icon colors, and a `BottomAccessory` floating
control slot (SDK 55+). Limitations: no measuring of tab-bar height, no nested
native tabs, no runtime add/remove of tabs, and "a limit of 5 tabs on Android".

**Expected in Aug 2026**: expo-router with native tabs for top-level navigation on
iOS (accepting the alpha label), or at minimum a deliberate, documented choice of the
JS `Tabs` where its constraints don't fit. **Outdated markers**: a JS tab bar
hand-styled to imitate iOS; `@react-navigation/bottom-tabs` mounted directly; missing
the iOS 26 behaviors (minimize on scroll, glass tab bar) that native tabs give for free.

## 2. react-native-screens and the native stack

**What it is.** `react-native-screens` is "native navigation primitives for your
React Native app" ([repo](https://github.com/software-mansion/react-native-screens)) —
it exposes real `UINavigationController` / Fragment containers to React. The native
stack navigator built on it "provides a way for your app to transition between screens
where each new screen is placed on top of a stack," using `UINavigationController` on
iOS, so "animations and gestures are handled by the platform, resulting in smoother
transitions and better performance" than the JS stack ([React Navigation native-stack
docs](https://reactnavigation.org/docs/native-stack-navigator/)). It is the only way
to get real iOS large titles, native back-swipe, form sheets, and
UISearchController headers.

**Current state.** Latest stable is 4.27.0, with `5.0.0-alpha.2` on the `next` tag
(npm, 2026-08-11). The 4.x line is Fabric-first; Paper (legacy architecture) support
was deprecated as of 4.25.0
([compatibility table](https://github.com/software-mansion/react-native-screens)).
The app pins `~4.23.0`, which is what SDK 55 prescribes.

**Recommended setup.** In an Expo Router app you get the native stack by declaring
`<Stack>` in a layout — "Expo Router's Stack is built on React Navigation's Native
Stack Navigator" ([Stack guide](https://docs.expo.dev/router/advanced/stack/)).
`expo-router/js-stack` exists as the explicit opt-out for full header control; using
it is a trade of native behavior for customization and should be the exception. In a
bare React Navigation app the equivalent is `createNativeStackNavigator` from
`@react-navigation/native-stack` (v7).

**Expected**: native stack everywhere, `fullScreenGestureEnabled` where full-width
back-swipe is wanted, `headerLargeTitle` on root list screens (with a ScrollView /
FlatList child using `contentInsetAdjustmentBehavior="automatic"` — [native-stack
docs](https://reactnavigation.org/docs/native-stack-navigator/)). **Outdated**: the JS
stack (`@react-navigation/stack`), custom header components re-implementing what
native options provide, `headerTransparent` + `headerBlurEffect` hacks where iOS 26
now supplies the treatment by default.

## 3. iOS 26 Liquid Glass

**What Apple ships.** Liquid Glass is the system-wide material introduced with
iOS 26. Adoption of it in navigation chrome is automatic for standard components:
"If your app uses standard components from SwiftUI, UIKit, or AppKit, your interface
picks up the latest look and feel on the latest platform releases" when built against
the latest SDKs ([Adopting Liquid
Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)).
Navigation sits in the glass layer: "Key navigation elements like tab bars and
sidebars float in this Liquid Glass layer," tab bars can minimize on scroll, toolbars
gain scroll-edge effects, and Apple tells you to "reduce your use of custom
backgrounds in controls and navigation elements" because they interfere with the
material (same page).

**It is no longer optional to build against it.** "Since April 28, 2026 — Apps
uploaded to App Store Connect must be built with Xcode 26 or later using an SDK for
iOS 26" ([Apple upcoming
requirements](https://developer.apple.com/news/upcoming-requirements/)). The
`UIDesignRequiresCompatibility` Info.plist key is the sanctioned temporary opt-out —
"Temporarily use this key while reviewing and refining your app's UI" — and "the
system ignores this key when you build for iOS 27 or later"
([UIDesignRequiresCompatibility](https://developer.apple.com/documentation/bundleresources/information-property-list/uidesignrequirescompatibility)).
So by August 2026 every shipping app is glass-rendered on iOS 26 devices; the only
question is whether it was designed for it.

**What Expo did.** SDK 54 was the Liquid Glass release: EAS Build defaults SDK 54+
projects to Xcode 26; Icon Composer `.icon` files are wired through
`"ios": { "icon": "./assets/app.icon" }`; native tabs and native-stack chrome pick up
glass automatically; and `expo-glass-effect` was introduced for custom surfaces
([SDK 54 changelog](https://expo.dev/changelog/sdk-54)). SDK 55 added that "form
sheets automatically adopt the Liquid Glass design language with no code changes" on
iOS 26+ ([SDK 55 changelog](https://expo.dev/changelog/sdk-55)).

**expo-glass-effect** ([docs](https://docs.expo.dev/versions/latest/sdk/glass-effect/))
provides `GlassView` and `GlassContainer` (built on `UIVisualEffectView`), with
`glassEffectStyle` (`'clear'` / `'regular'`), `tintColor`, `isInteractive`, and the
`isLiquidGlassAvailable()` / `isGlassEffectAPIAvailable()` runtime checks. "GlassView
is only available on iOS 26 and above. It will fallback to regular View on
unsupported platforms." Known pitfall: "setting opacity to 0 on GlassView or any of
its parent views causes the glass effect to not render at all." Apple's guidance
bounds its use: apply glass to custom controls "sparingly" and keep it out of the
content layer ([Adopting Liquid
Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)).

**Expected**: built on SDK 54+ (the app's SDK 55 qualifies), Liquid Glass accepted
rather than suppressed, an Icon Composer icon, no custom backgrounds behind headers or
tab bars, `expo-glass-effect` reserved for genuinely custom floating surfaces.
**Outdated**: `UIDesignRequiresCompatibility: true` still set (it dies with the
iOS 27 SDK), opaque hard-colored headers/tab bars, screenshots that still show the
pre-26 flat chrome.

## 4. SF Symbols

**First-party way**: `expo-symbols`, providing `SymbolView` — SF Symbols on iOS/tvOS
and, in current releases, Material Symbols on Android/web via a platform-keyed `name`
plus `fallback` ([expo-symbols docs](https://docs.expo.dev/versions/latest/sdk/symbols/)).
It supports rendering modes (`monochrome`, `hierarchical`, `palette`, `multicolor`),
`animationSpec`, `weight`, and `scale`. Status: the library "is currently in beta and
subject to breaking changes" (same page). SDK-aligned versions exist for the app's
SDK (`expo-symbols@55.0.9` on the `sdk-55` dist-tag).

SF Symbols also flow through the navigation primitives directly: native tabs take an
`sf` icon prop ([Native tabs guide](https://docs.expo.dev/router/advanced/native-tabs/)),
and the HIG explicitly nudges this: "Consider using SF Symbols to provide familiar,
scalable tab bar icons… Prefer filled symbols or icons for consistency with the
platform" ([HIG: Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)).

**Expected**: SF Symbols for tab icons, toolbar buttons, and menu item icons on iOS.
**Outdated**: icon-font packs (`@expo/vector-icons` / Ionicons / FontAwesome) as the
iOS chrome iconography, or PNG tab icons where a symbol exists.

## 5. Native sheets with detents

**Status: shipped and stable** in the native stack. `presentation: 'formSheet'` maps
to `UIModalPresentationFormSheet` with the full `UISheetPresentationController`
detent system exposed as props: `sheetAllowedDetents` (ascending fraction array such
as `[0.25, 0.5, 0.75]`, or `'fitToContents'`), `sheetInitialDetentIndex`,
`sheetGrabberVisible`, `sheetCornerRadius`, `sheetLargestUndimmedDetentIndex`
(non-modal sheets), `sheetExpandsWhenScrolledToEdge` ([native-stack
docs](https://reactnavigation.org/docs/native-stack-navigator/)). Expo Router
documents the same options on `Stack.Screen`; on Android, "native stack headers and
nested stack navigators are not supported inside form sheet screens", and SDK 55 made
`flex: 1` content work with numeric detents on iOS ([Expo Router modals
guide](https://docs.expo.dev/router/advanced/modals/)). On iOS 26, form sheets pick
up Liquid Glass with no code changes ([SDK 55 changelog](https://expo.dev/changelog/sdk-55)).

This matches the HIG's sheet model: "sheets resize according to their detents… the
system defines two detents: large… and medium"; "include a grabber in a resizable
sheet"; support swipe-to-dismiss ([HIG:
Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)).

**Expected**: route-level sheets via `presentation: 'formSheet'` + detents (or
`@expo/ui`'s `BottomSheet`, stable since SDK 56 — [SDK 56
changelog](https://expo.dev/changelog/sdk-56)). **Outdated marker**: JS-drawn sheet
libraries (`@gorhom/bottom-sheet`, `react-native-modal`) for standard
present-a-task sheets — they reimplement detents in JS, don't get Liquid Glass, and
sit outside the navigation state. (JS sheets remain defensible for persistent
non-route surfaces like a mini-player.) Note: the app currently ships
`@gorhom/bottom-sheet ^5.2.14`.

## 6. Context menus and native menus

**De-facto standard**: [zeego](https://zeego.dev/start) — `DropdownMenu` and
`ContextMenu` with a Radix-style composable API, rendering real native menus via
`react-native-ios-context-menu` + `react-native-ios-utilities` on iOS and
`@react-native-menu/menu` on Android; it "will not work with Expo Go" (dev build
required). Maintenance caveat: the latest release is v3.0.6, published 2025-03-21
(npm registry), and its documented compatibility statement stops at RN 0.76/0.77 and
"Expo SDK 52+" with the New Architecture ([zeego
releases](https://github.com/nandorojo/zeego/releases)) — verify against RN 0.83+
before adopting.

**First-party options** have been catching up:
- Expo Router `Link` gained "iOS view controller previews, transitions, and context
  menu items" in SDK 54 ([SDK 54 changelog](https://expo.dev/changelog/sdk-54)) —
  native link previews with menu actions, no third-party library.
- `@expo/ui` (SwiftUI-backed) includes `ContextMenu` and `Menu` components
  ([Expo UI docs](https://docs.expo.dev/versions/latest/sdk/ui/)); note the SDK 56
  stable-component list (`Host`, `Row`, `Column`, `ScrollView`, `Text`, `TextInput`,
  `Button`, `Switch`, `Slider`, `Checkbox`, `BottomSheet`) does not include them, so
  treat the menu components as pre-stable ([SDK 56 changelog](https://expo.dev/changelog/sdk-56)).

**When to use them — HIG.** A context menu "provides access to functionality that's
directly related to an item, without cluttering the interface", revealed by touch and
hold; keep items few and relevant; "always make context menu items available in the
main interface, too" (they're hidden by default); hide unavailable items rather than
dimming them; put destructive actions last and mark them destructive; iOS menus can
show a content preview ([HIG: Context
menus](https://developer.apple.com/design/human-interface-guidelines/context-menus)).
General menu anatomy — labels, icons for common actions, one level of submenu, small/
medium/large layouts via `UIMenu.preferredElementSize` — is on [HIG:
Menus](https://developer.apple.com/design/human-interface-guidelines/menus).

**Expected**: native menus (zeego or Expo's primitives) for item-level actions and
overflow "More" buttons. **Outdated**: `ActionSheetIOS`/action-sheet libraries or
hand-rolled long-press modals where a context menu belongs.

## 7. Searchable navigation headers

`headerSearchBarOptions` on the native stack mounts a real `UISearchController` in
the header: options include `placement` (`automatic`, `stacked`, `inline`,
`integrated`, `integratedButton`, `integratedCentered` — the `integrated*` values are
the iOS 26 toolbar-integrated styles), `hideWhenScrolling`, `obscureBackground`,
`placeholder`, `onChangeText`, and an imperative ref (`focus`, `blur`, `setText`,
`clearText`) ([native-stack docs](https://reactnavigation.org/docs/native-stack-navigator/)).
Expo Router exposes the same option on its Stack ([Stack
guide](https://docs.expo.dev/router/advanced/stack/)). The alternative entry point is
a dedicated search tab: native tabs' search role places it separated at the trailing
end on iOS 26 ([Native tabs guide](https://docs.expo.dev/router/advanced/native-tabs/)).

HIG framing: "If search is important, give it a primary position in your app or
view"; the three iOS placements are a tab-bar search tab (two styles: a standard tab
that lands on a search page, or a button appearance that focuses the field
immediately), a toolbar field (bottom preferred when there's room), or an inline
field over the list it filters ([HIG: Search
fields](https://developer.apple.com/design/human-interface-guidelines/search-fields),
[HIG: Searching](https://developer.apple.com/design/human-interface-guidelines/searching)).

**Expected**: list screens that filter/search use `headerSearchBarOptions` (or a
search tab). **Outdated**: a styled `TextInput` row pinned above a list pretending to
be a search bar — no scroll-away, no cancel animation, no keyboard management.

## 8. Haptics

**expo-haptics** ([docs](https://docs.expo.dev/versions/latest/sdk/haptics/)) is the
stable first-party wrapper over `UIFeedbackGenerator`: `impactAsync` with
`ImpactFeedbackStyle` `Light` / `Medium` / `Heavy` / `Rigid` / `Soft`,
`notificationAsync` with `Success` / `Warning` / `Error`, `selectionAsync`, and the
Android-only `performAndroidHapticsAsync` with granular `Vibrator` constants. iOS
suppresses haptics in Low Power Mode, when the user disables system haptics, and
while camera/dictation are active (same page).

HIG rules ([Playing
haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)):
"Use system-provided haptic patterns according to their documented meanings" — the
three iOS categories are notification (task outcomes), impact (physical-metaphor
collisions/snaps), and selection (changing values); use haptics consistently so each
pattern keeps one meaning; "avoid overusing haptics"; pair them with matching visual
feedback; keep the app usable with haptics off.

**Expected**: selection feedback on pickers/segment changes, notification haptics on
sync success/failure–type outcomes, impact on meaningful snaps — and nothing on every
tap. **Outdated**: `Vibration.vibrate()`, or no haptics at all on interactive
surfaces where system components would have played them.

## 9. Apple HIG on navigation — the idiomatic shape

The pages that define idiomatic iOS navigation in the iOS 26 HIG:

- **[Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)** —
  "A tab bar lets people navigate between top-level sections of your app." "Use a tab
  bar to support navigation, not to provide actions." Keep the tab count small, avoid
  the More/overflow tab, never hide or disable tabs ("the exception is when a modal
  view covers the tab bar"), label every tab, badge only critical info. iOS 26: "a
  tab bar floats above content at the bottom of the screen" on a Liquid Glass
  background, can minimize on scroll (with an attached accessory like Music's
  MiniPlayer), and "can include a dedicated search tab at the trailing end."
- **[Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)** —
  this page absorbed the old navigation-bars page (the HIG URL
  `/navigation-bars` now redirects to `/toolbars`): "In iOS, a navigation-specific
  toolbar is sometimes called a navigation bar." Standard Back/Close symbols, title
  in the bar, actions grouped leading/center/trailing, `.prominent` style for the one
  primary action, and "use a large title to help people stay oriented as they
  navigate and scroll" — large title collapsing to standard on scroll.
- **[Modality](https://developer.apple.com/design/human-interface-guidelines/modality)** —
  "Present content modally only when there's a clear benefit." Keep modal tasks
  short; avoid an app-within-an-app; "always give people an obvious way to dismiss a
  modal view"; confirm before discarding user content; one modal at a time.
- **[Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)** —
  the default modal vehicle for scoped tasks: detents (medium for progressive
  disclosure), grabber, swipe-to-dismiss, Cancel on the leading edge / Done trailing.
- **[Searching](https://developer.apple.com/design/human-interface-guidelines/searching)** /
  **[Search fields](https://developer.apple.com/design/human-interface-guidelines/search-fields)** —
  one clearly identified search location; search as a tab, in a toolbar (bottom
  preferred), or inline; suggestions and scope bars.

Summarized: a small set of persistent tabs, each owning a navigation stack with
large-title push navigation; sheets with detents for scoped tasks; search as a tab or
native header field; context menus for item actions. That is exactly the surface the
native-tabs + native-stack pairing in §§1–2 renders through real UIKit.

## 10. React Native New Architecture — what it changes here

React Native 0.82 (October 8, 2025) "is the first version of React Native that runs
exclusively on the New Architecture" — legacy-arch opt-outs are ignored
([RN 0.82 blog](https://reactnative.dev/blog/2025/10/08/react-native-0.82)). Expo
followed one release later: SDK 55 dropped Legacy Architecture support entirely and
removed `newArchEnabled` ([SDK 55 changelog](https://expo.dev/changelog/sdk-55); see
also [Expo's New Architecture guide](https://docs.expo.dev/guides/new-architecture/)).

Consequences for this problem space:

- **It's a prerequisite, already met.** Everything above (native tabs, Stack.Toolbar,
  glass effects, Expo UI) is built Fabric-first; being on SDK 55/RN 0.83 means the
  app cannot be on the old architecture.
- **Library floor.** `react-native-screens` 4.x deprecated Paper support at 4.25.0
  ([repo](https://github.com/software-mansion/react-native-screens)); any navigation
  or menu dependency without New Architecture support is dead weight. This is the
  axis on which to evaluate stale libraries (e.g. zeego's compatibility statement,
  §6).
- **No behavioral migration work remains** for navigation specifically — the risk is
  only third-party components still relying on the interop layer, which the RN team
  says will eventually be removed ([RN 0.82 blog](https://reactnative.dev/blog/2025/10/08/react-native-0.82)).

---

## Audit checklist

Concrete things to look for in `apps/native` (or any Expo iOS app) to judge it
against August 2026 expectations:

1. **SDK currency**: `expo` at 57.x? (App: 55.x — two behind; SDK 56→57 was
   advertised as non-breaking, but 55→56 includes the Expo Router / React Navigation
   codemod.)
2. **Tabs**: does the tab layout use `NativeTabs` from
   `expo-router/unstable-native-tabs` with `sf` symbol icons — or a JS `Tabs` /
   `@react-navigation/bottom-tabs` bar? Is there a dedicated search tab or
   `minimizeBehavior` where the design calls for it?
3. **Stack**: `<Stack>` from expo-router everywhere (no `js-stack`, no
   `@react-navigation/stack`); `headerLargeTitle` on root list screens with
   `contentInsetAdjustmentBehavior="automatic"`; no custom header components that
   re-build native affordances.
4. **Direct `@react-navigation/*` imports**: each one is SDK 56 codemod debt
   (`@react-navigation/native`, `@react-navigation/elements` in the app's
   package.json are the smell to chase).
5. **Sheets**: scoped tasks presented via `presentation: 'formSheet'` +
   `sheetAllowedDetents` + `sheetGrabberVisible`? Flag `@gorhom/bottom-sheet` uses
   that are really route-shaped sheets.
6. **Search**: any screen with a filter/search UI — is it `headerSearchBarOptions`
   (or a search tab), or a hand-rolled `TextInput`?
7. **Liquid Glass**: no `UIDesignRequiresCompatibility: true` in app config; no
   opaque custom backgrounds behind headers/tab bar; `expo-glass-effect` used only
   for custom floating surfaces and never with animated opacity-to-zero; app icon is
   an Icon Composer `.icon` file, not a flat PNG.
8. **Icons**: SF Symbols (`expo-symbols` / `sf` props) for chrome iconography; flag
   icon-font packs on iOS surfaces.
9. **Menus**: item-level actions behind native context menus (zeego, `Link` previews
   with menu items, or `@expo/ui`), destructive items marked and listed last, every
   menu action also reachable in the main interface.
10. **Haptics**: `expo-haptics` calls match HIG semantics — notification for
    outcomes, selection for value changes, impact for snaps — not decorative
    everywhere, not absent entirely.
11. **Dependency health**: `react-native-screens` at the SDK-prescribed version;
    every nav/menu/gesture dependency has a New Architecture-compatible release newer
    than ~2025 (zeego's last release: March 2025).
