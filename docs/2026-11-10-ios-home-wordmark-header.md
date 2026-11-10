# iOS Home header: wordmark vs. large title (2026-11-10)

Follow-up to [`2026-11-09-ios-hig-native-audit.md`](./2026-11-09-ios-hig-native-audit.md),
finding 2 / action 1.1.2, which said: "If the wordmark must stay, use it as the
`headerTitle` rather than as scroll content." That shipped as `homeHeaderOptions`
(#395), and on iOS 26 the Home bar does not look like the sibling tab roots. This
note explains why from source, records what Apple says, and revises the
recommendation. No app code was changed.

**Versions** (`apps/native/package.json:38,67`; lockfile): `expo ~57.0.31`,
`expo-router 57.0.29`, `react-native-screens 4.26.2`. Paths below abbreviate
`node_modules/.pnpm/react-native-screens@4.26.2_…/node_modules/react-native-screens/`
as `rns/` and `node_modules/.pnpm/expo-router@57.0.29_…/node_modules/expo-router/build/react-navigation/native-stack/views/`
as `er/`.

---

## Summary

| # | Finding |
|---|---------|
| 1 | Apple's guidance argues against the wordmark as the bar title: "Don't title windows with your app name" ([HIG: Toolbars › Titles](https://developer.apple.com/design/human-interface-guidelines/toolbars)) and "Resist the temptation to display your logo throughout your app" ([HIG: Branding](https://developer.apple.com/design/human-interface-guidelines/branding)). The HIG asks iOS apps to "use a large title to help people stay oriented" (Toolbars › iOS). |
| 2 | The sibling tab roots look clear because expo-router passes `backgroundColor: 'transparent'` whenever `headerLargeTitleEnabled` is on (iOS). Home has no large title, so it gets `colors.card` (`#ffffff`), and react-native-screens builds an **opaque** `UINavigationBarAppearance` for both the standard and the scroll-edge state (`er/useHeaderConfigProps.js:128-134`, `rns/ios/RNSScreenStackHeaderConfig.mm:376-390,529-556`). That is observation (a). |
| 3 | On iOS 26 the bar has no background of its own. What reads as "glass/fill" on the siblings when content scrolls under them is the **scroll edge effect** drawn by the content scroll view (`UIScrollView.topEdgeEffect`), not a bar appearance ([WWDC25 284](https://developer.apple.com/videos/play/wwdc2025/284/); [DTS answer, thread 840840](https://developer.apple.com/forums/thread/840840)). Any opaque appearance covers it. |
| 4 | react-native-screens 4.26 never leaves the system default appearance in place: `buildAppearance` always calls either `configureWithTransparentBackground` or `configureWithOpaqueBackground` (`RNSScreenStackHeaderConfig.mm:376-385`). The closest match to Apple's default is "transparent appearance + translucent bar + `scrollEdgeEffects: automatic`", which is what the siblings get. |
| 5 | The option set that feeds react-native-screens the **same** appearance inputs as the siblings, minus the large title, is `headerStyle: { backgroundColor: 'transparent' }` + `unstable_nativeProps.headerConfig.translucent: true`. It differs from `headerTransparent: true` (observation b) only in keeping the shadow, so it may show the same missing edge effect. Needs device verification. |
| 6 | **Recommendation:** give Home the same `tabRootHeaderOptions` large text title as every other tab ("Start" / "Home"), and drop the wordmark from the bar. It is the only option that is guaranteed to match the siblings (same code path), it follows the three HIG rules above, and it deletes the iOS branch in `homeHeaderOptions`. Ranked alternatives in §4. |

---

## 1. What Apple and other apps do with a brand mark on the home tab

### Apple's guidance

- **Titles.** "Don't title windows with your app name. Your app's name doesn't
  provide useful information about your content hierarchy or any window or area
  in your app, so it doesn't work well as a title." Also: "Write a concise title …
  keep the title under 15 characters"
  ([HIG: Toolbars › Titles](https://developer.apple.com/design/human-interface-guidelines/toolbars)).
  A wordmark is the app name drawn as an image, so the rule applies.
- **Large titles on iOS.** "Use a large title to help people stay oriented as they
  navigate and scroll. By default, a large title transitions to a standard title
  as people begin scrolling the content" (same page, iOS section).
- **Branding.** "Ensure branding always defers to content. Using screen space for
  an element that does nothing but display a brand asset can mean there's less
  room for the content people care about." And: "Resist the temptation to display
  your logo throughout your app or game unless it's essential for providing
  context. People seldom need to be reminded which app they're using." Brand
  colour belongs in the content layer, "where it scrolls beneath Liquid Glass
  controls" ([HIG: Branding](https://developer.apple.com/design/human-interface-guidelines/branding)).
- **Bar backgrounds.** "Reduce the use of toolbar backgrounds and tinted controls.
  Any custom backgrounds and appearances you use might overlay or interfere with
  background effects that the system provides. Instead, use the content layer to
  inform the color and appearance of the toolbar"
  ([HIG: Toolbars › Best practices](https://developer.apple.com/design/human-interface-guidelines/toolbars)).

Nothing in the HIG forbids a custom title view. UIKit supports one
(`UINavigationItem.titleView`: "Custom title views are centered on the navigation
bar and may be resized to fit" — [docs](https://developer.apple.com/documentation/uikit/uinavigationitem/titleview)),
and SwiftUI's `.principal` placement "takes precedent over a title specified
through `navigationTitle(_:)`" ([docs](https://developer.apple.com/documentation/swiftui/toolbaritemplacement/principal)).
The guidance is about what goes in the title, not whether it can be a view.

### iOS 26 title features we cannot use yet

iOS 26 adds `UINavigationItem.largeTitle`, `subtitle`, `subtitleView` and
`largeSubtitleView` (all "iOS 26.0+";
[largeTitle](https://developer.apple.com/documentation/uikit/uinavigationitem/largetitle),
[largeSubtitleView](https://developer.apple.com/documentation/uikit/uinavigationitem/largesubtitleview)).
WWDC25 shows Mail putting a filter button in `largeSubtitleView`
([WWDC25 284](https://developer.apple.com/videos/play/wwdc2025/284/)).
react-native-screens 4.26 exposes none of them (no `subtitle` in
`rns/ios/RNSScreenStackHeaderConfig.mm`), so "large title text with the crest as
a subtitle view" is not reachable without a native patch.

### Other apps

- **Instagram** keeps its wordmark in the app header above the feed: "It appears
  in the app header, in marketing and in press material, and almost nobody
  navigates by it" ([The Next Web, Aug 2026](https://thenextweb.com/news/instagram-logo-wordmark-redesign-app-icon-unchanged)).
  Instagram draws its own chrome; it is not a system navigation bar.
- **Apple Mail** (WWDC25 example): text large title "Inbox" with a subtitle
  ([WWDC25 284](https://developer.apple.com/videos/play/wwdc2025/284/)).
- **Apple News (iOS 26.2)**: the Today screen's top carries quick links to Sports,
  Puzzles, Politics and Food
  ([9to5Mac](https://9to5mac.com/2025/11/04/ios-26-2s-apple-news-app-has-a-new-and-improved-design/));
  the source does not describe the logo treatment.
- **Not verified from a primary source in this pass:** App Store Today, Apple
  Sports, Apple TV, Spotify, Threads, Airbnb, league and club apps. From memory
  (treat as unverified): App Store Today uses a text large title with the date
  above it and the account avatar trailing; Apple News and Threads put the brand
  mark in scroll content that scrolls away rather than in a system bar; Spotify
  and Airbnb show no wordmark on the home tab. Check current App Store screenshots
  or a device before quoting any of these.

The pattern that holds across the cited sources: system bars carry a text title
(large on tab roots); a brand mark, when present, sits in content or in an app's
own hand-drawn header.

---

## 2. iOS 26 bars, appearances and the scroll edge effect

- "As part of the new design system in iOS 26, the bar background is now
  transparent by default. Remove any background customization from your
  navigation and toolbars. Using UIBarAppearance or backgroundColor interferes
  with the glass appearance" ([WWDC25 284](https://developer.apple.com/videos/play/wwdc2025/284/)).
- "All scroll views underneath navigation or toolbars automatically apply a visual
  treatment. This ensures legibility of overlapping content in the bars. This is
  called an edge effect" (same session). The effect is a property of the scroll
  view: `UIScrollView.topEdgeEffect`, a `UIScrollEdgeEffect` with a `style`
  (automatic / soft / hard) and `isHidden`, iOS 26.0+
  ([UIScrollEdgeEffect](https://developer.apple.com/documentation/uikit/uiscrolledgeeffect),
  [topEdgeEffect](https://developer.apple.com/documentation/uikit/uiscrollview/topedgeeffect)).
- HIG: "Prefer the automatic scroll edge effect style … This style provides a more
  opaque visual separation for top toolbars that contain a large number of
  controls, text that appears outside of Liquid Glass controls, and pinned table
  headers" ([HIG: Scroll views](https://developer.apple.com/design/human-interface-guidelines/scroll-views)).
  A wordmark title view is content outside a glass control, so `automatic` may
  resolve to the harder style on Home. `hard` is "a scroll edge effect with a
  hard cutoff and dividing line" (`rns/src/types.tsx:248`).
- "Reduce your use of custom backgrounds in controls and navigation elements. Any
  custom backgrounds and appearances you use in these elements might overlay or
  interfere with Liquid Glass or other effects that the system provides, such as
  the scroll edge effect … Prefer to remove custom effects and let the system
  determine the background appearance"
  ([Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)).
  Apple DTS repeats this as the answer to an opaque-bar layout bug
  ([thread 847499](https://developer.apple.com/forums/thread/847499)).
- `scrollEdgeAppearance` "applies to all navigation bars" since iOS 15, not just
  large-title ones; UIKit uses it "if the edge of the scrolled content reaches
  that bar" ([UINavigationBar.scrollEdgeAppearance](https://developer.apple.com/documentation/uikit/uinavigationbar/scrolledgeappearance),
  [UINavigationItem.scrollEdgeAppearance](https://developer.apple.com/documentation/uikit/uinavigationitem/scrolledgeappearance)).
- `configureWithOpaqueBackground()` "Configures the bar appearance object with a
  set of opaque colors"; `configureWithTransparentBackground()` "with a
  transparent background and no shadow"
  ([opaque](https://developer.apple.com/documentation/uikit/uibarappearance/configurewithopaquebackground()),
  [transparent](https://developer.apple.com/documentation/uikit/uibarappearance/configurewithtransparentbackground())).
- react-native-screens' own position since 4.30.0: "Starting with iOS 26, Apple
  recommends against custom navigation bar backgrounds … We recommend following
  Apple's guidance and using a transparent header on iOS 26+"
  ([4.30.0 release notes](https://github.com/software-mansion/react-native-screens/releases/tag/4.30.0)).

### Why an opaque appearance looks solid on Home but the siblings look clear

The siblings are not getting a different system treatment. They get a different
**input**. expo-router computes the header background colour as:

```js
// er/useHeaderConfigProps.js:128-134
const headerBackgroundColor = headerStyleFlattened.backgroundColor ??
    (headerBackground != null ||
        headerTransparent ||
        // The title becomes invisible if background color is set with large title on iOS 26
        (Platform.OS === 'ios' && headerLargeTitleEnabled)
        ? 'transparent'
        : colors.card);
```

`colors.card` is `surfaceLowest`: `#ffffff` light, `#0e0e0e` dark
(`apps/native/src/theme/navigation-theme.ts:16`, `src/theme/colors.ts:32,87`),
against a screen background of `#f8f9fa` / `#131313` (`colors.ts:11,66`). So
without a large title, Home's bar is a white (or near-black) band over a grey
screen.

react-native-screens then picks the appearance from that colour alone:

```objc
// rns/ios/RNSScreenStackHeaderConfig.mm:376-390
if (config.backgroundColor && CGColorGetAlpha(config.backgroundColor.CGColor) == 0.) {
  ... [appearance configureWithTransparentBackground]; (shadow kept unless hideShadow)
} else {
  [appearance configureWithOpaqueBackground];
}
if (config.backgroundColor) { appearance.backgroundColor = config.backgroundColor; }
```

That appearance becomes `standardAppearance` and `compactAppearance` (`:529-530`),
and `scrollEdgeAppearance` is a copy of it unless `largeTitleBackgroundColor` is
set (`:538-556`). An opaque standard appearance paints over whatever the scroll
view's edge effect draws; a transparent one lets it through.

---

## 3. Observations (a)–(d) traced through source

Shared facts:

- Home and its siblings render the same `Screen` with `edges={UNDER_NATIVE_HEADER}`
  (`src/app/(tabs)/(home)/index.tsx:61,81,96`), whose `ScrollView` uses
  `contentInsetAdjustmentBehavior="automatic"` (`src/components/Screen.tsx:83-92`,
  `src/lib/ui/scroll-inset.ts`). The scroll view sits on the first-subview chain
  (`SafeAreaView > ScrollView`), which is what `tryFindDescendantScrollView` and
  the edge-effect finder walk (`rns/ios/RNSScreen.mm:705-739,1108-1112`).
- `scrollEdgeEffects` defaults to `automatic` on every edge
  (`er/NativeStackView.native.js:214-219`), applied to `scrollView.topEdgeEffect`
  (`rns/ios/helpers/scroll-view/RNSScrollEdgeEffectApplicator.mm:8-50`).
- `translucent` decides whether the screen extends under the bar:
  `edgesForExtendedLayout = UIRectEdgeAll - UIRectEdgeTop` when false, `UIRectEdgeAll`
  when true (`RNSScreenStackHeaderConfig.mm:497-504`). expo-router sets it only for
  `headerBackground`, `headerTransparent`, or (iOS) a search bar or large title
  (`er/useHeaderConfigProps.js:202-207`), and `unstable_nativeProps.headerConfig`
  is spread last, so it overrides (`:281`).
- `hideShadow` is true for `headerShadowVisible: false`, any `headerBackground`, or
  `headerTransparent` unless `headerShadowVisible: true` (`:260-262`).

What each variant sends to `buildAppearance`, next to a sibling tab root:

| Variant | `backgroundColor` | `translucent` | `hideShadow` | `largeTitle` | `largeTitleBackgroundColor` |
|---|---|---|---|---|---|
| Sibling (`tabRootHeaderOptions`) | transparent | true | false | true | — |
| (a) `homeHeaderOptions` | `colors.card` | false | false | false | — |
| (b) + `headerTransparent: true` | transparent | true | **true** | false | — |
| (c) + `translucent: true` | `colors.card` | true | false | false | — |
| (d) + `headerLargeStyle.backgroundColor: 'transparent'` | `colors.card` | true | false | false | transparent |

**(a) Solid fill.** Opaque `#ffffff` standard and scroll-edge appearance
(`:384-390,529,556`). `translucent` is false, so the screen is laid out below the
bar (`:500`); nothing scrolls under it, so there is no edge effect to see either.

**(b) `headerTransparent: true` — no glass, even scrolled.** The appearance inputs
are the siblings' with `largeTitle` off and the shadow removed. From source, the
bar is a transparent appearance over a scroll view that has `topEdgeEffect`
`automatic`, which is the configuration iOS 26 documents as producing the edge
effect, and the configuration `detailHeaderOptions` already uses for pushed
screens (`src/lib/nav/headers.ts:104-123`). react-native-screens issue
[#4776](https://github.com/software-mansion/react-native-screens/issues/4776)
reports exactly this setup on 4.26.2 / Expo 57 giving a blur "through the whole
header" on iOS 26.5. **The source does not explain the observation.** Candidates,
in order of likelihood, all to be checked on device:

1. *The effect is there but faint.* `automatic` on a near-white page over plain
   grey background is subtle; the siblings' collapse animation makes theirs easy
   to notice. Test with coloured cards scrolled under the bar, and with
   `scrollEdgeEffects: { top: 'hard' }`, which draws a dividing line.
2. *Colour-scheme override.* `useAppearanceMode` calls `Appearance.setColorScheme`
   on mount when a non-system theme is stored (`src/hooks/useAppearanceMode.ts:32-38`).
   [#4081](https://github.com/software-mansion/react-native-screens/issues/4081)
   (closed, backlog) reports that this drops the stack header's glass on tabs that
   were not active at the time. Test with the theme set to System.
3. *Content scroll view not tied to this bar.* Inside native tabs UIKit resolves
   the bar's content scroll view once
   ([#4991](https://github.com/software-mansion/react-native-screens/issues/4991),
   open; [#4369](https://github.com/software-mansion/react-native-screens/issues/4369)).
   A large title forces UIKit to find the scroll view for the collapse; an inline
   bar does not. Unproven for our hierarchy.

**(c) `translucent: true` alone — still solid.** The screen now extends under the
bar (`:503`) and `RNSScreen.updateBounds` stops offsetting content
(`rns/ios/RNSScreen.mm:143-145`), but `backgroundColor` is still `colors.card`, so
both appearances are still `configureWithOpaqueBackground` + `#ffffff`
(`:384-390`). Content scrolls under an opaque white bar and is hidden by it.

**(d) plus `headerLargeStyle` transparent — solid at top, hairline on scroll.**
expo-router forwards `headerLargeStyle.backgroundColor` as `largeTitleBackgroundColor`
regardless of `headerLargeTitleEnabled` (`er/useHeaderConfigProps.js:154,264`), and
react-native-screens applies it to the scroll-edge appearance only:
`configureWithTransparentBackground` and `backgroundColor = nil` (`:540-552`). The
standard appearance stays opaque `#ffffff` **with** the default opaque shadow,
since `hideShadow` is false (`:384,406`). So:

- Scrolled: UIKit switches to `standardAppearance` — opaque white bar plus the
  `configureWithOpaqueBackground` shadow line. That is the hairline, and it
  replaces the edge effect with an iOS 18-style bar, which Apple asks apps to
  remove.
- At the top: source predicts a clear bar showing the screen's `#f8f9fa`
  background, i.e. the same as a sibling at rest. A clear bar over a flat page
  still looks like a flat band, so "solid" may be correct and harmless. If the
  band is **`#ffffff`** (sample the pixel: white vs. `#f8f9fa` grey), UIKit is
  using `standardAppearance` at rest, meaning it does not consider the content
  at the bar's edge — candidate 3 above.

Either way (d) cannot match the siblings: its standard appearance is opaque by
construction.

### The option set that matches the siblings' inputs

```ts
// iOS only
headerStyle: { backgroundColor: "transparent" },          // buildAppearance → configureWithTransparentBackground, shadow kept
unstable_nativeProps: { headerConfig: { translucent: true } }, // extend under the bar like a large-title root
// and remove headerLargeStyle
```

This feeds `buildAppearance` the same `backgroundColor` / `hideShadow` /
`blurEffect` (default `none`, `RNSScreenStackHeaderConfig.mm:83`) as the siblings,
and the same `translucent`. It is equivalent to `headerTransparent: true` plus
`headerShadowVisible: true`, so if (b) has a real missing-edge-effect problem
(candidates 2–3), this will have it too. The other options do not help:

- `headerBlurEffect`: sets `appearance.backgroundEffect` to a `UIBlurEffect`
  (`:392-403`) — a classic iOS 18 blur, not Liquid Glass, and react-native-screens
  warns that combining it with `scrollEdgeEffects` "may cause overlapping effects"
  (`rns/src/types.tsx:243`).
- `headerBackground`: renders a React view behind the header
  (`er/NativeStackView.native.js:229-232`) and forces `hideShadow`; a custom
  background is what Apple asks to remove.
- `headerShadowVisible: false`: only removes the line; does not change opacity.
- System default appearance: not reachable. `buildAppearance` always calls one of
  the two `configureWith…` methods (`:376-385`), and no 4.27–4.31 release changes
  that ([4.30.0 notes](https://github.com/software-mansion/react-native-screens/releases/tag/4.30.0)
  change opaque-header layout, not appearance).

---

## 4. Recommendation for Home

Ranked.

**1. Text large title, no wordmark in the bar (recommended).**

```ts
// TabRootStack.tsx
screenOptions = tabRootHeaderOptions(i18n.t("tabs.home")); // "Start" / "Home"
```

and delete `homeHeaderOptions` and `HomeTitle`.

- Same code path as the other four tab roots, so the same bar, collapse, edge
  effect and profile button on device today. No `unstable_` props.
- Matches HIG: large title on a tab root, a title that is not the app name, logo
  not repeated in chrome.
- Android unchanged in kind (same as other tab roots).
- Cost: the brand mark leaves the Home chrome. The app icon, launch screen and
  sign-in already carry it. If the club wants it on Home, put it in the content
  layer (e.g. a small wordmark inside the first card), where the HIG wants brand
  expression, not above the large title.
- Verification: none beyond a glance; it is the shape already verified on the
  siblings (`f276c1c9`).

**2. Large title text that collapses to the wordmark.** `tabRootHeaderOptions`
plus `headerTitle: HomeTitle`. react-native-screens sets `navitem.title` from
`title` (`RNSScreenStackHeaderConfig.mm:650`) and the custom view as `titleView`
(`:591`), and expo-router treats the bar as large-title (transparent, translucent).
Expected: "Start" large at rest, wordmark in the inline bar after collapse.
**Needs on-device verification**: whether iOS 26 hides the `titleView` while the
large title is shown, and whether the React title view lays out correctly during
the collapse. Keeps the brand while staying on the sibling appearance path.

**3. Wordmark as inline title with sibling-equivalent appearance.** The option
set in §3: `headerStyle: { backgroundColor: 'transparent' }` +
`unstable_nativeProps: { headerConfig: { translucent: true } }`, no
`headerLargeStyle`. **Needs on-device verification**, and given (b) it may show no
visible edge effect. Before choosing it, run the (b) checks: theme on System,
coloured content scrolled under the bar, and `scrollEdgeEffects: { top: 'hard' }`
on the Home screen to confirm the scroll view participates. Still conflicts with
"Don't title windows with your app name". Depends on an `unstable_` prop.

**Not recommended:** the current working-tree variant (d). Its standard appearance
is opaque by construction, so the scrolled state is an iOS 18-style white bar with
a hairline; no option layered on top fixes that without making the background
transparent, which is option 3.

If option 1 or 2 is chosen, revise audit action 1.1.2 ("use it as the
`headerTitle`") accordingly.
