# Club Assistant — Native Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain native assistant screen with a streaming, markdown-rendering chat (Document layout) that matches the native theme in light + dark.

**Architecture:** The existing modal screen (`app/assistant.tsx`) keeps `useChat` (AI SDK v6 over `expo/fetch`) and renders a `FlatList` of messages. Testable logic lives in `src/lib/assistant/` (native vitest only covers `src/lib/**`): `messageSegments` (split a message into ordered text/tool segments), `toolChip` (tool-part → chip descriptor), `pickDisplayText` (pure throttle decision), `markedStyles` (theme → react-native-marked styles). UI components in `src/components/assistant/` stay thin: `AssistantMarkdown` (the `useMarkdown`-hook wrapper — the single swap-point for a future streamdown upgrade) and `ActivityChip`. Streaming is debounced (~100 ms) so react-native-marked doesn't re-parse on every token.

**Tech Stack:** Expo ~55 / RN 0.83 (New Architecture), `@ai-sdk/react ^3.0.199`, `ai ^6.0.197`, `react-native-marked ^8.1.0` (uses the `useMarkdown` hook — NOT the `<Markdown>` component, which renders an internal FlatList and would nest VirtualizedLists inside our screen's FlatList), `react-native-svg` (already present), `expo-clipboard`, `i18n-js`, Vitest (node env).

**Note on the backend:** immutable. We only consume `POST /qa/chat`.

---

## Task 1: Install native markdown + clipboard deps

**Files:**
- Modify: `apps/native/package.json` (via pnpm/expo)

- [ ] **Step 1: Add deps**

Run from the worktree root:
```bash
pnpm --filter @dragons/native add react-native-marked@^8.1.0 expo-clipboard
```
Expected: both appear in `apps/native/package.json`. `react-native-svg` is already present (peer of react-native-marked) — confirm it's still listed.

- [ ] **Step 2: Confirm the installed style/theme keys**

react-native-marked's exact `MarkedStyles` keys matter (Task 6). After install, check:
```bash
grep -rE "strikethrough|tableRow|tableCell|codespan" node_modules/react-native-marked/dist/**/*.d.ts | head
```
Expected: the type declarations list keys including `strikethrough`, `li`, `tableRow`, `tableCell`. If a key name differs from this plan, use the installed name.

- [ ] **Step 3: Commit**
```bash
git add apps/native/package.json pnpm-lock.yaml
git commit -m "feat(native): add react-native-marked + expo-clipboard for club assistant"
```

---

## Task 2: i18n strings (i18n-js, `%{var}` interpolation)

**Files:**
- Modify: `apps/native/src/i18n/en.json` (the `assistant` object, ~line 393)
- Modify: `apps/native/src/i18n/de.json` (the `assistant` object, ~line 393)

- [ ] **Step 1: Replace the English `assistant` block**
```json
  "assistant": {
    "title": "Club assistant",
    "placeholder": "Ask about games, standings, results",
    "send": "Send",
    "stop": "Stop",
    "regenerate": "Regenerate",
    "copy": "Copy",
    "copied": "Copied",
    "empty": "Ask me about the club's games, standings, or results.",
    "open": "Ask the club assistant",
    "greetingTitle": "Hi! Ask me about the club.",
    "greetingSubtitle": "Fixtures, standings, and recent results — straight from the federation sync.",
    "examplesLabel": "Try asking",
    "examples": [
      "Who plays this weekend?",
      "What place is Herren 1 in?",
      "How did the last games go?"
    ],
    "error": "Something went wrong. Please try again.",
    "activity": {
      "checking": "Checking %{what}…",
      "checked": "Checked %{what}",
      "failed": "Couldn't read %{what}"
    },
    "tools": {
      "get_standings": "standings",
      "get_dashboard": "the club overview",
      "list_matches": "fixtures",
      "fallback": "club data"
    }
  }
```

- [ ] **Step 2: Replace the German `assistant` block**
```json
  "assistant": {
    "title": "Vereins-Assistent",
    "placeholder": "Frag nach Spielen, Tabellen, Ergebnissen",
    "send": "Senden",
    "stop": "Stopp",
    "regenerate": "Neu generieren",
    "copy": "Kopieren",
    "copied": "Kopiert",
    "empty": "Frag mich nach Spielen, Tabellen oder Ergebnissen des Vereins.",
    "open": "Den Vereins-Assistenten fragen",
    "greetingTitle": "Hallo! Frag mich zum Verein.",
    "greetingSubtitle": "Spiele, Tabellen und letzte Ergebnisse — direkt aus der Verbands-Synchronisierung.",
    "examplesLabel": "Zum Beispiel",
    "examples": [
      "Wer spielt am Wochenende?",
      "Auf welchem Platz steht Herren 1?",
      "Wie liefen die letzten Spiele?"
    ],
    "error": "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    "activity": {
      "checking": "%{what} wird geprüft…",
      "checked": "%{what} geprüft",
      "failed": "%{what} konnte nicht gelesen werden"
    },
    "tools": {
      "get_standings": "Tabellen",
      "get_dashboard": "die Vereinsübersicht",
      "list_matches": "Spiele",
      "fallback": "Vereinsdaten"
    }
  }
```

- [ ] **Step 3: Validate JSON**
```bash
node -e "JSON.parse(require('fs').readFileSync('apps/native/src/i18n/en.json','utf8'));JSON.parse(require('fs').readFileSync('apps/native/src/i18n/de.json','utf8'));console.log('ok')"
```
Expected: `ok`

- [ ] **Step 4: Commit**
```bash
git add apps/native/src/i18n/en.json apps/native/src/i18n/de.json
git commit -m "feat(native): i18n strings for club assistant chat UI"
```

---

## Task 3: Extend `messages.ts` with `messageSegments` (TDD)

**Files:**
- Modify: `apps/native/src/lib/assistant/messages.ts`
- Modify: `apps/native/src/lib/assistant/messages.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `apps/native/src/lib/assistant/messages.test.ts`:
```ts
import { messageSegments } from "./messages";

describe("messageSegments", () => {
  it("returns ordered text/tool segments and merges consecutive text", () => {
    const msg = { id: "1", role: "assistant", parts: [
      { type: "text", text: "Let me check. " },
      { type: "text", text: "One sec." },
      { type: "tool-get_standings", state: "output-available" },
      { type: "text", text: "You're 3rd." },
    ] };
    expect(messageSegments(msg)).toEqual([
      { kind: "text", text: "Let me check. One sec." },
      { kind: "tool", part: { type: "tool-get_standings", state: "output-available" } },
      { kind: "text", text: "You're 3rd." },
    ]);
  });

  it("ignores non-text, non-tool parts", () => {
    const msg = { id: "2", role: "assistant", parts: [
      { type: "step-start" },
      { type: "text", text: "hi" },
    ] };
    expect(messageSegments(msg)).toEqual([{ kind: "text", text: "hi" }]);
  });

  it("recognises dynamic-tool parts", () => {
    const msg = { id: "3", role: "assistant", parts: [{ type: "dynamic-tool", toolName: "get_standings", state: "input-available" }] };
    expect(messageSegments(msg)).toEqual([{ kind: "tool", part: { type: "dynamic-tool", toolName: "get_standings", state: "input-available" } }]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**
```bash
pnpm --filter @dragons/native exec vitest run src/lib/assistant/messages.test.ts
```
Expected: FAIL — `messageSegments` is not exported.

- [ ] **Step 3: Update `messages.ts`**

Replace the whole file with:
```ts
export interface UiPart {
  type: string;
  text?: string;
  state?: string;
  toolName?: string;
}
export interface UiMessageLike {
  id: string;
  role: string;
  parts: UiPart[];
}

export type MessageSegment =
  | { kind: "text"; text: string }
  | { kind: "tool"; part: UiPart };

export function messageText(message: UiMessageLike): string {
  return message.parts
    .filter((p): p is UiPart & { text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

/** Split a message into ordered segments, merging consecutive text parts. */
export function messageSegments(message: UiMessageLike): MessageSegment[] {
  const out: MessageSegment[] = [];
  for (const p of message.parts) {
    if (p.type === "text" && typeof p.text === "string") {
      const last = out[out.length - 1];
      if (last && last.kind === "text") last.text += p.text;
      else out.push({ kind: "text", text: p.text });
    } else if (p.type === "dynamic-tool" || p.type.startsWith("tool-")) {
      out.push({ kind: "tool", part: p });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run and confirm pass**
```bash
pnpm --filter @dragons/native exec vitest run src/lib/assistant/messages.test.ts
```
Expected: PASS (original 2 + new 3 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/native/src/lib/assistant/messages.ts apps/native/src/lib/assistant/messages.test.ts
git commit -m "feat(native): messageSegments for ordered chat rendering"
```

---

## Task 4: `tool-parts.ts` — chip mapping (TDD)

**Files:**
- Create: `apps/native/src/lib/assistant/tool-parts.ts`
- Test: `apps/native/src/lib/assistant/tool-parts.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
import { describe, expect, it } from "vitest";
import { toolChip } from "./tool-parts";

describe("toolChip", () => {
  it("maps a finished static tool part to done", () => {
    expect(toolChip({ type: "tool-get_standings", state: "output-available" })).toEqual({ toolKey: "get_standings", status: "done" });
  });
  it("maps in-progress states to running", () => {
    expect(toolChip({ type: "tool-list_matches", state: "input-streaming" })?.status).toBe("running");
    expect(toolChip({ type: "tool-list_matches", state: "input-available" })?.status).toBe("running");
  });
  it("maps output-error to error", () => {
    expect(toolChip({ type: "tool-get_dashboard", state: "output-error" })).toEqual({ toolKey: "get_dashboard", status: "error" });
  });
  it("reads dynamic-tool name", () => {
    expect(toolChip({ type: "dynamic-tool", toolName: "get_standings", state: "output-available" })).toEqual({ toolKey: "get_standings", status: "done" });
  });
  it("returns null for non-tool parts", () => {
    expect(toolChip({ type: "text" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm failure**
```bash
pnpm --filter @dragons/native exec vitest run src/lib/assistant/tool-parts.test.ts
```
Expected: FAIL — `toolChip` not defined.

- [ ] **Step 3: Implement `tool-parts.ts`**
```ts
import type { UiPart } from "./messages";

export type ChatToolStatus = "running" | "done" | "error";
export interface ChatToolChip {
  toolKey: string;
  status: ChatToolStatus;
}

const TOOL_PREFIX = "tool-";

export function toolChip(part: Pick<UiPart, "type" | "state" | "toolName">): ChatToolChip | null {
  let toolKey: string | null = null;
  if (part.type === "dynamic-tool") {
    toolKey = part.toolName ?? "";
  } else if (part.type.startsWith(TOOL_PREFIX)) {
    toolKey = part.type.slice(TOOL_PREFIX.length);
  }
  if (toolKey === null) return null;

  const status: ChatToolStatus =
    part.state === "output-error" ? "error" : part.state === "output-available" ? "done" : "running";
  return { toolKey, status };
}
```

- [ ] **Step 4: Run and confirm pass**
```bash
pnpm --filter @dragons/native exec vitest run src/lib/assistant/tool-parts.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/native/src/lib/assistant/tool-parts.ts apps/native/src/lib/assistant/tool-parts.test.ts
git commit -m "feat(native): tool-part chip mapping"
```

---

## Task 5: `stream-throttle.ts` — `pickDisplayText` (TDD)

**Files:**
- Create: `apps/native/src/lib/assistant/stream-throttle.ts`
- Test: `apps/native/src/lib/assistant/stream-throttle.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
import { describe, expect, it } from "vitest";
import { pickDisplayText } from "./stream-throttle";

describe("pickDisplayText", () => {
  it("shows the full text immediately when not streaming", () => {
    expect(pickDisplayText({ full: "done", shown: "do", isStreaming: false, elapsedMs: 0 })).toBe("done");
  });
  it("holds the shown text within the throttle interval", () => {
    expect(pickDisplayText({ full: "hello wor", shown: "hello", isStreaming: true, elapsedMs: 40 })).toBe("hello");
  });
  it("flushes once the interval has elapsed", () => {
    expect(pickDisplayText({ full: "hello world", shown: "hello", isStreaming: true, elapsedMs: 120 })).toBe("hello world");
  });
  it("flushes early when a new block boundary completes", () => {
    expect(pickDisplayText({ full: "para one\n\npara two", shown: "para one", isStreaming: true, elapsedMs: 10 })).toBe("para one\n\npara two");
  });
});
```

- [ ] **Step 2: Run and confirm failure**
```bash
pnpm --filter @dragons/native exec vitest run src/lib/assistant/stream-throttle.test.ts
```
Expected: FAIL — `pickDisplayText` not defined.

- [ ] **Step 3: Implement `stream-throttle.ts`**
```ts
export interface PickDisplayTextInput {
  /** Latest streamed text. */
  full: string;
  /** Currently displayed text. */
  shown: string;
  isStreaming: boolean;
  /** Milliseconds since the last flush. */
  elapsedMs: number;
  /** Throttle interval (default 100 ms). */
  intervalMs?: number;
}

const blockCount = (s: string): number => s.split("\n\n").length;

/**
 * Decide what text to display for a streaming assistant message. Throttles
 * re-parses to ~intervalMs, but flushes immediately when streaming ends or a
 * new paragraph/block boundary completes (keeps lists and tables coherent).
 */
export function pickDisplayText({ full, shown, isStreaming, elapsedMs, intervalMs = 100 }: PickDisplayTextInput): string {
  if (!isStreaming) return full;
  if (elapsedMs >= intervalMs) return full;
  if (blockCount(full) > blockCount(shown)) return full;
  return shown;
}
```

- [ ] **Step 4: Run and confirm pass**
```bash
pnpm --filter @dragons/native exec vitest run src/lib/assistant/stream-throttle.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/native/src/lib/assistant/stream-throttle.ts apps/native/src/lib/assistant/stream-throttle.test.ts
git commit -m "feat(native): pickDisplayText streaming throttle helper"
```

---

## Task 6: `marked-styles.ts` — theme → react-native-marked styles (TDD)

**Files:**
- Create: `apps/native/src/lib/assistant/marked-styles.ts`
- Test: `apps/native/src/lib/assistant/marked-styles.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
import { describe, expect, it } from "vitest";
import { markedStyles } from "./marked-styles";
import { colors } from "@/theme/colors";
import { textStyles } from "@/theme/typography";
import { spacing, radius } from "@/theme/spacing";

const theme = { colors: colors.dark, textStyles, spacing, radius, isDark: true, mode: "dark" as const, setMode: () => {} };

describe("markedStyles", () => {
  it("maps theme tokens onto markdown elements", () => {
    const s = markedStyles(theme);
    expect(s.text.color).toBe(colors.dark.foreground);
    expect(s.link.color).toBe(colors.dark.primary);
    expect(s.strong.fontFamily).toBe("Inter-SemiBold");
    expect(s.code.backgroundColor).toBe(colors.dark.surfaceLow);
  });
});
```

- [ ] **Step 2: Run and confirm failure**
```bash
pnpm --filter @dragons/native exec vitest run src/lib/assistant/marked-styles.test.ts
```
Expected: FAIL — `markedStyles` not defined.

- [ ] **Step 3: Implement `marked-styles.ts`**

(If `MarkedStyles` is not exported from the package root, import it from `react-native-marked/dist/theme/types` or replace the annotation with the local `Styles` type below.)
```ts
import type { TextStyle, ViewStyle } from "react-native";
import type { useTheme } from "@/hooks/useTheme";

type Theme = ReturnType<typeof useTheme>;

// Structural type matching react-native-marked's MarkedStyles keys we set.
type Styles = Partial<Record<
  | "text" | "paragraph" | "strong" | "em" | "strikethrough" | "link" | "blockquote"
  | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "codespan" | "code" | "hr"
  | "list" | "li" | "image" | "table" | "tableRow" | "tableCell",
  TextStyle & ViewStyle
>>;

export function markedStyles(theme: Theme): Styles {
  const { colors, spacing, radius, textStyles } = theme;
  const heading = (fontSize: number): TextStyle => ({
    color: colors.foreground,
    fontFamily: "SpaceGrotesk-Bold",
    fontSize,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  });
  return {
    text: { color: colors.foreground, fontFamily: "Inter-Regular", fontSize: textStyles.body.fontSize },
    paragraph: { marginTop: spacing.xs, marginBottom: spacing.xs },
    strong: { fontFamily: "Inter-SemiBold", color: colors.foreground },
    em: { fontStyle: "italic" },
    strikethrough: { textDecorationLine: "line-through" },
    link: { color: colors.primary, textDecorationLine: "underline" },
    blockquote: { borderLeftWidth: 2, borderLeftColor: colors.primary, paddingLeft: spacing.md },
    h1: heading(22),
    h2: heading(18),
    h3: heading(16),
    h4: heading(15),
    h5: heading(14),
    h6: heading(13),
    codespan: { backgroundColor: colors.surfaceLow, color: colors.foreground, borderRadius: radius.md, paddingHorizontal: spacing.xs },
    code: { backgroundColor: colors.surfaceLow, color: colors.foreground, padding: spacing.md, borderRadius: radius.md },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: spacing.sm },
    list: { marginTop: spacing.xs, marginBottom: spacing.xs },
    li: { color: colors.foreground },
    table: { borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, marginVertical: spacing.sm },
    tableRow: { borderColor: colors.border },
    tableCell: { padding: spacing.sm },
  };
}
```

- [ ] **Step 4: Run and confirm pass**
```bash
pnpm --filter @dragons/native exec vitest run src/lib/assistant/marked-styles.test.ts
```
Expected: PASS (1 test).

- [ ] **Step 5: Commit**
```bash
git add apps/native/src/lib/assistant/marked-styles.ts apps/native/src/lib/assistant/marked-styles.test.ts
git commit -m "feat(native): theme-mapped react-native-marked styles"
```

---

## Task 7: `AssistantMarkdown` component (the swap-point)

**Files:**
- Create: `apps/native/src/components/assistant/AssistantMarkdown.tsx`

Not coverage-counted (it's a `.tsx`); the logic it depends on (`markedStyles`) is tested in Task 6. Must typecheck + lint.

- [ ] **Step 1: Implement**
```tsx
import { Fragment } from "react";
import { View } from "react-native";
import { useMarkdown } from "react-native-marked";
import { useTheme } from "@/hooks/useTheme";
import { markedStyles } from "@/lib/assistant/marked-styles";

/**
 * The single swap-point for the native markdown renderer. Today: react-native-marked's
 * useMarkdown hook (returns ReactNode[], so no nested FlatList inside the screen list).
 * Future: react-native-streamdown — replace the body, keep the prop.
 */
export function AssistantMarkdown({ text }: { text: string }) {
  const theme = useTheme();
  const elements = useMarkdown(text, {
    colorScheme: theme.isDark ? "dark" : "light",
    styles: markedStyles(theme),
    theme: {
      colors: {
        text: theme.colors.foreground,
        link: theme.colors.primary,
        code: theme.colors.surfaceLow,
        border: theme.colors.border,
        background: "transparent",
      },
    },
  });
  return (
    <View>
      {elements.map((el, i) => (
        <Fragment key={i}>{el}</Fragment>
      ))}
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**
```bash
pnpm --filter @dragons/native exec tsc --noEmit
```
Expected: no errors. If `useMarkdown`'s options type rejects `theme.colors.background: "transparent"`, drop the `background` key (it's deprecated anyway).

- [ ] **Step 3: Commit**
```bash
git add apps/native/src/components/assistant/AssistantMarkdown.tsx
git commit -m "feat(native): AssistantMarkdown renderer (useMarkdown hook)"
```

---

## Task 8: `ActivityChip` component

**Files:**
- Create: `apps/native/src/components/assistant/ActivityChip.tsx`

- [ ] **Step 1: Implement**
```tsx
import { ActivityIndicator, Text, View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { i18n } from "@/lib/i18n";
import { toolChip } from "@/lib/assistant/tool-parts";
import type { UiPart } from "@/lib/assistant/messages";

const KNOWN = new Set(["get_standings", "get_dashboard", "list_matches"]);

export function ActivityChip({ part }: { part: UiPart }) {
  const { colors, spacing, radius, textStyles } = useTheme();
  const chip = toolChip(part);
  if (!chip) return null;

  const what = i18n.t(`assistant.tools.${KNOWN.has(chip.toolKey) ? chip.toolKey : "fallback"}`);

  if (chip.status === "running") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start", backgroundColor: colors.secondary, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, marginBottom: spacing.xs }}>
        <ActivityIndicator size="small" color={colors.secondaryForeground} />
        <Text style={[textStyles.caption, { color: colors.secondaryForeground }]}>{i18n.t("assistant.activity.checking", { what })}</Text>
      </View>
    );
  }
  if (chip.status === "error") {
    return <Text style={[textStyles.caption, { color: colors.destructive, marginBottom: spacing.xs }]}>{i18n.t("assistant.activity.failed", { what })}</Text>;
  }
  return <Text style={[textStyles.caption, { color: colors.mutedForeground, marginBottom: spacing.xs }]}>{`✓ ${i18n.t("assistant.activity.checked", { what })}`}</Text>;
}
```

- [ ] **Step 2: Typecheck + lint**
```bash
pnpm --filter @dragons/native exec tsc --noEmit
pnpm --filter @dragons/native lint
```
Expected: no errors.

- [ ] **Step 3: Commit**
```bash
git add apps/native/src/components/assistant/ActivityChip.tsx
git commit -m "feat(native): activity chip component"
```

---

## Task 9: Rewrite the assistant screen (Document layout, streaming, empty state)

**Files:**
- Modify: `apps/native/src/app/assistant.tsx`

This screen is not coverage-counted; it composes the tested lib helpers + the components above. Verify by typecheck/lint and a device smoke test (Task 10).

- [ ] **Step 1: Replace `apps/native/src/app/assistant.tsx`**
```tsx
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { fetch as expoFetch } from "expo/fetch";
import * as Clipboard from "expo-clipboard";
import { Screen } from "@/components/Screen";
import { useTheme } from "@/hooks/useTheme";
import { multilineInput } from "@/components/ui/inputStyles";
import { resolveApiUrl, authClient } from "@/lib/auth-client";
import { i18n } from "@/lib/i18n";
import { buildAssistantTransportConfig } from "@/lib/assistant/transport";
import { messageText, messageSegments } from "@/lib/assistant/messages";
import type { UiMessageLike } from "@/lib/assistant/messages";
import { pickDisplayText } from "@/lib/assistant/stream-throttle";
import { AssistantMarkdown } from "@/components/assistant/AssistantMarkdown";
import { ActivityChip } from "@/components/assistant/ActivityChip";

/** Throttle streamed text to ~100ms so react-native-marked doesn't re-parse on every token. */
function useThrottledText(full: string, isStreaming: boolean): string {
  const [shown, setShown] = useState(full);
  const lastFlush = useRef(0);
  useEffect(() => {
    const next = pickDisplayText({ full, shown, isStreaming, elapsedMs: Date.now() - lastFlush.current });
    if (next !== shown) {
      lastFlush.current = Date.now();
      setShown(next);
    }
  }, [full, isStreaming, shown]);
  return shown;
}

function MessageItem({ message, isStreaming, onRegenerate }: { message: UiMessageLike; isStreaming: boolean; onRegenerate: () => void }) {
  const { colors, spacing, radius, textStyles } = useTheme();
  const full = messageText(message);
  const shown = useThrottledText(full, isStreaming);
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    return (
      <View style={{ alignSelf: "flex-end", maxWidth: "80%", backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md }}>
        <Text style={[textStyles.body, { color: colors.primaryForeground }]}>{full}</Text>
      </View>
    );
  }

  const toolParts = messageSegments(message).filter((s) => s.kind === "tool");
  const copy = () => {
    void Clipboard.setStringAsync(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={{ borderLeftWidth: 2, borderLeftColor: colors.primary, paddingLeft: spacing.md, marginBottom: spacing.md }}>
      {toolParts.map((s, i) => (s.kind === "tool" ? <ActivityChip key={i} part={s.part} /> : null))}
      <AssistantMarkdown text={shown} />
      {!isStreaming && full.length > 0 ? (
        <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.xs }}>
          <Pressable accessibilityRole="button" onPress={copy}>
            <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>{copied ? i18n.t("assistant.copied") : i18n.t("assistant.copy")}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onRegenerate}>
            <Text style={[textStyles.caption, { color: colors.mutedForeground }]}>{i18n.t("assistant.regenerate")}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  const { colors, spacing, radius, textStyles } = useTheme();
  const examples = i18n.t("assistant.examples") as unknown as string[];
  return (
    <View style={{ gap: spacing.sm, paddingTop: spacing.xl }}>
      <Text style={[textStyles.sectionTitle, { color: colors.foreground }]}>{i18n.t("assistant.greetingTitle")}</Text>
      <Text style={[textStyles.body, { color: colors.mutedForeground }]}>{i18n.t("assistant.greetingSubtitle")}</Text>
      <Text style={[textStyles.label, { color: colors.mutedForeground, marginTop: spacing.sm }]}>{i18n.t("assistant.examplesLabel")}</Text>
      {examples.map((q) => (
        <Pressable key={q} accessibilityRole="button" onPress={() => onPick(q)} style={{ backgroundColor: colors.surfaceLow, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border }}>
          <Text style={[textStyles.body, { color: colors.foreground }]}>{q}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function AssistantScreen() {
  const theme = useTheme();
  const { colors, spacing } = theme;
  const [input, setInput] = useState("");
  const listRef = useRef<FlatList>(null);

  const cfg = buildAssistantTransportConfig({ apiUrl: resolveApiUrl(), cookie: authClient.getCookie(), locale: i18n.locale });
  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: cfg.api,
      headers: cfg.headers,
      body: cfg.body,
      fetch: expoFetch as unknown as typeof globalThis.fetch,
    }),
  });

  useEffect(() => {
    if (messages.length > 0) listRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    void sendMessage({ text: trimmed });
    setInput("");
  };
  const busy = status === "submitted" || status === "streaming";

  return (
    <Screen scroll={false} edges={[]}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          data={messages as unknown as UiMessageLike[]}
          keyExtractor={(msg) => msg.id}
          ListEmptyComponent={<EmptyState onPick={send} />}
          renderItem={({ item, index }) => (
            <MessageItem
              message={item}
              isStreaming={status === "streaming" && index === messages.length - 1 && item.role === "assistant"}
              onRegenerate={() => void regenerate()}
            />
          )}
        />
        {status === "submitted" ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.sm }} /> : null}
        {error ? <Text style={{ color: colors.destructive, marginVertical: spacing.sm }}>{i18n.t("assistant.error")}</Text> : null}
        <View style={{ flexDirection: "row", gap: spacing.sm, alignItems: "flex-end", paddingVertical: spacing.sm }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            multiline
            placeholder={i18n.t("assistant.placeholder")}
            placeholderTextColor={colors.mutedForeground}
            style={[multilineInput(theme), { flex: 1 }]}
          />
          {busy ? (
            <Pressable accessibilityRole="button" onPress={() => stop()}>
              <Text style={{ color: colors.primary, padding: spacing.sm }}>{i18n.t("assistant.stop")}</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" disabled={!input.trim()} onPress={() => send(input)}>
              <Text style={{ color: colors.primary, padding: spacing.sm }}>{i18n.t("assistant.send")}</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
```

- [ ] **Step 2: Typecheck + lint**
```bash
pnpm --filter @dragons/native exec tsc --noEmit
pnpm --filter @dragons/native lint
```
Expected: no errors. If `lint` flags `useThrottledText`'s effect deps, the deps listed (`full`, `isStreaming`, `shown`) are intentional and complete.

- [ ] **Step 3: Commit**
```bash
git add apps/native/src/app/assistant.tsx
git commit -m "feat(native): streaming markdown assistant screen"
```

---

## Task 10: Gates + device smoke test

- [ ] **Step 1: Run native unit tests + lint + typecheck**
```bash
pnpm --filter @dragons/native test
pnpm --filter @dragons/native exec tsc --noEmit
pnpm --filter @dragons/native lint
```
Expected: all pass; coverage for `src/lib/**` stays at/above thresholds (new helpers ship with tests).

- [ ] **Step 2: Device smoke test (New-Architecture build)**

react-native-marked pulls a transitive native table dep and uses `react-native-svg`; both must run on a real RN 0.83 New-Arch build, not just Metro. With Redis up and `CHATBOT_ENABLED=true` + `GOOGLE_GENERATIVE_AI_API_KEY` (root `.env`) and `EXPO_PUBLIC_CHATBOT_ENABLED=true` (`apps/native/.env`), run a dev-client build (`pnpm --filter @dragons/native start --clear`, open in the EAS dev client), log in, open the assistant from the Home tab, and confirm: empty-state chips send, the answer streams as **formatted markdown** (bold, a list), the activity chip shows "Checking…/✓ Checked…", Stop appears mid-stream, copy + regenerate work, light + dark both look right, and there's no VirtualizedList-nesting warning (confirms the `useMarkdown` hook path). Use the correct host: iOS sim `localhost`, Android emulator `http://10.0.2.2:3001`, physical device LAN IP.

- [ ] **Step 3: AI-slop check**
```bash
pnpm check:ai-slop
```
Expected: pass.

---

## Self-review checklist (run before handing off)
- Spec coverage: Document layout (Task 9 `MessageItem`), full-screen modal kept (unchanged route), activity chips (Tasks 4/8), markdown via react-native-marked behind `AssistantMarkdown` swap-point (Tasks 6/7), debounced streaming (Tasks 5/9), stop/regenerate/copy (Task 9), empty-state chips (Task 9 `EmptyState`), i18n (Task 2), testable logic in `src/lib/assistant/` (Tasks 3–6). ✓
- The `useMarkdown`-hook (not `<Markdown>`) decision is explicit (avoids nested VirtualizedLists) and verified in Task 10 Step 2.
- Type names consistent: `UiPart` / `UiMessageLike` / `MessageSegment` (messages.ts), `ChatToolChip` / `ChatToolStatus` / `toolChip` (tool-parts.ts), `pickDisplayText` (stream-throttle.ts), `markedStyles` (marked-styles.ts) — each defined once and imported.
- Native 401 auto-sign-out is intentionally NOT included (dropped in the spec).
