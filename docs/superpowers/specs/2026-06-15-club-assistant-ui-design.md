# Club Assistant — Professional Chat UI (web + native)

**Date:** 2026-06-15
**Status:** Approved design, ready for planning
**Relationship:** Extends the merged club Q&A assistant (`docs/superpowers/specs/2026-06-15-club-qa-assistant-design.md`). That work delivered a working end-to-end chatbot with a plain UI. This spec covers the **presentation layer only** — a polished, streaming, markdown-rendering chat experience on both platforms.

## Goal

Turn the functional-but-plain club assistant into a product-grade chat surface on web (Next.js 16) and native (Expo 55 / RN 0.83): smooth streaming, markdown formatting, surfaced tool activity, and design-system fidelity in light and dark.

## Non-goals (out of scope)

The backend is immutable. Do **not** change:
- `POST /qa/chat`, `streamClubQaChat`, the tools, auth, rate-limiting, or feature flags.
- The AI SDK v6 UI-message stream contract.

Also out of scope for this work:
- Native 401 auto-sign-out recovery (explicitly dropped).
- Conversation persistence / history, analytics, regenerate-with-variations, new tools.
- A non-streaming fallback endpoint.

## Background — what we consume

`useChat` (`@ai-sdk/react ^3.0.199`, `ai ^6.0.197`) over `DefaultChatTransport` → `${API}/qa/chat`. Each `UIMessage` has `role` and an ordered `parts` array. Parts are **text**, **tool-call**, and **tool-result** objects. The model (Gemini 2.5 Flash) emits markdown-ish prose and may call up to three read-only tools (`get_dashboard`, `get_standings`, `list_matches`). Today the UI renders only text parts as raw text.

## Locked design decisions

| Decision | Choice |
|---|---|
| Message surface | **B · Document** — user turns are bubbles; assistant turns are full-width markdown prose behind a thin green rule + role label. No assistant bubble. |
| Tool activity | **Activity chips** — a chip per tool part, "Checking …" (spinner) → "✓ Checked …" (collapsed), rendered inline in parts order. |
| Web shell | **Docked panel** — floating trigger expands into a rounded card anchored bottom-right; full-screen on mobile. Replaces the side `Sheet`. |
| Native shell | **Full-screen modal screen** (unchanged route, reworked content). |
| Markdown | Full GFM on web (bold, italic, lists, links, code, tables). Native: same set; tables are best-effort. |
| Extra controls | **Stop**, **Regenerate**, **Copy** per assistant turn. |
| Empty state | Greeting + tappable example-question chips. |
| Renderer (web) | `streamdown` via Vercel **AI Elements** (vendored). |
| Renderer (native) | `react-native-marked` with debounced streaming, behind an `AssistantMarkdown` abstraction. |

## Message model & rendering contract

Both platforms read `message.parts` and render by type. Tool parts surface as **activity chips above** the assistant prose (matching the design mockups); the message's text parts render as one markdown block beneath them. For Q&A the model calls tools before writing the answer, so the natural order is `[tools…, text]` and this reads as a clean timeline. Each part is handled by type:

- **text part** → markdown prose (assistant) / plain text inside the bubble (user).
- **tool part** → an activity chip. Detection contract (identical on both platforms, per AI SDK v6 tool-usage docs):
  - Static tool: `part.type === "tool-<toolName>"` → label derived from the suffix.
  - Dynamic tool: `part.type === "dynamic-tool"`, name in `part.toolName`.
  - Visual state is driven by `part.state`: `input-streaming`/`input-available` → running (spinner), `output-available` → done (check), `output-error` → error.
  - `part.input` / `part.output` / `part.errorText` carry detail (collapsed by default; not surfaced in v1 beyond the chip label, but the structure is preserved so an expandable detail view is a later add).

Tool names map to friendly, localized labels (see i18n). Raw tool output JSON is **not** shown in v1 — the chip is a trust signal ("this answer read live standings"), not a debugger.

## Web design (`apps/web`)

### Library stack & adoption
- Add `streamdown@^2.5.0`.
- Run `npx ai-elements@latest add response message conversation tool` to **vendor** AI Elements source into `apps/web/src/components/ai-elements/` (zero runtime dependency; we own the copy).
- We compose AI Elements' `Response` (the memo-wrapped Streamdown — handles streaming + incomplete-markdown repair + GFM + sanitization), `Tool*` (activity chips, implements the exact part.type/part.state mapping above), and `Conversation`/`ConversationContent` (stick-to-bottom scroll). We do **not** use its default bubble `Message` layout — we render the approved Document layout ourselves.
- `remark-gfm` is bundled by Streamdown; do not add it separately. Skip `@streamdown/math` and `@streamdown/mermaid`. Add `@streamdown/code` only if code blocks prove common (defer).

### Component decomposition (`apps/web/src/components/public/`)
Small, single-purpose units:
- **`club-assistant.tsx`** — entry island. Session gate (`authClient.useSession()`), open/close state, renders the trigger + `AssistantPanel`. Stays a lazy-loaded `'use client'` boundary (see Security). Already mounted in `(public)/layout.tsx` behind `NEXT_PUBLIC_CHATBOT_ENABLED`.
- **`assistant-panel.tsx`** — docked-panel shell: header (title + close), `ConversationContent` message list, composer. Owns `useChat`.
- **`assistant-message.tsx`** — renders one message's parts in order: user → green bubble; assistant → role label + activity chips (`Tool`) + `Response` markdown; finished assistant turns get the copy/regenerate row.
- **`assistant-empty-state.tsx`** — greeting + example-question chips; a tap calls `sendMessage({ text })`.
- **`assistant-composer.tsx`** — auto-growing `Textarea`; the action button is **Send** when idle and **Stop** (`stop()`) while `status` is `submitted`/`streaming`.
- **`assistant-trigger.tsx`** — the floating FAB (collapsed) / open state.

### Theming
AI Elements is CSS-variable-only, so it inherits our shadcn tokens automatically. Style the rendered output with Tailwind utilities mapped to design tokens: assistant prose container uses `font-sans` (Inter), headings `font-display` (Space Grotesk), `rounded-md`, tonal surfaces for code blocks, `text-primary` links, `border` for table rules. The docked panel uses `bg-popover shadow-lg ring-1 ring-foreground/10` (the design-system floating treatment). Message rows sit on the panel surface; user bubbles `bg-primary text-primary-foreground`, activity chips `bg-secondary text-secondary-foreground` (running) collapsing to a muted "✓ Checked …" line (done).

**Required build step:** add a Tailwind `@source` directive pointing at `streamdown/dist/index.js` to the web Tailwind CSS entry, or Streamdown output renders unstyled. The relative path must resolve to the **hoisted root** `node_modules` in this pnpm/Turborepo layout (not a local `apps/web/node_modules`); confirm the exact path against the CSS entry's location and verify the resolved scan in a production build.

### Streaming
Render the raw growing buffer on every token — Streamdown's `remend` repair parser auto-closes dangling bold/italic/links/lists and partial tables. AI Elements' memo'd `Response` re-renders only when content or animation state changes, so per-token cost stays bounded as history grows. Known gap: code **fences** don't stream incrementally (streamdown #473) — a fenced block stays raw until its closing ```` ``` ```` arrives. Acceptable for a Q&A chat. Keep sanitization ON — do not override `rehypePlugins` (it replaces rather than merges and would drop `rehype-sanitize`/`rehype-harden`).

### States
- **Empty:** greeting + 3 example chips.
- **Submitted/streaming:** typing/activity indicators; composer shows Stop.
- **Error:** the existing error line, plus a Regenerate affordance to retry the last turn.
- **Auto-scroll:** stick to bottom via `Conversation`; show a "scroll to bottom" affordance when the user scrolls up mid-stream.

### Web risks / mitigations
- **iOS < 16.4 Safari hard crash** at Streamdown module init (#519, open — lookbehind regex in `remend` + gfm-autolink). Mitigation: `patch-package` the regex, or render the `react-markdown` fallback for that UA matrix. Decide during implementation; document whichever we pick.
- **Lazy `'use client'` island** — Streamdown's dist starts with `'use client'`; it cannot live in an RSC server component. Code-split it so it doesn't weigh on public pages for non-members.
- **AI Elements license is NOASSERTION + a vendored snapshot** — read `LICENSE` before shipping; we own re-pulling upstream security/bug fixes.
- **Fallback (documented, not built):** `react-markdown@10 + remark-gfm + rehype-sanitize`, block-memoized, if Streamdown's iOS issue or the monorepo Tailwind scan proves troublesome.

## Native design (`apps/native`)

### Library stack
- Add `react-native-marked@^8.1.0` (marked 18 → RN `Text`/`View`; peer `react-native-svg`, already present at `^15`). **No new native module, no prebuild config plugin, no `react-native-worklets` version interaction with `reanimated@4.3.1`.**
- This is deliberately the lower-risk path. The premium `react-native-streamdown` + `react-native-enriched-markdown` stack (true Fabric markdown, token-by-token repair, real tables) is the documented **future upgrade**, gated on it reaching ≥1.0 and shipping an incremental-parse API (perf issue #391).

### Component decomposition
Testable logic stays in `src/lib/assistant/` (native vitest only covers `src/lib/**`; the screen `.tsx` is not coverage-counted — keep it thin):

- **`lib/assistant/transport.ts`** (exists) — keep `buildAssistantTransportConfig`.
- **`lib/assistant/messages.ts`** (exists, extend) — add `messageSegments(message)`: split a `UIMessage` into an ordered list of typed segments (`{kind:"text", text}` | `{kind:"tool", part}`) for rendering. Keep `messageText` for any text-join needs.
- **`lib/assistant/tool-parts.ts`** (new) — `toolChip(part)` → `{ labelKey, what, status }` from `part.type`/`part.state` (the detection contract above). Pure, fully tested.
- **`lib/assistant/stream-flush.ts`** (new) — pure scheduling helper for debounced streaming: given last-flush time and now, decide whether to flush (~100 ms cadence, or on a block boundary / final). The screen's render hook wraps this; the decision logic is pure and tested.
- **`lib/assistant/marked-styles.ts`** (new) — `markedStyles(theme)`: maps `useTheme()` `{colors, textStyles, spacing, radius}` to react-native-marked's per-element style object (headings → Space Grotesk + `textStyles`, body → Inter, code bg → tonal surface, links → `colors.primary`, table rules → `colors.border`, padding → `spacing`, corners → `radius`). Pure, tested.

Native UI (`apps/native/src/components/assistant/`, not coverage-counted but isolated):
- **`AssistantMarkdown.tsx`** — wraps react-native-marked `<Markdown>` with `markedStyles(theme)`. **This is the single swap-point** for a future streamdown upgrade.
- **`ActivityChip.tsx`** — themed `Pressable` pill driven by `toolChip()` output (color by status, `radius.pill`, `textStyles.label`).
- **`MessageList` / `AssistantTurn` / `UserBubble` / `ExampleChips` / `Composer`** — the Document layout, empty state, and composer (Send/Stop), reusing `Screen`, `multilineInput`, and the root `KeyboardProvider`.
- **`app/assistant.tsx`** — the screen: wires `useChat`, the debounced-render hook (using `stream-flush`), and lays out the pieces. Stays thin.

### Theming
All colors/spacing/typography from `useTheme()`. Never set `lineHeight` on the `TextInput` (iOS bug). Modal header already themed in `_layout.tsx`.

### Streaming
Do **not** re-render on every token (react-native-marked re-parses on each render). The render hook accumulates `useChat` deltas and re-parses on the `stream-flush` cadence (~100 ms / block boundary / final). The in-progress trailing text can render as plain `Text` until its block closes, then re-parse — keeps perceived latency low without thrashing the parser. Tables fall back to a simple rendering; rare on native.

### States
Mirror web: empty (greeting + example chips), streaming (activity chips + indicator, composer Stop), error (message + Regenerate), copy on finished turns. Auto-scroll the `FlatList` to bottom on new content unless the user scrolled up.

## i18n additions

Reuse existing `qa.*` (web) / `assistant.*` (native) and add (English shown; German added alongside in implementation):

- `*.greetingTitle` — "Hi! 👋 Ask me about the club."
- `*.greetingSubtitle` — "Fixtures, standings, and recent results — straight from the federation sync."
- `*.examplesLabel` — "Try asking"
- `*.examples` — ["Who plays this weekend?", "What place is Herren 1 in?", "How did the last games go?"]
- `*.stop` — "Stop"
- `*.regenerate` — "Regenerate"
- `*.copy` / `*.copied` — "Copy" / "Copied"
- `*.activity.checking` — "Checking {what}…"  ·  `*.activity.checked` — "Checked {what}"
- `*.tools.get_standings` — "standings" · `*.tools.get_dashboard` — "the club overview" · `*.tools.list_matches` — "fixtures"

## Security & operational notes
- Keep the Gemini key server-side behind the gated Hono `/qa/chat` route (it already is). Never ship `GOOGLE_GENERATIVE_AI_API_KEY` to any client bundle.
- Respect `CHATBOT_ENABLED` (API) and `NEXT_PUBLIC_CHATBOT_ENABLED` / `EXPO_PUBLIC_CHATBOT_ENABLED` (build flags) and the members-only auth gate before mounting.
- Web markdown is sanitized by Streamdown (rehype-sanitize + rehype-harden); native renders to RN primitives (no HTML/WebView), so the web XSS surface largely does not apply.

## Testing strategy
- **Web** (Testing Library + happy-dom, mock `@ai-sdk/react`, `ai`, `@/lib/auth-client`): trigger renders for a member and nothing for anon; open/close; send clears input; empty-state example chip sends; assistant text renders as markdown (a heading/list/link asserts to structured DOM, not raw `#`); a tool part renders an activity chip with the right state; copy/regenerate/stop appear and call the right handlers; error state. Coverage ratchets — add tests for every new component.
- **Native** (node vitest, `src/lib/**` only): `messageSegments` ordering (text/tool interleave), `toolChip` mapping across all `part.state`s and both static/dynamic tool shapes, `stream-flush` cadence decisions (boundary cases), `marked-styles` maps theme tokens correctly. The `.tsx` screen/components stay thin and uncovered by design.
- Run `pnpm lint` (consistent-type-imports, no-floating-promises are errors), `pnpm typecheck`, `pnpm test`, and `pnpm coverage` before finishing. `pnpm check:ai-slop` scans docs.

## Future upgrade path (documented, not built)
Native premium streaming: swap `AssistantMarkdown` to `react-native-streamdown` + `react-native-enriched-markdown` once ≥1.0 with the incremental-parse API. Because the renderer is isolated behind one component and the theme mapping is one pure function, this is a localized change. Web fenced-code incremental streaming and an expandable tool-detail view are also later adds with no architectural change.

## Risk summary
1. Streamdown iOS<16.4 web crash (#519) — patch or UA fallback. *Decide in implementation.*
2. Monorepo Tailwind `@source` hoist path — verify in a production build.
3. AI Elements NOASSERTION license / vendored snapshot — read LICENSE; own re-pulls.
4. Native streaming cadence must be debounced — built in via `stream-flush`.
5. Native tables are best-effort — acceptable; revisit with the premium upgrade.
