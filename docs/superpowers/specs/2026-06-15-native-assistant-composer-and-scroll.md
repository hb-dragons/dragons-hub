# Native club-assistant: composer redesign + scroll-to-bottom fix

**Date:** 2026-06-15
**Scope:** `apps/native` only. Two refinements to the merged club-assistant chat screen.
**Out of scope:** web changes, rich data widgets, tool-detail expansion, open/close animations, the `react-native-marked` → `react-native-streamdown` swap (all deferred per the feature handoff).

## Problem

Two observed issues on the native assistant screen (`apps/native/src/app/assistant.tsx`):

1. **The list does not reliably land at the bottom after a reply streams in.** `scrollToEnd` runs inside a `useEffect` keyed on the `messages` array (`assistant.tsx:106-108`). The rendered assistant row keeps growing *after* the array settles — `useThrottledText` flushes shown text every ~100 ms and does a final flush when `isStreaming` flips false — so the effect (a) fires before the new text has laid out and (b) never fires again after the last flush. The view ends up short of the bottom.

2. **The input + Send button do not look native.** The composer reuses the sheet form-field style `multilineInput(theme)` (`inputStyles.ts`, `minHeight: 80`) plus two text `Pressable`s ("Send" / "Stop"). An 80 px box reads as a textarea, and a text button is not the convention. Every current chat app (ChatGPT, Claude, Gemini, WhatsApp, iMessage, Telegram) uses a compact field that rests at one line and grows, with a circular trailing button.

## Goals

- The list lands exactly at the bottom when a reply finishes streaming, and stays glued while streaming **unless** the user has scrolled up to read.
- The composer reads as a native chat bar: a floating, rounded field that grows from one line, with a single circular Send button that morphs into a Stop control while generating.
- On iOS 26 the composer bar uses **Liquid Glass** to match the app's existing glass chrome (`NativeTabs` and `Stack` headers already render as Liquid Glass on iOS 26). Android and older iOS fall back to a solid surface.
- All non-trivial logic lives in `src/lib/assistant/**` with co-located tests (native coverage counts only `src/lib/**`).

## Non-goals

- No platform-divergent *content* styling beyond the glass-vs-solid composer surface.
- No change to the AI-SDK transport, the `useChat` wiring, message rendering, or the backend.
- No new i18n keys: `assistant.send`, `assistant.stop`, `assistant.placeholder` already exist and are reused for `accessibilityLabel`s.

---

## Design

### 1. Scroll-to-bottom (auto-follow)

Replace the `[messages]`-keyed `scrollToEnd` effect with `onContentSizeChange`-driven auto-scroll, gated by an `autoFollow` ref.

Screen wiring in `assistant.tsx` (refs, not state — `onScroll` fires at 16 ms and `setState` there causes re-renders and stale closures):

- `const autoFollow = useRef(true)` — are we glued to the bottom?
- `const contentH = useRef(0)` — last measured content height.
- `const lastUserCount = useRef(0)` — user-message count at last render.
- `scrollToBottom(animated)` = `requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }))` so it runs after the just-grown row lays out.

`FlatList` gets:

- `onContentSizeChange={(_w, h) => { const { scroll } = nextFollowScroll({ prevHeight: contentH.current, nextHeight: h, autoFollow: autoFollow.current }); contentH.current = h; if (scroll) scrollToBottom(false); }}` — `animated: false` for streaming catch-up (repeated animated scrolls every ~100 ms stutter and fight each other).
- `onScroll={(e) => { const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent; autoFollow.current = isNearBottom({ contentOffsetY: contentOffset.y, contentHeight: contentSize.height, layoutHeight: layoutMeasurement.height, threshold: NEAR_BOTTOM }); }}`
- `scrollEventThrottle={16}` (required on iOS).
- `maintainVisibleContentPosition={{ minIndexForVisible: 0 }}` — cheap secondary guard; not the primary fix.

A slim effect re-arms follow only on a user send (not on every streamed token):

```
useEffect(() => {
  const userCount = countUserMessages(messages);
  if (shouldReArmFollow(userCount, lastUserCount.current)) {
    autoFollow.current = true;
    scrollToBottom(true);            // animated for the one-shot user-send scroll
  }
  lastUserCount.current = userCount;
}, [messages]);
```

`NEAR_BOTTOM = 80`. A streaming row can grow by more than one line between scroll events, so a small threshold makes `autoFollow` flicker off; 60–100 px is a safe band.

### 2. ChatComposer component

New `apps/native/src/components/assistant/ChatComposer.tsx`. Props: `{ value, onChangeText, onSend, busy, onStop }`. It owns its auto-grow height state and reports its laid-out height upward so the list can clear it.

**Floating layout.** The composer floats over the `FlatList` (absolute-positioned at the bottom) so streamed content visibly passes *behind* the glass. The `FlatList` `contentContainerStyle.paddingBottom` tracks the composer's measured height (`onLayout`) + the bottom safe-area inset + a gap, so the newest message is never hidden. Row: `flexDirection: "row"`, `alignItems: "flex-end"` (keeps the button pinned to the bottom as the field grows), `gap: spacing.sm`, horizontal margin, and `paddingBottom: Math.max(insets.bottom, spacing.sm)` via `useSafeAreaInsets()` (the screen is `<Screen edges={[]}>`, so no inset is applied otherwise — do **not** add `"bottom"` to `Screen` edges or the list content shifts too).

**Surface (glass / solid).** A small `ComposerSurface` wrapper branches on `expo-glass-effect`'s `isLiquidGlassAvailable()`:
- Available (iOS 26+): a `GlassView` with `glassEffectStyle="regular"` (the more opaque variant — keeps typed text legible), rounded with the new `radius.lg` token, holding the row.
- Otherwise (Android, iOS < 26): a solid `View`, `backgroundColor: colors.surfaceLow`, `borderWidth: 1`, `borderColor: colors.border`, same `radius.lg` — a floating solid capsule.

The exact `GlassView` prop names are confirmed against the installed `expo-glass-effect` version during implementation.

**Auto-grow `TextInput`.** `multiline`, `flex: 1`, transparent background (lets the surface show), `color: colors.foreground`, `placeholderTextColor: colors.mutedForeground`, `fontSize: 15`, `textAlignVertical: "top"`, `paddingHorizontal: spacing.md`, `paddingVertical` 10 (iOS) / 8 (Android). **Never set `lineHeight`** — on iOS it shifts placeholder/typed text and corrupts the `contentSize.height` auto-grow math (already documented in `inputStyles.ts`). Height is driven by state:
- `onContentSizeChange={(e) => setHeight(clampComposerHeight(e.nativeEvent.contentSize.height))}`.
- `scrollEnabled={height >= COMPOSER_MAX}` so text scrolls internally once capped.
- Reset to `COMPOSER_MIN` after a send (clearing text does not reliably refire `onContentSizeChange`): bump a `key` on the `TextInput` from the send handler, or call `setHeight(COMPOSER_MIN)`.

Do **not** reuse `multilineInput(theme)` — keep that for sheet bodies (`CommentsSection`, board sheets). The composer is a separate component.

**Send / Stop button.** One 36×36 `Pressable` circle beside the field (`borderRadius` via `radius.pill`; a square button + `radius.pill` resolves to a circle), `alignItems`/`justifyContent: "center"`. Variant from `composerButtonState(busy, value)`:
- `"disabled"` (empty, not busy): `backgroundColor: colors.surfaceHigh`, up-arrow in `colors.mutedForeground`, `disabled`, `accessibilityState={{ disabled: true }}`. (`surfaceHigh`, not `surfaceLow` — the solid-fallback capsule is itself `surfaceLow`, so the disabled button needs a contrasting tonal step to stay visible; it also reads fine over glass.)
- `"send"` (has text, not busy): `onPress={onSend}`, `backgroundColor: colors.primary`, up-arrow in `colors.primaryForeground`, `accessibilityLabel={i18n.t("assistant.send")}`.
- `"stop"` (busy): `onPress={onStop}`, `backgroundColor: colors.primary`, filled square in `colors.primaryForeground`, `accessibilityLabel={i18n.t("assistant.stop")}`.

Two inline `react-native-svg` icons in the same style as `TaskCard.tsx` (`Svg` + `Path`/`Rect`, `viewBox="0 0 24 24"`, `strokeWidth={2}`, rounded caps):
- `ArrowUpIcon`: `M12 19V5` + `M5 12l7-7 7 7` (stroked).
- `StopIcon`: `<Rect x={7} y={7} width={10} height={10} rx={2} fill=... />` (filled, no stroke).

The standalone `ActivityIndicator` (`assistant.tsx:135`, shown during `status === "submitted"`) is removed — the Stop button already signals activity, matching the ChatGPT/Claude pattern.

### 3. Keyboard handling

The composer must stick above the keyboard. Candidate primitives (decided + verified on device during implementation): `react-native-keyboard-controller`'s `KeyboardStickyView` (purpose-built for a docked composer), or its `KeyboardAvoidingView` with `behavior="translate-with-padding"` (the library's chat-recommended mode) + `keyboardVerticalOffset={useHeaderHeight()}` from `@react-navigation/elements` (the screen sits under a native `Stack` header). `useHeaderHeight()` already includes the status-bar height on Android — do not double-add it.

### 4. Theme token

Add `lg: 20` to the `radius` map in `apps/native/src/theme/spacing.ts` (additive; `md: 4` and `pill: 9999` are unchanged). The composer field/surface uses `radius.lg`; the send button uses `radius.pill`.

### 5. Dependency

Add **`expo-glass-effect`** (Expo SDK 55 compatible) to `apps/native`. It is a native module, so the change is not visible until the **EAS dev client is rebuilt** — called out in the plan and to the user.

---

## Testable helpers (`src/lib/assistant/`)

Pure functions, each with a co-located `*.test.ts`. Native coverage counts only `src/lib/**`, so this is where the logic lives; the `.tsx` files (screen wiring, `ChatComposer`, `ComposerSurface`, icons) are uncovered by design.

`src/lib/assistant/composer.ts`:

| Function | Behavior |
|---|---|
| `clampComposerHeight(contentHeight: number, min = COMPOSER_MIN, max = COMPOSER_MAX): number` | Clamp to `[min, max]`. Exports `COMPOSER_MIN = 40`, `COMPOSER_MAX = 132`. A bad iOS placeholder reading cannot blow past the cap. |
| `composerButtonState(busy: boolean, value: string): "send" \| "stop" \| "disabled"` | `busy` → `"stop"`; else trimmed-empty `value` → `"disabled"`; else `"send"`. `busy` wins over text. |

`src/lib/assistant/scroll.ts`:

| Function | Behavior |
|---|---|
| `isNearBottom({ contentOffsetY, contentHeight, layoutHeight, threshold }): boolean` | `contentHeight - (contentOffsetY + layoutHeight) <= threshold`; also `true` when content fits within the viewport. Exports `NEAR_BOTTOM = 80`. |
| `nextFollowScroll({ prevHeight, nextHeight, autoFollow }): { scroll: boolean }` | `scroll = autoFollow && nextHeight > prevHeight` (only scroll when content grew and we are still glued). |
| `shouldReArmFollow(currentUserCount: number, previousUserCount: number): boolean` | `currentUserCount > previousUserCount`. |
| `countUserMessages(messages: UiMessageLike[]): number` | Count `role === "user"` entries; keeps the role filter out of the `.tsx`. |

### Test cases (representative)

- `clampComposerHeight`: below min → min; above max → max; in range → unchanged; negative/`0`/NaN-ish guard → min.
- `composerButtonState`: `(true, "")` → stop; `(true, "hi")` → stop; `(false, "")` → disabled; `(false, "   ")` → disabled; `(false, "hi")` → send.
- `isNearBottom`: exactly at bottom → true; within threshold → true; beyond threshold → false; content shorter than viewport → true.
- `nextFollowScroll`: grew + following → scroll; grew + not following → no; shrank → no; equal → no.
- `shouldReArmFollow` / `countUserMessages`: count increase → true; equal → false; mixed-role arrays counted correctly.

---

## Verification

- `pnpm --filter @dragons/native lint` (0 errors — `no-floating-promises`, `no-misused-promises`, `consistent-type-imports` are errors; wrap promise handlers, e.g. `onPress={() => void onStop()}`).
- `pnpm --filter @dragons/native typecheck`.
- `pnpm --filter @dragons/native test` and `pnpm --filter @dragons/native coverage` (thresholds ratchet up, never down).
- Manual on a rebuilt dev client:
  - **iOS 26 device/sim:** composer bar renders as Liquid Glass; field grows one line → cap → internal scroll; Send arrow ↔ Stop square morph; after a reply finishes streaming the list sits exactly at the bottom; scrolling up mid-stream pauses auto-follow; sending re-glues.
  - **Android / older iOS:** solid `surfaceLow` floating capsule fallback; same behavior otherwise.
