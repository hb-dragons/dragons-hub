# Club Q&A Assistant — Design

- **Date:** 2026-06-15
- **Status:** Approved (pending implementation plan)
- **Scope:** A members-only chatbot that answers questions about the club, on both the web app and the native app, in one phase.

## Summary

Add a members-only Q&A assistant that answers questions about the club — fixtures, standings, results/form, teams, venues. It is a **separate slice** from the existing reschedule copilot: its own system prompt, tools, route, feature flag, and UI. It answers by calling the existing **public** read services as tools (no retrieval/embeddings). The tool whitelist is the data-exposure boundary — the assistant can only surface what the public site already shows.

It reuses the reschedule copilot's plumbing (Vercel AI SDK v6 streaming, the tool-registry pattern, env-flag gating, the web `useChat` component) and ships streaming on both web and native, sharing one backend endpoint and one client pattern.

## Context

The repository already has exactly one AI feature, the reschedule copilot, which exercises every layer this assistant needs:

- `apps/api/src/ai/chat.ts` — `streamText(...).toUIMessageStreamResponse()` with a zod-validated, read-only tool registry, capped at `stepCountIs(8)`.
- `apps/api/src/config/ai.ts` — Gemini provider via `@ai-sdk/google`, model from `env.ASSISTANT_MODEL`.
- `apps/web/src/components/admin/matches/reschedule-chat-sheet.tsx` — `@ai-sdk/react` `useChat` + `DefaultChatTransport` in a `Sheet`.
- Env gating via `ASSISTANT_ENABLED` with a `superRefine` that requires the API key when enabled.

The club data is fully structured and already exposed through unauthenticated `/public/*` endpoints (matches, standings, teams, head-to-head/form, dashboard, venues). There is no free-text corpus (no FAQ/handbook/news/player tables, no pgvector). So grounding is tool-calling over existing services, not RAG.

The native app is on Expo ~55 / RN 0.83, which makes streaming on device cheap: SDK 54+ ships native `TextEncoderStream`/`TextDecoderStream` and a streaming `response.body`, so the historical polyfill burden is gone.

## Decisions

| Question | Decision |
|---|---|
| Audience | Members-only (any authenticated user; not admin-gated) |
| Grounding | Tool-calling over existing public services; no RAG |
| Question scope (v1) | Fixtures, standings, results/form, teams, venues — via an extensible tool registry |
| Platforms | Web and native, both streaming, one phase |
| Model | Configurable via `CHATBOT_MODEL`, default `gemini-2.5-flash` |
| Conversation history | Stateless / client-held (no persistence) |
| Native entry point | Modal/stack screen reached from a header button |

Deferred (later additions, not v1): referee-assignment tools, FAQ/rules/history content (needs authoring + a new table), per-player questions (no `players` table exists), MCP exposure of the Q&A tools, a non-streaming `/ask` endpoint (kept only as a documented fallback), and conversation analytics.

## Architecture

### Backend (`apps/api`)

New files, kept separate from the reschedule feature:

- `ai/qa/qa-system-prompt.ts` — `buildClubQaSystemPrompt({ locale, user })`. Generic role, hard club-only scope, explicit refusal of off-topic questions, "use the tools, never invent, say you don't have the information on an empty result", answer in the user's language (German default). Written generically so adding a tool never requires editing the prompt — each tool description states when to call it.
- `ai/qa/qa-tools.ts` — `qaTools`, its own array (not appended to `reschedTools`, so the admin MCP surface is unaffected). Starter set wraps the services behind `/public/home/dashboard`, `/public/standings`, `/public/teams/:id/stats`, and `/public/matches(/:id/context)`: `get_dashboard`, `list_matches`, `get_standings`, `get_team_form`. Adding a question type later is a one-entry change.
- `ai/qa/qa-chat.ts` — `streamClubQaChat({ messages, locale, user })` → `streamText({ model: chatbotModel(), system, messages: convertToModelMessages(messages), tools, stopWhen: stepCountIs(5) }).toUIMessageStreamResponse()`.
- `ai/tool-kit.ts` — targeted refactor: extract the generic `tool()` helper (zod-parse at the boundary) and the `toAiSdkTools()` adapter out of the reschedule code into a shared module used by both registries. The two tool arrays stay separate.

Route and contract (this also corrects the inline-schema smell the reschedule route carries):

- `packages/contracts/src/qa.ts` — `qaChatBodySchema` = `{ messages: z.array(z.unknown()).min(1), locale: z.string().optional() }`, plus its inferred type, re-exported from `index.ts`.
- `routes/qa.routes.ts` — `POST /qa/chat`, middleware chain: `requireAuth` (any authenticated member, not admin) → `CHATBOT_ENABLED` 503 gate → `validator("json", qaChatBodySchema, validationHook)` → per-user rate-limit middleware → handler delegating to `streamClubQaChat`. Mounted in `routes/index.ts`.

The streaming endpoint is consumed by `DefaultChatTransport` on both web and native; that transport owns its own fetch and bypasses `@dragons/api-client`, so there is no api-client method or drift test for `/qa/chat`. The contract is centralized purely for the route validator.

#### Rate limiting

There is no rate limiter on chat today (better-auth's limiter only covers `/api/auth/*`). Add a light per-user limiter keyed by user id, backed by Redis (already present for BullMQ), at roughly 20 messages/minute. Members are authenticated, so the abuse surface is small; this is a cost-control safeguard, kept deliberately light.

### Web (`apps/web`)

- `components/public/club-assistant-sheet.tsx` (`"use client"`) — cloned from `reschedule-chat-sheet.tsx`: `useChat` + `DefaultChatTransport` pointing at `${NEXT_PUBLIC_API_URL}/qa/chat`, `credentials: "include"`, `body: { locale }`. Streams natively.
- Mount: a floating trigger in the public layout, rendered only when `authClient.useSession()` reports a logged-in user, so anonymous visitors never see a trigger that would 401. This is the members' web surface — logged-in users get the assistant while browsing public pages.
- i18n `qa.*` keys in `messages/de.json` and `messages/en.json`; the active locale is passed in the request body. The mount is gated on `NEXT_PUBLIC_CHATBOT_ENABLED`.
- Design system: `bg-popover shadow-lg ring-1 ring-foreground/10` for the surface, bubbles `bg-surface-low rounded-md text-sm`. Add loading, empty, and error states (the reschedule sheet renders only text parts and lacks these).

### Native (`apps/native`)

- Dependencies: `ai` and `@ai-sdk/react` (matching the API's `ai ^6`), plus `@ungap/structured-clone`. `expo/fetch` is already bundled in the `expo` package.
- `metro.config.js`: set `config.resolver.unstable_enablePackageExports = true`. De-risk this first with a throwaway `DefaultChatTransport` import — without it the `ai` import fails to resolve (`@vercel/oidc` / `@ai-sdk/gateway`).
- `app/_layout.tsx`: register the `structuredClone` polyfill as the first import, guarded by `Platform.OS !== "web"` (Hermes lacks `structuredClone`; the AI SDK calls it).
- `src/features/assistant/useClubAssistantChat.ts` — wraps `useChat` + `DefaultChatTransport` with `fetch: expoFetch`, `resolveApiUrl()` for the absolute base URL, replicates the `Cookie` header from `authClient.getCookie()` (native auth is cookie-based), and handles 401 itself, since the transport bypasses the `ApiClient` auth and 401 sign-out guard in `src/lib/api.ts`.
- Screen: an expo-router modal/stack screen reached from a header button (avoids the role-gated `selectTabs` logic). Built from existing primitives — an inverted `FlatList` of bubble components plus an `inputStyles` composer, inside the `Screen` wrapper and the existing `KeyboardProvider`, driven by `useChat` (partial/streaming updates are owned by the hook). No chat-UI library. The entry point is gated on `EXPO_PUBLIC_CHATBOT_ENABLED`.

No chat-UI library is adopted: `react-native-gifted-chat` has no notion of token-by-token assistant updates and its theming fights the design tokens; Flyer Chat is abandoned; `stream-chat-expo` is hosted-SaaS lock-in; `@assistant-ui/react-native` is very new and uses a runtime that diverges from the web pattern.

## Keeping it club-only

Defense in depth:

1. System prompt hard-scopes the assistant and refuses off-topic questions.
2. Tool whitelist exposes only read-only public services — the assistant physically cannot reach internal fields. Wrap the public services, never the admin query services.
3. Low `stepCountIs(5)` cap so the agent loop cannot run away.
4. Per-user rate limit.
5. Answers carry an "as of last sync" caveat for time-sensitive facts, since synced federation data can lag.

## Configurable model

`CHATBOT_MODEL` env var, default `gemini-2.5-flash`. `config/ai.ts` gains `chatbotModel()`, which selects the provider by model-id prefix: Gemini is implemented now via the existing `@ai-sdk/google` provider; a `claude-*` branch via `@ai-sdk/anthropic` is a small later addition. `CHATBOT_ENABLED` defaults to false, with a `superRefine` requiring `GOOGLE_GENERATIVE_AI_API_KEY` when enabled, mirroring `ASSISTANT_ENABLED`.

## Testing

To the `apps/api` bar (90% branches, 95% functions/lines/statements), following the existing `vi.hoisted` + `vi.mock` pattern so no real LLM or DB call happens:

- API: route tests (503 when disabled, 401 when unauthenticated, 400 on invalid body, 429 when rate-limited, delegation when enabled and authenticated); `qa-tools` (each tool parses its input and calls the right service); system prompt; `qa-chat` (streamText wired with the tools, system, and step cap); contract test for `qaChatBodySchema`.
- Web: Testing Library with a mocked transport — open/close, send, empty and error states.
- Native: node-environment vitest with `expo/fetch` and `@ai-sdk/react` mocked — assert the API-URL construction, the `Cookie`-header mapping, and the message-to-bubble mapping. Real streaming is a device/E2E concern, not a unit test.

## Environment and deployment

- Add `CHATBOT_ENABLED`, `CHATBOT_MODEL`, `NEXT_PUBLIC_CHATBOT_ENABLED`, and `EXPO_PUBLIC_CHATBOT_ENABLED` to `.env.example` and document them in `CLAUDE.md`.
- Thread the runtime flags into the API/worker env and the build-arg flags into the web build, following the existing `SCOREBOARD_*` pattern in `infra/` and `.github/workflows/deploy.yml`.
- Update the endpoint list in `AGENTS.md`.

## Risks

- **Metro package-exports resolution** is the single most likely build blocker on native; set `unstable_enablePackageExports` and verify the `DefaultChatTransport` import before anything else.
- **Auth divergence on native:** the transport bypasses `ApiClient` auth and its 401 sign-out guard; the `Cookie` header and 401 handling must be replicated, or authed chat fails silently.
- **Polyfill load order on native:** the `structuredClone` polyfill must load before any AI SDK code, or it can work in dev and throw in a release build.
- **Sync lag:** tools reflect synced federation data; surface the "as of last sync" caveat for time-sensitive answers.
- **Cost on a chat surface:** the per-user rate limit and the `stepCountIs(5)` cap bound spend.

## File inventory

New:

- `apps/api/src/ai/tool-kit.ts` (extracted shared helper)
- `apps/api/src/ai/qa/qa-system-prompt.ts`
- `apps/api/src/ai/qa/qa-tools.ts`
- `apps/api/src/ai/qa/qa-chat.ts`
- `apps/api/src/routes/qa.routes.ts`
- `apps/api/src/middleware/rate-limit.ts` (per-user limiter)
- `packages/contracts/src/qa.ts`
- `apps/web/src/components/public/club-assistant-sheet.tsx`
- `apps/native/src/features/assistant/useClubAssistantChat.ts`
- `apps/native/src/app/assistant.tsx` (modal screen) and its bubble/composer components under `apps/native/src/features/assistant/`
- Co-located `*.test.*` files for each of the above.

Changed:

- `apps/api/src/config/env.ts` (`CHATBOT_ENABLED`, `CHATBOT_MODEL`, superRefine)
- `apps/api/src/config/ai.ts` (`chatbotModel()`)
- `apps/api/src/ai/chat.ts` and `ai/tool-registry.ts` (use the extracted `tool-kit.ts`)
- `apps/api/src/routes/index.ts` (mount `qa.routes.ts`)
- `packages/contracts/src/index.ts` (re-export)
- `apps/web/src/app/[locale]/(public)/layout.tsx` (mount the trigger) and `messages/{de,en}.json`
- `apps/native/metro.config.js`, `apps/native/src/app/_layout.tsx`, a header entry-point button (e.g. on the home screen), and `apps/native/package.json`
- `.env.example`, `CLAUDE.md`, `AGENTS.md`, and the infra/deploy plumbing
