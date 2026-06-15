# Club Assistant — Web Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain web club-assistant `Sheet` with a docked, streaming, markdown-rendering chat panel that matches the Dragons design system (light + dark).

**Architecture:** A `'use client'` entry (`club-assistant.tsx`) gates on session + renders a floating trigger and a `next/dynamic`-loaded docked panel. The panel owns `useChat` (AI SDK v6) and composes small components: `AssistantMessage` (Document layout — user bubble vs assistant prose), `AssistantMarkdown` (a memoized `streamdown` wrapper, sanitized by default, themed via Tailwind), `ChatActivityChip` (tool-part → "Checking…/✓ Checked…"), `AssistantComposer` (send/stop), `AssistantEmptyState` (greeting + example chips). Pure tool-part mapping lives in `parts.ts` (unit-tested); component behavior is covered by an integration test that mocks `@ai-sdk/react`.

**Tech Stack:** Next.js 16 / React 19, `@ai-sdk/react ^3.0.199`, `ai ^6.0.197`, `streamdown ^2.5.0` (rendered directly — not via the AI Elements CLI; rationale: this monorepo keeps shadcn in `@dragons/ui`, so the CLI would scaffold a duplicate shadcn project, and our chip design is lighter than AI Elements' `Tool`), next-intl, Tailwind v4, Vitest + Testing Library (happy-dom).

**Note on the backend:** immutable. We only consume `POST /qa/chat`'s AI SDK v6 UI-message stream.

---

## Task 1: Install streamdown + wire the Tailwind source scan

**Files:**
- Modify: `apps/web/package.json` (via pnpm, not by hand)
- Modify: `packages/ui/src/styles/globals.css` (the stylesheet `apps/web/src/app/layout.tsx` imports as `@dragons/ui/globals.css`)

- [ ] **Step 1: Add the dependency**

Run from the worktree root:
```bash
pnpm --filter @dragons/web add streamdown@^2.5.0
```
Expected: `streamdown` appears under `dependencies` in `apps/web/package.json`; install succeeds.

- [ ] **Step 2: Add the streamdown `@source` scan**

Streamdown emits Tailwind utility classes; without a `@source` directive its output renders unstyled. The web app imports `@dragons/ui/globals.css`, which already lists `@source` lines relative to `packages/ui/src/styles/globals.css`. Add streamdown's dist (resolves to the hoisted root `node_modules` — four levels up from that CSS file):

In `packages/ui/src/styles/globals.css`, immediately after the existing `@source "..";` line (around line 7), add:
```css
@source "../../../../node_modules/streamdown/dist/*.js";
```

- [ ] **Step 3: Verify the scan resolves in a production build**

Run:
```bash
pnpm --filter @dragons/web build
```
Expected: build succeeds. (Full visual confirmation that streamdown classes are emitted happens in Task 10's manual check; this step only confirms the `@source` path doesn't break the build.)

- [ ] **Step 4: Commit**
```bash
git add apps/web/package.json pnpm-lock.yaml packages/ui/src/styles/globals.css
git commit -m "feat(web): add streamdown + tailwind source scan for club assistant"
```

---

## Task 2: i18n strings for the new chat UI

**Files:**
- Modify: `apps/web/src/messages/en.json` (the `qa` object, ~line 1414)
- Modify: `apps/web/src/messages/de.json` (the `qa` object, ~line 1414)

- [ ] **Step 1: Extend the English `qa` block**

Replace the existing `qa` object in `apps/web/src/messages/en.json` with:
```json
  "qa": {
    "trigger": "Ask the club assistant",
    "title": "Club assistant",
    "description": "Ask about fixtures, standings, and recent results.",
    "placeholder": "e.g. who plays this weekend? what place is Herren 1 in?",
    "send": "Send",
    "stop": "Stop",
    "regenerate": "Regenerate",
    "copy": "Copy",
    "copied": "Copied",
    "close": "Close",
    "scrollToBottom": "Scroll to latest",
    "empty": "Ask me about the club's games, standings, or results.",
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
      "checking": "Checking {what}…",
      "checked": "Checked {what}",
      "failed": "Couldn't read {what}"
    },
    "tools": {
      "get_standings": "standings",
      "get_dashboard": "the club overview",
      "list_matches": "fixtures",
      "fallback": "club data"
    }
  }
```

- [ ] **Step 2: Extend the German `qa` block**

Replace the existing `qa` object in `apps/web/src/messages/de.json` with:
```json
  "qa": {
    "trigger": "Den Vereins-Assistenten fragen",
    "title": "Vereins-Assistent",
    "description": "Frag nach Spielen, Tabellen und letzten Ergebnissen.",
    "placeholder": "z. B. wer spielt am Wochenende? auf welchem Platz steht Herren 1?",
    "send": "Senden",
    "stop": "Stopp",
    "regenerate": "Neu generieren",
    "copy": "Kopieren",
    "copied": "Kopiert",
    "close": "Schließen",
    "scrollToBottom": "Zum Neuesten springen",
    "empty": "Frag mich nach Spielen, Tabellen oder Ergebnissen des Vereins.",
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
      "checking": "{what} wird geprüft…",
      "checked": "{what} geprüft",
      "failed": "{what} konnte nicht gelesen werden"
    },
    "tools": {
      "get_standings": "Tabellen",
      "get_dashboard": "die Vereinsübersicht",
      "list_matches": "Spiele",
      "fallback": "Vereinsdaten"
    }
  }
```

- [ ] **Step 2b: Validate both files are valid JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('apps/web/src/messages/en.json','utf8'));JSON.parse(require('fs').readFileSync('apps/web/src/messages/de.json','utf8'));console.log('ok')"
```
Expected: `ok`

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): i18n strings for club assistant chat UI"
```

---

## Task 3: `parts.ts` — pure tool-part → chip mapping (TDD)

**Files:**
- Create: `apps/web/src/components/public/club-assistant/parts.ts`
- Test: `apps/web/src/components/public/club-assistant/parts.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
import { describe, expect, it } from "vitest";
import { toolChip } from "./parts";

describe("toolChip", () => {
  it("maps a finished static tool part to done", () => {
    expect(toolChip({ type: "tool-get_standings", state: "output-available" })).toEqual({
      toolKey: "get_standings",
      status: "done",
    });
  });

  it("maps an in-progress static tool part to running", () => {
    expect(toolChip({ type: "tool-list_matches", state: "input-streaming" })).toEqual({
      toolKey: "list_matches",
      status: "running",
    });
    expect(toolChip({ type: "tool-list_matches", state: "input-available" })?.status).toBe("running");
  });

  it("maps an errored tool part to error", () => {
    expect(toolChip({ type: "tool-get_dashboard", state: "output-error" })).toEqual({
      toolKey: "get_dashboard",
      status: "error",
    });
  });

  it("reads the tool name from a dynamic-tool part", () => {
    expect(toolChip({ type: "dynamic-tool", toolName: "get_standings", state: "output-available" })).toEqual({
      toolKey: "get_standings",
      status: "done",
    });
  });

  it("returns null for non-tool parts", () => {
    expect(toolChip({ type: "text" })).toBeNull();
    expect(toolChip({ type: "step-start" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run:
```bash
pnpm --filter @dragons/web exec vitest run src/components/public/club-assistant/parts.test.ts
```
Expected: FAIL — `toolChip` is not defined.

- [ ] **Step 3: Implement `parts.ts`**
```ts
export type ChatToolStatus = "running" | "done" | "error";

export interface ChatToolChip {
  /** Bare tool name, e.g. "get_standings". */
  toolKey: string;
  status: ChatToolStatus;
}

interface ToolLikePart {
  type: string;
  state?: string;
  toolName?: string;
}

const TOOL_PREFIX = "tool-";

/** Map an AI SDK v6 message part to a chip descriptor, or null if it is not a tool part. */
export function toolChip(part: ToolLikePart): ChatToolChip | null {
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

- [ ] **Step 4: Run the test and confirm it passes**

Run:
```bash
pnpm --filter @dragons/web exec vitest run src/components/public/club-assistant/parts.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/components/public/club-assistant/parts.ts apps/web/src/components/public/club-assistant/parts.test.ts
git commit -m "feat(web): tool-part chip mapping for club assistant"
```

---

## Task 4: `AssistantMarkdown` — memoized streamdown wrapper

**Files:**
- Create: `apps/web/src/components/public/club-assistant/assistant-markdown.tsx`

No standalone test (covered by Task 6's integration render). This file only configures streamdown + theming.

- [ ] **Step 1: Implement the wrapper**
```tsx
"use client";

import { memo } from "react";
import { Streamdown } from "streamdown";

interface AssistantMarkdownProps {
  text: string;
  /** True while this message is still streaming, so streamdown animates the tail. */
  isStreaming?: boolean;
}

/**
 * Renders assistant markdown via streamdown. streamdown sanitizes by default
 * (rehype-sanitize + rehype-harden) and repairs incomplete markdown mid-stream —
 * do NOT pass rehypePlugins/remarkPlugins here, which would REPLACE (not merge)
 * the defaults and drop sanitization.
 *
 * Theming: the `prose-*` utility classes map markdown elements to design tokens
 * (Inter body, Space Grotesk headings, rounded-md, tonal surfaces, primary links).
 */
function AssistantMarkdownImpl({ text, isStreaming }: AssistantMarkdownProps) {
  return (
    <Streamdown
      isAnimating={isStreaming}
      className={[
        "text-sm leading-relaxed text-foreground",
        "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
        "[&_h1]:font-display [&_h2]:font-display [&_h3]:font-display [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-3",
        "[&_code]:rounded [&_code]:bg-surface-low [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
        "[&_pre]:my-2 [&_pre]:rounded-md [&_pre]:bg-surface-low [&_pre]:p-3 [&_pre]:text-xs",
        "[&_table]:my-2 [&_table]:w-full [&_table]:text-xs",
        "[&_th]:font-display [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:text-left [&_th]:px-2 [&_th]:py-1",
        "[&_td]:px-2 [&_td]:py-1 [&_tr]:odd:bg-surface-low",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
      ].join(" ")}
    >
      {text}
    </Streamdown>
  );
}

export const AssistantMarkdown = memo(
  AssistantMarkdownImpl,
  (prev, next) => prev.text === next.text && prev.isStreaming === next.isStreaming,
);
```

- [ ] **Step 2: Typecheck**

Run:
```bash
pnpm --filter @dragons/web exec tsc --noEmit
```
Expected: no errors from this file. (If `streamdown` types are missing, confirm Task 1 installed it.)

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/components/public/club-assistant/assistant-markdown.tsx
git commit -m "feat(web): themed streamdown markdown renderer"
```

---

## Task 5: `ChatActivityChip`

**Files:**
- Create: `apps/web/src/components/public/club-assistant/chat-activity-chip.tsx`

Covered by Task 6's integration test (asserts the chip text). Uses `toolChip` from Task 3.

- [ ] **Step 1: Implement the chip**
```tsx
"use client";

import { useTranslations } from "next-intl";
import { toolChip } from "./parts";

interface ChatActivityChipProps {
  part: { type: string; state?: string; toolName?: string };
}

const KNOWN_TOOLS = new Set(["get_standings", "get_dashboard", "list_matches"]);

/** A compact "Checking …/✓ Checked …" chip for one tool part. Renders nothing for non-tool parts. */
export function ChatActivityChip({ part }: ChatActivityChipProps) {
  const t = useTranslations("qa");
  const chip = toolChip(part);
  if (!chip) return null;

  const what = t(`tools.${KNOWN_TOOLS.has(chip.toolKey) ? chip.toolKey : "fallback"}` as Parameters<typeof t>[0]);

  if (chip.status === "running") {
    return (
      <span className="mb-2 inline-flex items-center gap-2 rounded-4xl bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
        <span className="size-2 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
        {t("activity.checking", { what })}
      </span>
    );
  }
  if (chip.status === "error") {
    return (
      <span className="mb-2 inline-flex items-center gap-1.5 text-xs text-destructive">
        {t("activity.failed", { what })}
      </span>
    );
  }
  return (
    <span className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span aria-hidden>✓</span>
      {t("activity.checked", { what })}
    </span>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add apps/web/src/components/public/club-assistant/chat-activity-chip.tsx
git commit -m "feat(web): activity chip for club assistant tool parts"
```

---

## Task 6: `AssistantMessage` (Document layout) (TDD)

**Files:**
- Create: `apps/web/src/components/public/club-assistant/assistant-message.tsx`
- Test: `apps/web/src/components/public/club-assistant/assistant-message.test.tsx`

- [ ] **Step 1: Write the failing test**
```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AssistantMessage } from "./assistant-message";

const messages = {
  qa: {
    copy: "Copy",
    copied: "Copied",
    regenerate: "Regenerate",
    activity: { checking: "Checking {what}…", checked: "Checked {what}", failed: "Couldn't read {what}" },
    tools: { get_standings: "standings", get_dashboard: "the club overview", list_matches: "fixtures", fallback: "club data" },
  },
};
function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>;
}

afterEach(cleanup);

describe("AssistantMessage", () => {
  it("renders a user message as plain text", () => {
    render(wrap(<AssistantMessage message={{ id: "u1", role: "user", parts: [{ type: "text", text: "hello" }] }} onRegenerate={vi.fn()} />));
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders assistant markdown (bold becomes <strong>)", () => {
    render(wrap(<AssistantMessage message={{ id: "a1", role: "assistant", parts: [{ type: "text", text: "Herren 1 are **3rd**." }] }} onRegenerate={vi.fn()} />));
    const strong = screen.getByText("3rd");
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders an activity chip for a finished tool part", () => {
    render(wrap(<AssistantMessage message={{ id: "a2", role: "assistant", parts: [{ type: "tool-get_standings", state: "output-available" }, { type: "text", text: "ok" }] }} onRegenerate={vi.fn()} />));
    expect(screen.getByText("Checked standings")).toBeInTheDocument();
  });

  it("shows copy + regenerate on a finished assistant turn and calls regenerate", () => {
    const onRegenerate = vi.fn();
    render(wrap(<AssistantMessage message={{ id: "a3", role: "assistant", parts: [{ type: "text", text: "done" }] }} onRegenerate={onRegenerate} />));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run:
```bash
pnpm --filter @dragons/web exec vitest run src/components/public/club-assistant/assistant-message.test.tsx
```
Expected: FAIL — cannot resolve `./assistant-message`.

- [ ] **Step 3: Implement `AssistantMessage`**
```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AssistantMarkdown } from "./assistant-markdown";
import { ChatActivityChip } from "./chat-activity-chip";

interface MessagePart {
  type: string;
  text?: string;
  state?: string;
  toolName?: string;
}
export interface ChatMessage {
  id: string;
  role: string;
  parts: MessagePart[];
}

interface AssistantMessageProps {
  message: ChatMessage;
  /** True while this is the last message and still streaming. */
  isStreaming?: boolean;
  onRegenerate: () => void;
}

/** Join the text from this message's parts (markdown source). */
function messageText(parts: MessagePart[]): string {
  return parts
    .filter((p): p is MessagePart & { text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

export function AssistantMessage({ message, isStreaming, onRegenerate }: AssistantMessageProps) {
  const t = useTranslations("qa");
  const [copied, setCopied] = useState(false);
  const text = messageText(message.parts);

  if (message.role === "user") {
    return (
      <div className="ml-auto max-w-[80%] rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
        {text}
      </div>
    );
  }

  const toolParts = message.parts.filter((p) => p.type === "dynamic-tool" || p.type.startsWith("tool-"));
  const copy = () => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border-l-2 border-primary pl-3">
      {toolParts.map((part, i) => (
        <ChatActivityChip key={i} part={part} />
      ))}
      <AssistantMarkdown text={text} isStreaming={isStreaming} />
      {!isStreaming && text.length > 0 ? (
        <div className="mt-2 flex gap-3 text-muted-foreground">
          <button type="button" onClick={copy} className="text-xs hover:text-foreground">
            {copied ? t("copied") : t("copy")}
          </button>
          <button type="button" onClick={onRegenerate} className="text-xs hover:text-foreground">
            {t("regenerate")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run:
```bash
pnpm --filter @dragons/web exec vitest run src/components/public/club-assistant/assistant-message.test.tsx
```
Expected: PASS (4 tests). If the markdown assertion is flaky under happy-dom, confirm streamdown rendered by querying `screen.getByText("3rd")` — it must be inside a `<strong>`.

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/components/public/club-assistant/assistant-message.tsx apps/web/src/components/public/club-assistant/assistant-message.test.tsx
git commit -m "feat(web): document-layout assistant message with chips + actions"
```

---

## Task 7: `AssistantEmptyState` (TDD)

**Files:**
- Create: `apps/web/src/components/public/club-assistant/assistant-empty-state.tsx`
- Test: `apps/web/src/components/public/club-assistant/assistant-empty-state.test.tsx`

- [ ] **Step 1: Write the failing test**
```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AssistantEmptyState } from "./assistant-empty-state";

const messages = {
  qa: {
    greetingTitle: "Hi! Ask me about the club.",
    greetingSubtitle: "Fixtures, standings, and recent results.",
    examplesLabel: "Try asking",
    examples: ["Who plays this weekend?", "What place is Herren 1 in?", "How did the last games go?"],
  },
};
function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>;
}
afterEach(cleanup);

describe("AssistantEmptyState", () => {
  it("renders the greeting and three example chips", () => {
    render(wrap(<AssistantEmptyState onPick={vi.fn()} />));
    expect(screen.getByText("Hi! Ask me about the club.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Who plays this weekend?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "How did the last games go?" })).toBeInTheDocument();
  });

  it("calls onPick with the chosen question", () => {
    const onPick = vi.fn();
    render(wrap(<AssistantEmptyState onPick={onPick} />));
    fireEvent.click(screen.getByRole("button", { name: "What place is Herren 1 in?" }));
    expect(onPick).toHaveBeenCalledWith("What place is Herren 1 in?");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**
```bash
pnpm --filter @dragons/web exec vitest run src/components/public/club-assistant/assistant-empty-state.test.tsx
```
Expected: FAIL — cannot resolve `./assistant-empty-state`.

- [ ] **Step 3: Implement `AssistantEmptyState`**
```tsx
"use client";

import { useTranslations } from "next-intl";

interface AssistantEmptyStateProps {
  onPick: (question: string) => void;
}

export function AssistantEmptyState({ onPick }: AssistantEmptyStateProps) {
  const t = useTranslations("qa");
  const examples = t.raw("examples") as string[];

  return (
    <div className="flex flex-1 flex-col justify-end gap-3 pb-2">
      <p className="font-display text-lg font-bold text-foreground">{t("greetingTitle")}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{t("greetingSubtitle")}</p>
      <p className="mt-1 font-display text-xs uppercase tracking-wide text-muted-foreground">{t("examplesLabel")}</p>
      <div className="flex flex-col gap-2">
        {examples.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="rounded-4xl bg-surface-low px-3 py-2 text-left text-sm text-foreground ring-1 ring-foreground/10 hover:bg-surface-high"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**
```bash
pnpm --filter @dragons/web exec vitest run src/components/public/club-assistant/assistant-empty-state.test.tsx
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/components/public/club-assistant/assistant-empty-state.tsx apps/web/src/components/public/club-assistant/assistant-empty-state.test.tsx
git commit -m "feat(web): empty state with example questions"
```

---

## Task 8: `AssistantComposer` (TDD)

**Files:**
- Create: `apps/web/src/components/public/club-assistant/assistant-composer.tsx`
- Test: `apps/web/src/components/public/club-assistant/assistant-composer.test.tsx`

- [ ] **Step 1: Write the failing test**
```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AssistantComposer } from "./assistant-composer";

const messages = { qa: { placeholder: "Ask…", send: "Send", stop: "Stop" } };
function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>;
}
afterEach(cleanup);

describe("AssistantComposer", () => {
  it("submits trimmed input and clears the field", () => {
    const onSend = vi.fn();
    render(wrap(<AssistantComposer status="ready" onSend={onSend} onStop={vi.fn()} />));
    const box = screen.getByPlaceholderText("Ask…") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "  hi  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("hi");
    expect(box.value).toBe("");
  });

  it("shows Stop while streaming and calls onStop", () => {
    const onStop = vi.fn();
    render(wrap(<AssistantComposer status="streaming" onSend={vi.fn()} onStop={onStop} />));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("does not send empty input", () => {
    const onSend = vi.fn();
    render(wrap(<AssistantComposer status="ready" onSend={onSend} onStop={vi.fn()} />));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**
```bash
pnpm --filter @dragons/web exec vitest run src/components/public/club-assistant/assistant-composer.test.tsx
```
Expected: FAIL — cannot resolve `./assistant-composer`.

- [ ] **Step 3: Implement `AssistantComposer`**
```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@dragons/ui/components/button";
import { Textarea } from "@dragons/ui/components/textarea";

type ChatStatus = "submitted" | "streaming" | "ready" | "error";

interface AssistantComposerProps {
  status: ChatStatus;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function AssistantComposer({ status, onSend, onStop }: AssistantComposerProps) {
  const t = useTranslations("qa");
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput("");
  };

  return (
    <form className="flex items-end gap-2" onSubmit={submit}>
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={t("placeholder")}
        className="max-h-32 min-h-[2.5rem] resize-none rounded-md"
        rows={1}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) submit(e);
        }}
      />
      {busy ? (
        <Button type="button" variant="outline" onClick={onStop}>
          {t("stop")}
        </Button>
      ) : (
        <Button type="submit">{t("send")}</Button>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**
```bash
pnpm --filter @dragons/web exec vitest run src/components/public/club-assistant/assistant-composer.test.tsx
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/components/public/club-assistant/assistant-composer.tsx apps/web/src/components/public/club-assistant/assistant-composer.test.tsx
git commit -m "feat(web): composer with send/stop states"
```

---

## Task 9: `AssistantPanel` — the docked panel

**Files:**
- Create: `apps/web/src/components/public/club-assistant/assistant-panel.tsx`

Behavior is covered by Task 10's integration test (mounted via `ClubAssistant`).

- [ ] **Step 1: Implement `AssistantPanel`**
```tsx
"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useLocale, useTranslations } from "next-intl";
import { AssistantMessage, type ChatMessage } from "./assistant-message";
import { AssistantComposer } from "./assistant-composer";
import { AssistantEmptyState } from "./assistant-empty-state";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface AssistantPanelProps {
  onClose: () => void;
}

export function AssistantPanel({ onClose }: AssistantPanelProps) {
  const t = useTranslations("qa");
  const locale = useLocale();
  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: `${API_BASE}/qa/chat`,
      credentials: "include",
      body: { locale },
    }),
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = (text: string) => void sendMessage({ text });

  return (
    <div className="fixed bottom-[calc(5rem+var(--safe-area-bottom))] right-4 z-50 flex h-[min(36rem,calc(100dvh-7rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md bg-popover shadow-lg ring-1 ring-foreground/10 sm:bottom-6 sm:w-96">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="font-display text-sm font-bold uppercase tracking-tight text-foreground">{t("title")}</span>
        <button type="button" onClick={onClose} aria-label={t("close")} className="ml-auto text-muted-foreground hover:text-foreground">
          ✕
        </button>
      </div>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
        {messages.length === 0 ? (
          <AssistantEmptyState onPick={send} />
        ) : (
          messages.map((m, i) => (
            <AssistantMessage
              key={m.id}
              message={m as unknown as ChatMessage}
              isStreaming={status === "streaming" && i === messages.length - 1 && m.role === "assistant"}
              onRegenerate={() => void regenerate()}
            />
          ))
        )}
        {status === "submitted" ? <p className="text-sm text-muted-foreground">…</p> : null}
      </div>

      {error ? <p className="px-4 py-1 text-sm text-destructive">{t("error")}</p> : null}

      <div className="px-4 py-3">
        <AssistantComposer status={status} onSend={send} onStop={stop} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**
```bash
pnpm --filter @dragons/web exec tsc --noEmit
```
Expected: no errors. (The `as unknown as ChatMessage` cast bridges the AI SDK `UIMessage` type to the local part shape; keep it narrow.)

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/components/public/club-assistant/assistant-panel.tsx
git commit -m "feat(web): docked assistant panel wiring useChat"
```

---

## Task 10: Rewrite `club-assistant.tsx` (trigger + dynamic panel) + integration tests (TDD)

**Files:**
- Modify: `apps/web/src/components/public/club-assistant.tsx`
- Modify: `apps/web/src/components/public/club-assistant.test.tsx`

- [ ] **Step 1: Update the integration test (write the new expectations first)**

Replace `apps/web/src/components/public/club-assistant.test.tsx` with:
```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const sendMessage = vi.fn();
const stop = vi.fn();
const regenerate = vi.fn();
const chatMock = vi.fn(() => ({ messages: [] as unknown[], sendMessage, status: "ready", error: undefined, stop, regenerate }));
vi.mock("@ai-sdk/react", () => ({ useChat: () => chatMock() }));
vi.mock("ai", () => ({ DefaultChatTransport: class { constructor(_o: unknown) {} } }));
const sessionMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => sessionMock() } }));

import { ClubAssistant } from "./club-assistant";

const messages = {
  qa: {
    trigger: "Ask the club assistant", title: "Club assistant", description: "d", placeholder: "p",
    send: "Send", stop: "Stop", regenerate: "Regenerate", copy: "Copy", copied: "Copied", close: "Close",
    empty: "e", greetingTitle: "Hi!", greetingSubtitle: "sub", examplesLabel: "Try asking",
    examples: ["Who plays this weekend?", "Standings?", "Results?"],
    error: "Something went wrong. Please try again.",
    activity: { checking: "Checking {what}…", checked: "Checked {what}", failed: "Couldn't read {what}" },
    tools: { get_standings: "standings", get_dashboard: "the club overview", list_matches: "fixtures", fallback: "club data" },
  },
};
function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>;
}

describe("ClubAssistant", () => {
  afterEach(cleanup);
  beforeEach(() => {
    chatMock.mockReturnValue({ messages: [], sendMessage, status: "ready", error: undefined, stop, regenerate });
    sendMessage.mockReset();
    sessionMock.mockReturnValue({ data: { user: { id: "u1" } } });
  });

  it("renders the trigger for a logged-in member", () => {
    render(wrap(<ClubAssistant />));
    expect(screen.getByRole("button", { name: "Ask the club assistant" })).toBeInTheDocument();
  });

  it("renders nothing for an anonymous visitor", () => {
    sessionMock.mockReturnValue({ data: null });
    const { container } = render(wrap(<ClubAssistant />));
    expect(container).toBeEmptyDOMElement();
  });

  it("opens the panel and shows the empty state with example chips", async () => {
    render(wrap(<ClubAssistant />));
    fireEvent.click(screen.getByRole("button", { name: "Ask the club assistant" }));
    expect(await screen.findByText("Hi!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Who plays this weekend?" })).toBeInTheDocument();
  });

  it("sends an example question when a chip is tapped", async () => {
    render(wrap(<ClubAssistant />));
    fireEvent.click(screen.getByRole("button", { name: "Ask the club assistant" }));
    fireEvent.click(await screen.findByRole("button", { name: "Standings?" }));
    expect(sendMessage).toHaveBeenCalledWith({ text: "Standings?" });
  });

  it("renders the error message when useChat returns an error", async () => {
    chatMock.mockReturnValue({ messages: [], sendMessage, status: "error", error: new Error("boom"), stop, regenerate });
    render(wrap(<ClubAssistant />));
    fireEvent.click(screen.getByRole("button", { name: "Ask the club assistant" }));
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**
```bash
pnpm --filter @dragons/web exec vitest run src/components/public/club-assistant.test.tsx
```
Expected: FAIL — the current `club-assistant.tsx` still renders the old `Sheet` (no "Hi!" greeting, no dynamic panel).

- [ ] **Step 3: Rewrite `club-assistant.tsx`**
```tsx
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Button } from "@dragons/ui/components/button";

// Code-split: streamdown + the panel only load when the member opens the chat.
const AssistantPanel = dynamic(() => import("./club-assistant/assistant-panel").then((m) => m.AssistantPanel), {
  ssr: false,
});

export function ClubAssistant() {
  const { data: session } = authClient.useSession();
  const t = useTranslations("qa");
  const [open, setOpen] = useState(false);

  if (!session?.user) return null;

  return (
    <>
      {open ? null : (
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-[calc(5rem+var(--safe-area-bottom))] right-4 z-40 shadow-lg md:bottom-6"
        >
          {t("trigger")}
        </Button>
      )}
      {open ? <AssistantPanel onClose={() => setOpen(false)} /> : null}
    </>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**
```bash
pnpm --filter @dragons/web exec vitest run src/components/public/club-assistant.test.tsx
```
Expected: PASS (5 tests). `findBy*` awaits the `next/dynamic` panel chunk.

- [ ] **Step 5: Manual smoke check (real browser)**

With Redis up (`docker compose -f docker/docker-compose.dev.yml up -d`), `CHATBOT_ENABLED=true` + `GOOGLE_GENERATIVE_AI_API_KEY` in root `.env`, and `NEXT_PUBLIC_CHATBOT_ENABLED=true` in `apps/web/.env.local`, run `pnpm dev`, log in as a member, open the chat, and confirm: trigger → docked panel, example chip sends, the answer streams as **formatted markdown** (a bold word renders bold, a table renders as a table), the activity chip shows "Checking …/✓ Checked …", Stop appears mid-stream, copy + regenerate work, light + dark both look right. Note in the commit if the iOS<16.4 streamdown crash (#519) needs the patch-package mitigation for your Safari matrix.

- [ ] **Step 6: Commit**
```bash
git add apps/web/src/components/public/club-assistant.tsx apps/web/src/components/public/club-assistant.test.tsx
git commit -m "feat(web): docked streaming club assistant chat UI"
```

---

## Task 11: Gates

- [ ] **Step 1: Lint, typecheck, test, coverage**
```bash
pnpm --filter @dragons/web lint
pnpm --filter @dragons/web exec tsc --noEmit
pnpm --filter @dragons/web test
pnpm --filter @dragons/web coverage
```
Expected: all pass; web coverage stays at or above its current thresholds (the new files ship with tests). If coverage dips, add focused tests for any uncovered branch (e.g. the `error`/`failed` chip path) rather than lowering thresholds.

- [ ] **Step 2: AI-slop check (docs only — sanity)**
```bash
pnpm check:ai-slop
```
Expected: pass.

---

## Self-review checklist (run before handing off)
- Spec coverage: Document layout (Task 6), docked panel (Task 9/10), activity chips (Tasks 3/5/6), markdown via streamdown sanitized (Task 4), stop/regenerate/copy (Tasks 6/8), empty-state chips (Task 7), i18n (Task 2), `@source` scan (Task 1), lazy `'use client'` island (Task 10). ✓
- The iOS<16.4 (#519) decision is surfaced in Task 10 Step 5 as a real check, not silently skipped.
- Type names are consistent: `ChatMessage` / `ChatToolChip` / `ChatToolStatus` / `toolChip` are defined once and reused.
