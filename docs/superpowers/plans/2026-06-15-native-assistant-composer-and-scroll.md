# Native Assistant Composer + Scroll-to-Bottom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the native assistant's scroll-to-bottom-after-streaming bug and replace its form-field composer with a native chat bar (auto-growing field, morphing circular Send/Stop button, iOS-26 Liquid Glass surface with a solid fallback).

**Architecture:** Pure logic (height clamping, near-bottom math, auto-follow decisions, button-state mapping) lives in two tested modules under `src/lib/assistant/` (native coverage counts only `src/lib/**`). A new `ChatComposer` component composes those helpers with a glass/solid surface wrapper and inline SVG icons. The screen (`assistant.tsx`) drives auto-follow scrolling from `FlatList.onContentSizeChange` gated by refs, and mounts the composer as a floating bar that sticks above the keyboard.

**Tech Stack:** Expo 55 / React Native 0.83, `react-native-svg`, `react-native-keyboard-controller` (`KeyboardStickyView`), `react-native-safe-area-context`, new `expo-glass-effect`, Vitest (node env, RN mocked).

---

## File Structure

- Create `apps/native/src/lib/assistant/composer.ts` — `clampComposerHeight`, `composerButtonState`, `COMPOSER_MIN`, `COMPOSER_MAX`. Tested.
- Create `apps/native/src/lib/assistant/composer.test.ts`.
- Create `apps/native/src/lib/assistant/scroll.ts` — `isNearBottom`, `nextFollowScroll`, `shouldReArmFollow`, `countUserMessages`, `NEAR_BOTTOM`. Tested.
- Create `apps/native/src/lib/assistant/scroll.test.ts`.
- Modify `apps/native/src/theme/spacing.ts` — add `radius.lg = 20`.
- Modify `apps/native/package.json` — add `expo-glass-effect`.
- Create `apps/native/src/components/assistant/icons.tsx` — `ArrowUpIcon`, `StopIcon`.
- Create `apps/native/src/components/assistant/ComposerSurface.tsx` — glass/solid wrapper.
- Create `apps/native/src/components/assistant/ChatComposer.tsx` — the composer.
- Modify `apps/native/src/app/assistant.tsx` — scroll auto-follow wiring + mount `ChatComposer` as a floating, keyboard-sticky bar; remove the old `[messages]` effect, inline `TextInput`, text buttons, and `ActivityIndicator`.

`.tsx` files are not unit-tested (the native vitest setup is node-env with RN mocked, and coverage counts only `src/lib/**`); they are verified by `lint` + `typecheck` + manual device run. The two `src/lib` modules are TDD.

---

## Task 1: Add `radius.lg` token

**Files:**
- Modify: `apps/native/src/theme/spacing.ts`

- [ ] **Step 1: Add the token**

In `apps/native/src/theme/spacing.ts`, change the `radius` map to add `lg`:

```ts
export const radius = {
  /** Matches web rounded-md (0.25rem = 4px) */
  md: 4,
  /** Chat composer / large rounded surfaces */
  lg: 20,
  /** Pill shape for badges and chips */
  pill: 9999,
} as const;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/theme/spacing.ts
git commit -m "feat(native): add radius.lg token for chat composer"
```

---

## Task 2: `composer.ts` helpers (TDD)

**Files:**
- Create: `apps/native/src/lib/assistant/composer.ts`
- Test: `apps/native/src/lib/assistant/composer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/native/src/lib/assistant/composer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  clampComposerHeight,
  composerButtonState,
  COMPOSER_MIN,
  COMPOSER_MAX,
} from "./composer";

describe("clampComposerHeight", () => {
  it("returns the min for heights below the floor", () => {
    expect(clampComposerHeight(10)).toBe(COMPOSER_MIN);
  });
  it("returns the max for heights above the cap", () => {
    expect(clampComposerHeight(500)).toBe(COMPOSER_MAX);
  });
  it("passes through heights in range", () => {
    expect(clampComposerHeight(80)).toBe(80);
  });
  it("falls back to the min for non-finite readings", () => {
    expect(clampComposerHeight(Number.NaN)).toBe(COMPOSER_MIN);
    expect(clampComposerHeight(Number.POSITIVE_INFINITY)).toBe(COMPOSER_MIN);
  });
  it("honours custom bounds", () => {
    expect(clampComposerHeight(5, 12, 100)).toBe(12);
    expect(clampComposerHeight(200, 12, 100)).toBe(100);
  });
});

describe("composerButtonState", () => {
  it("is stop while busy, regardless of text", () => {
    expect(composerButtonState(true, "")).toBe("stop");
    expect(composerButtonState(true, "hello")).toBe("stop");
  });
  it("is disabled when not busy and the trimmed value is empty", () => {
    expect(composerButtonState(false, "")).toBe("disabled");
    expect(composerButtonState(false, "   ")).toBe("disabled");
  });
  it("is send when not busy and there is text", () => {
    expect(composerButtonState(false, "hi")).toBe("send");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/native exec vitest run src/lib/assistant/composer.test.ts`
Expected: FAIL — cannot find module `./composer`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/native/src/lib/assistant/composer.ts`:

```ts
/** One-line resting height of the chat composer (px). */
export const COMPOSER_MIN = 40;
/** Cap before the field scrolls internally (~5-6 lines). */
export const COMPOSER_MAX = 132;

/**
 * Clamp the auto-grow height reported by the TextInput's onContentSizeChange.
 * Guards against iOS returning a bad placeholder-only contentSize: a non-finite
 * reading collapses to the one-line min instead of blowing past the cap.
 */
export function clampComposerHeight(
  contentHeight: number,
  min: number = COMPOSER_MIN,
  max: number = COMPOSER_MAX,
): number {
  if (!Number.isFinite(contentHeight)) return min;
  return Math.max(min, Math.min(max, contentHeight));
}

export type ComposerButtonState = "send" | "stop" | "disabled";

/**
 * Map (busy, input value) to the morphing send-button variant.
 * busy wins over text (stop while generating); empty trimmed input is disabled.
 */
export function composerButtonState(busy: boolean, value: string): ComposerButtonState {
  if (busy) return "stop";
  if (value.trim().length === 0) return "disabled";
  return "send";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/native exec vitest run src/lib/assistant/composer.test.ts`
Expected: PASS (9 assertions across 2 describes).

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/lib/assistant/composer.ts apps/native/src/lib/assistant/composer.test.ts
git commit -m "feat(native): composer height-clamp and button-state helpers"
```

---

## Task 3: `scroll.ts` helpers (TDD)

**Files:**
- Create: `apps/native/src/lib/assistant/scroll.ts`
- Test: `apps/native/src/lib/assistant/scroll.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/native/src/lib/assistant/scroll.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  isNearBottom,
  nextFollowScroll,
  shouldReArmFollow,
  countUserMessages,
  NEAR_BOTTOM,
} from "./scroll";
import type { UiMessageLike } from "./messages";

const msg = (role: string): UiMessageLike => ({ id: `${role}-${Math.random()}`, role, parts: [] });

describe("isNearBottom", () => {
  it("is true when content fits within the viewport", () => {
    expect(isNearBottom({ contentOffsetY: 0, contentHeight: 100, layoutHeight: 600, threshold: NEAR_BOTTOM })).toBe(true);
  });
  it("is true when scrolled to (or past) the bottom", () => {
    expect(isNearBottom({ contentOffsetY: 400, contentHeight: 1000, layoutHeight: 600, threshold: NEAR_BOTTOM })).toBe(true);
  });
  it("is true within the threshold band", () => {
    expect(isNearBottom({ contentOffsetY: 350, contentHeight: 1000, layoutHeight: 600, threshold: NEAR_BOTTOM })).toBe(true);
  });
  it("is false when scrolled up beyond the threshold", () => {
    expect(isNearBottom({ contentOffsetY: 100, contentHeight: 1000, layoutHeight: 600, threshold: NEAR_BOTTOM })).toBe(false);
  });
});

describe("nextFollowScroll", () => {
  it("scrolls when content grew and we are following", () => {
    expect(nextFollowScroll({ prevHeight: 100, nextHeight: 140, autoFollow: true })).toEqual({ scroll: true });
  });
  it("does not scroll when not following", () => {
    expect(nextFollowScroll({ prevHeight: 100, nextHeight: 140, autoFollow: false })).toEqual({ scroll: false });
  });
  it("does not scroll when content shrank or is unchanged", () => {
    expect(nextFollowScroll({ prevHeight: 140, nextHeight: 100, autoFollow: true })).toEqual({ scroll: false });
    expect(nextFollowScroll({ prevHeight: 100, nextHeight: 100, autoFollow: true })).toEqual({ scroll: false });
  });
});

describe("shouldReArmFollow", () => {
  it("re-arms when the user-message count increased", () => {
    expect(shouldReArmFollow(2, 1)).toBe(true);
  });
  it("does not re-arm when the count is unchanged", () => {
    expect(shouldReArmFollow(1, 1)).toBe(false);
  });
});

describe("countUserMessages", () => {
  it("counts only role === 'user' entries", () => {
    expect(countUserMessages([msg("user"), msg("assistant"), msg("user")])).toBe(2);
    expect(countUserMessages([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @dragons/native exec vitest run src/lib/assistant/scroll.test.ts`
Expected: FAIL — cannot find module `./scroll`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/native/src/lib/assistant/scroll.ts`:

```ts
import type { UiMessageLike } from "./messages";

/** Tolerance (px) for treating the scroll position as "at the bottom". */
export const NEAR_BOTTOM = 80;

/**
 * Is the scroll position within `threshold` px of the content bottom? Also true
 * when the content fits entirely within the viewport (nothing to scroll).
 */
export function isNearBottom(args: {
  contentOffsetY: number;
  contentHeight: number;
  layoutHeight: number;
  threshold: number;
}): boolean {
  const { contentOffsetY, contentHeight, layoutHeight, threshold } = args;
  if (contentHeight <= layoutHeight) return true;
  return contentHeight - (contentOffsetY + layoutHeight) <= threshold;
}

/**
 * onContentSizeChange decision: only catch-up scroll when the content actually
 * GREW and we are still glued to the bottom. Avoids scrolling on shrink / layout
 * churn (e.g. the keyboard opening).
 */
export function nextFollowScroll(args: {
  prevHeight: number;
  nextHeight: number;
  autoFollow: boolean;
}): { scroll: boolean } {
  return { scroll: args.autoFollow && args.nextHeight > args.prevHeight };
}

/** Re-arm auto-follow only when the user sent a new message this render. */
export function shouldReArmFollow(currentUserCount: number, previousUserCount: number): boolean {
  return currentUserCount > previousUserCount;
}

/** Number of user-authored messages; feeds shouldReArmFollow. */
export function countUserMessages(messages: UiMessageLike[]): number {
  return messages.filter((m) => m.role === "user").length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @dragons/native exec vitest run src/lib/assistant/scroll.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/lib/assistant/scroll.ts apps/native/src/lib/assistant/scroll.test.ts
git commit -m "feat(native): auto-follow scroll helpers for the assistant list"
```

---

## Task 4: Add the `expo-glass-effect` dependency

**Files:**
- Modify: `apps/native/package.json`

- [ ] **Step 1: Add the package**

Run: `pnpm --filter @dragons/native add expo-glass-effect@~55.0.0`
(If that exact version does not resolve, run `pnpm --filter @dragons/native exec expo install expo-glass-effect` so Expo picks the SDK-55-compatible version, then re-run `pnpm install` at the repo root.)
Expected: `expo-glass-effect` added under `dependencies` in `apps/native/package.json`, lockfile updated.

- [ ] **Step 2: Confirm the exported API**

Run: `node -e "console.log(Object.keys(require('./apps/native/node_modules/expo-glass-effect')))"` (from repo root) — or open `apps/native/node_modules/expo-glass-effect/build/index.d.ts`.
Expected: exports include `GlassView` (component) and `isLiquidGlassAvailable` (function). Note the exact prop names on `GlassView` (expected: `glassEffectStyle`, `tintColor`, `isInteractive`, plus standard `style`). If a name differs, use the real one in Task 6.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/native/package.json pnpm-lock.yaml
git commit -m "chore(native): add expo-glass-effect for the composer surface"
```

> NOTE: `expo-glass-effect` is a native module. It is not visible in the existing EAS dev client — a dev-client rebuild is required before the glass surface renders on device. The JS fallback path works without a rebuild.

---

## Task 5: Send/Stop SVG icons

**Files:**
- Create: `apps/native/src/components/assistant/icons.tsx`

- [ ] **Step 1: Implement the icons**

Create `apps/native/src/components/assistant/icons.tsx` (same inline-SVG style as `apps/native/src/components/board/TaskCard.tsx`):

```tsx
import Svg, { Path, Rect } from "react-native-svg";

/** Up-arrow (send). Stroked, like the other inline icons in this app. */
export function ArrowUpIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 19V5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 12l7-7 7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Filled rounded square (stop generating). */
export function StopIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={7} y={7} width={10} height={10} rx={2} fill={color} />
    </Svg>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint`
Expected: PASS, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/components/assistant/icons.tsx
git commit -m "feat(native): arrow-up and stop SVG icons for the composer"
```

---

## Task 6: `ComposerSurface` (glass / solid wrapper)

**Files:**
- Create: `apps/native/src/components/assistant/ComposerSurface.tsx`

- [ ] **Step 1: Implement the surface**

Create `apps/native/src/components/assistant/ComposerSurface.tsx`. (Confirm `GlassView`'s prop names against the Task 4 step-2 output; `glassEffectStyle` and `style` are expected.)

```tsx
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useTheme } from "@/hooks/useTheme";

/**
 * The composer's floating surface. On iOS 26 (isLiquidGlassAvailable) this is a
 * Liquid Glass capsule — matching the app's NativeTabs/Stack chrome. Elsewhere
 * (Android, iOS < 26) it falls back to a solid surfaceLow capsule with a hairline
 * border. The single swap-point for the surface treatment.
 */
export function ComposerSurface({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius } = useTheme();

  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle="regular"
        style={[{ borderRadius: radius.lg, overflow: "hidden" }, style]}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        {
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceLow,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint`
Expected: PASS, 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/components/assistant/ComposerSurface.tsx
git commit -m "feat(native): glass/solid composer surface wrapper"
```

---

## Task 7: `ChatComposer` component

**Files:**
- Create: `apps/native/src/components/assistant/ChatComposer.tsx`

- [ ] **Step 1: Implement the composer**

Create `apps/native/src/components/assistant/ChatComposer.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import {
  clampComposerHeight,
  composerButtonState,
  COMPOSER_MIN,
  COMPOSER_MAX,
} from "@/lib/assistant/composer";
import { ComposerSurface } from "./ComposerSurface";
import { ArrowUpIcon, StopIcon } from "./icons";

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  busy,
  onStop,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  busy: boolean;
  onStop: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(COMPOSER_MIN);
  const state = composerButtonState(busy, value);

  // Clearing the text (incl. after send) does not reliably refire
  // onContentSizeChange, so reset the grown height explicitly.
  useEffect(() => {
    if (value.length === 0) setHeight(COMPOSER_MIN);
  }, [value]);

  const handlePress = () => {
    if (state === "stop") onStop();
    else if (state === "send") onSend();
  };

  const fill = state === "disabled" ? colors.surfaceHigh : colors.primary;
  const iconColor = state === "disabled" ? colors.mutedForeground : colors.primaryForeground;
  const label = state === "stop" ? i18n.t("assistant.stop") : i18n.t("assistant.send");

  return (
    <View
      style={{
        paddingHorizontal: spacing.md,
        paddingTop: spacing.sm,
        paddingBottom: Math.max(insets.bottom, spacing.sm),
      }}
    >
      <ComposerSurface>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: spacing.sm,
            padding: spacing.xs,
          }}
        >
          <TextInput
            value={value}
            onChangeText={onChangeText}
            multiline
            scrollEnabled={height >= COMPOSER_MAX}
            onContentSizeChange={(e) =>
              setHeight(clampComposerHeight(e.nativeEvent.contentSize.height))
            }
            placeholder={i18n.t("assistant.placeholder")}
            placeholderTextColor={colors.mutedForeground}
            // NEVER set lineHeight here: on iOS it shifts the text in the line
            // box AND corrupts the contentSize.height the auto-grow relies on.
            style={{
              flex: 1,
              height,
              color: colors.foreground,
              fontSize: 15,
              paddingHorizontal: spacing.sm,
              paddingTop: Platform.OS === "ios" ? 10 : 8,
              paddingBottom: Platform.OS === "ios" ? 10 : 8,
              textAlignVertical: "top",
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: state === "disabled" }}
            disabled={state === "disabled"}
            onPress={handlePress}
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.pill,
              backgroundColor: fill,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {state === "stop" ? <StopIcon color={iconColor} /> : <ArrowUpIcon color={iconColor} />}
          </Pressable>
        </View>
      </ComposerSurface>
    </View>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint`
Expected: PASS, 0 errors. (`handlePress` is sync `() => void`, so `onPress={handlePress}` does not trip `no-misused-promises`.)

- [ ] **Step 3: Commit**

```bash
git add apps/native/src/components/assistant/ChatComposer.tsx
git commit -m "feat(native): auto-growing chat composer with morphing send/stop button"
```

---

## Task 8: Wire auto-follow scrolling into the screen

**Files:**
- Modify: `apps/native/src/app/assistant.tsx:106-108` (the `[messages]` effect) and the `FlatList` block (`:121-134`).

This task changes only the scroll behavior; the existing inline composer stays until Task 9, so the screen remains runnable.

- [ ] **Step 1: Replace the scroll effect and add refs/handlers**

In `apps/native/src/app/assistant.tsx`, update imports to add the scroll helpers and the RN scroll-event types:

```tsx
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import {
  isNearBottom,
  nextFollowScroll,
  shouldReArmFollow,
  countUserMessages,
  NEAR_BOTTOM,
} from "@/lib/assistant/scroll";
```

Inside `AssistantScreen`, replace the existing refs/effect:

```tsx
  const listRef = useRef<FlatList>(null);
  const autoFollow = useRef(true);
  const contentH = useRef(0);
  const lastUserCount = useRef(0);
```

Delete the old effect (`useEffect(() => { if (messages.length > 0) listRef.current?.scrollToEnd({ animated: true }); }, [messages]);`) and replace it with:

```tsx
  const scrollToBottom = (animated: boolean) => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
  };

  useEffect(() => {
    const userCount = countUserMessages(messages as unknown as UiMessageLike[]);
    if (shouldReArmFollow(userCount, lastUserCount.current)) {
      autoFollow.current = true;
      scrollToBottom(true);
    }
    lastUserCount.current = userCount;
  }, [messages]);

  const onListScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    autoFollow.current = isNearBottom({
      contentOffsetY: contentOffset.y,
      contentHeight: contentSize.height,
      layoutHeight: layoutMeasurement.height,
      threshold: NEAR_BOTTOM,
    });
  };
```

- [ ] **Step 2: Wire the FlatList**

Add these props to the `<FlatList>`:

```tsx
          onContentSizeChange={(_w, h) => {
            const { scroll } = nextFollowScroll({
              prevHeight: contentH.current,
              nextHeight: h,
              autoFollow: autoFollow.current,
            });
            contentH.current = h;
            if (scroll) scrollToBottom(false);
          }}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint`
Expected: PASS, 0 errors.

- [ ] **Step 4: Run the lib tests (regression)**

Run: `pnpm --filter @dragons/native test`
Expected: PASS (all existing + new tests green).

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/app/assistant.tsx
git commit -m "fix(native): drive assistant auto-scroll from onContentSizeChange"
```

---

## Task 9: Mount the floating composer and remove the old input

**Files:**
- Modify: `apps/native/src/app/assistant.tsx` (imports; the `KeyboardAvoidingView`/composer/`ActivityIndicator` block `:118-156`).

- [ ] **Step 1: Update imports**

In `apps/native/src/app/assistant.tsx`:
- Remove `ActivityIndicator` and `TextInput` from the `react-native` import (keep `FlatList`, `Pressable`, `Text`, `View`).
- Remove `import { KeyboardAvoidingView } from "react-native-keyboard-controller";` and replace with `import { KeyboardStickyView } from "react-native-keyboard-controller";`.
- Remove `import { multilineInput } from "@/components/ui/inputStyles";` (now unused).
- Add `import { ChatComposer } from "@/components/assistant/ChatComposer";`
- Add `import type { LayoutChangeEvent } from "react-native";`

(The screen does not need `useSafeAreaInsets` — the bottom safe-area padding lives inside `ChatComposer`.)

- [ ] **Step 2: Add composer-height state**

Inside `AssistantScreen`, alongside the other state:

```tsx
  const [composerH, setComposerH] = useState(0);
```

- [ ] **Step 3: Replace the return body**

Replace the `return ( <Screen ...> ... </Screen> )` block with:

```tsx
  return (
    <Screen scroll={false} edges={[]}>
      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          data={messages as unknown as UiMessageLike[]}
          keyExtractor={(msg) => msg.id}
          contentContainerStyle={{ paddingBottom: composerH + spacing.sm }}
          ListEmptyComponent={<EmptyState onPick={send} />}
          renderItem={({ item, index }) => (
            <MessageItem
              message={item}
              isStreaming={status === "streaming" && index === messages.length - 1 && item.role === "assistant"}
              onRegenerate={() => void regenerate()}
            />
          )}
          onContentSizeChange={(_w, h) => {
            const { scroll } = nextFollowScroll({
              prevHeight: contentH.current,
              nextHeight: h,
              autoFollow: autoFollow.current,
            });
            contentH.current = h;
            if (scroll) scrollToBottom(false);
          }}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        />
        <KeyboardStickyView style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
          <View onLayout={(e: LayoutChangeEvent) => setComposerH(e.nativeEvent.layout.height)}>
            {error ? (
              <Text style={{ color: colors.destructive, textAlign: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.xs }}>
                {i18n.t("assistant.error")}
              </Text>
            ) : null}
            <ChatComposer
              value={input}
              onChangeText={setInput}
              onSend={() => send(input)}
              busy={busy}
              onStop={() => void stop()}
            />
          </View>
        </KeyboardStickyView>
      </View>
    </Screen>
  );
```

This removes the standalone `ActivityIndicator` (the Stop button covers the `submitted`/`streaming` signal) and the old inline `TextInput` + text Send/Stop `Pressable`s. The composer floats over the list (so content refracts behind the glass); the list's `paddingBottom` tracks the measured composer height so the newest message clears the bar.

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm --filter @dragons/native typecheck && pnpm --filter @dragons/native lint`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/native/src/app/assistant.tsx
git commit -m "feat(native): mount floating ChatComposer; drop form-field input and ActivityIndicator"
```

---

## Task 10: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Lint**

Run: `pnpm --filter @dragons/native lint`
Expected: 0 errors.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @dragons/native typecheck`
Expected: PASS.

- [ ] **Step 3: Tests + coverage**

Run: `pnpm --filter @dragons/native test` then `pnpm --filter @dragons/native coverage`
Expected: all tests PASS; coverage meets or exceeds the thresholds in `apps/native/vitest.config.ts` (the two new `src/lib/assistant` modules are fully covered, which only raises the numbers).

- [ ] **Step 4: Manual device run (after a dev-client rebuild)**

Rebuild the EAS dev client (new native module `expo-glass-effect`), then on device/sim confirm:
- **iOS 26:** composer renders as Liquid Glass; the field rests at one line and grows to ~5-6 lines then scrolls internally; the Send arrow morphs to a Stop square while generating and back; after a reply finishes streaming the list sits exactly at the bottom; scrolling up mid-stream pauses auto-follow; sending a message re-glues to the bottom.
- **Android / iOS < 26:** the composer is a solid `surfaceLow` floating capsule; all other behavior identical.
- Verify the keyboard lifts the composer (`KeyboardStickyView`). If a gap appears above the keyboard from the bottom safe-area inset, pass `offset={{ closed: 0, opened: -insets.bottom }}` to `KeyboardStickyView`.

---

## Notes for the implementer

- **Do not** modify `multilineInput` in `apps/native/src/components/ui/inputStyles.ts` — it is still used by sheet bodies.
- **Refs not state** for `autoFollow` / `contentH` / `lastUserCount`: `onScroll` fires every 16 ms and `setState` there causes re-renders and stale closures inside `onContentSizeChange`.
- **`animated: false`** for the `onContentSizeChange` catch-up scroll (streaming), **`animated: true`** only for the one-shot user-send scroll. Repeated animated scrolls every ~100 ms stutter.
- Promise-returning handlers must be wrapped: `onStop={() => void stop()}`, `onRegenerate={() => void regenerate()}` (else `no-misused-promises` fails CI).
- No new i18n keys: reuse `assistant.send`, `assistant.stop`, `assistant.placeholder`, `assistant.error`.
