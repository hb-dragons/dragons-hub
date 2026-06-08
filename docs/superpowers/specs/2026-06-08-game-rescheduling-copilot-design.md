# Game Rescheduling Copilot — design spec

- Date: 2026-06-08
- Status: approved (brainstorming), pending implementation plan
- Scope: v1 of an AI copilot for game management, focused on the rescheduling vertical

## Goal

Let a club admin chat — in natural language — to get ranked alternative dates,
times, and venues for a game that has to move. The admin states rules and
preferences in plain language ("next 3 weeks, prefer Saturday evenings, avoid
Feb 14, keep our home gym"); the AI reads the relevant games/teams/venues/bookings
and proposes valid slots, each checked against the physical hard constraints before
it is shown.

The same tool layer is exposed as an MCP server, so it can be attached to Claude
Desktop / Cursor for personal power use, not only the in-app chat.

## Decisions (from brainstorming)

1. **Model strategy:** Google/Gemini is the default, wired through the Vercel AI SDK so
   the provider stays swappable. Install `@ai-sdk/google` now (default model
   `gemini-2.5-flash`); the provider is a one-line change later. We do **not** call the
   Anthropic SDK directly — the AI SDK is the provider abstraction.
2. **Surface:** both an in-app chat panel (web admin) and an external MCP server. The
   MCP server is the canonical tool surface; the in-app chat shares the same tool
   implementations in-process.
3. **v1 scope:** the rescheduling vertical only, done well. Other game-management
   capabilities are later increments.
4. **Rules model:** natural language typed per conversation. Hard rules are enforced
   from the data; no saved/standing rules in v1.
5. **Reasoning split:** AI-driven. The AI reads the data and proposes slots from the
   NL rules — no backend solver. One thin deterministic `verify_slot` tool floors
   correctness on the physical hard rules; the AI surfaces only slots that pass.

## Context and hard constraints (from the codebase)

- **The federation is read-only except referee assignment.** The Basketball-Bund SDK
  (`packages/sdk`, `apps/api/src/services/sync/sdk-client.ts`) exposes read-only
  endpoints for matches, standings, venues, and game detail. The only federation
  writes that exist are `submitRefereeAssignment` / `submitRefereeUnassignment`.
  There is no match-reschedule endpoint. **Consequence:** the copilot can only
  *suggest* a new date; a human enters it on basketball-bund.net, and the next sync
  converges. v1 is suggest-only — no local override write-back.
- **No LLM dependency exists yet.** No AI SDK packages (`ai`, `@ai-sdk/*`), no MCP SDK,
  no model API key in `apps/api/src/config/env.ts`. This work introduces them. The web
  app has neither `ai` nor `@ai-sdk/react` (verified) — they must be added at AI SDK v5 /
  `@ai-sdk/react` v2 to peer-match React 19.2.6 / Next 16.2.6.
- **Data gaps to respect:** `venues.latitude/longitude` is null for all rows (no
  geocoder) → no travel/distance scoring in v1. `teams.estimatedGameDuration` is null
  for most teams → window sizing falls back to the `app_settings` default duration.

## Architecture

A **shared read-only tool registry** is the base. Each tool is a plain TypeScript
function wrapping an existing service. Two thin adapters sit on top:

- **MCP adapter** — exposes the registry over Streamable-HTTP at `POST /mcp` for
  external MCP clients (Claude Desktop / Cursor).
- **AI SDK adapter** — binds the same functions as `tools` for the in-app chat,
  in-process (no HTTP round-trip back to `/mcp`).

The AI does the reasoning (interpreting NL rules, reading data, forming and ranking
candidate slots). A single deterministic tool, `verify_slot`, checks the physical
hard rules; the system prompt forbids surfacing a slot that fails it.

All of this lives in the existing Hono API (`apps/api`), so tools call services
in-process and inherit RBAC, match versioning, and audit.

### Component map

```
apps/api/src/
  services/reschedule/
    reschedule-context.service.ts   loads match + window + occupancy via existing services
    verify-slot.service.ts          deterministic hard-rule check (reuses booking-calculator)
    reschedule.types.ts             zod: VerifySlotInput, VerifySlotResult, SlotConflict
    *.test.ts
  ai/
    tool-registry.ts                the shared tools (read tools + verify_slot)
    mcp-server.ts                   MCP adapter over the registry
    chat.ts                         AI SDK loop: streamText + provider, registry-as-tools
    system-prompt.ts                the three disciplines (verify, read-only, referee heuristic)
    *.test.ts
  routes/
    mcp.routes.ts                   POST /mcp (Streamable-HTTP, bearer-token auth)
    admin/assistant.routes.ts       POST /admin/assistant/reschedule/chat (SSE)
  config/
    env.ts                          + GOOGLE_GENERATIVE_AI_API_KEY, ASSISTANT_MODEL, ASSISTANT_ENABLED,
                                      MCP_TOKEN
    ai.ts                           provider singleton (@ai-sdk/google), model from env

apps/web/src/
  components/admin/assistant/       chat panel (AI SDK useChat) + reschedule entry point
  (entry point seeded from the match detail page)
```

## Tool registry

All tools are read-only in v1. Each wraps an existing service/query.

| Tool | Input | Returns | Wraps |
|---|---|---|---|
| `get_match` | `matchId` | match + league, round/matchDay, teams, current kickoff/venue | `match-query.service` |
| `list_club_matches` | `{ from, to }` | own-club active games in the window | `match-query.service` / matches query |
| `list_venue_bookings` | `{ from, to, venueId? }` | bookings with calculated windows + status | `venue-booking.service` |
| `list_club_venues` | — | candidate halls | venues query |
| `get_round_window` | `leagueId, matchDay` | allowed date range for the matchday | local `matches` query (min/max kickoffDate for leagueId+matchDay) |
| `get_referee_eligibility` | `matchId` | current SRs + local-rule eligibility (heuristic) | `referee` services + `referee_assignment_rules` |
| `verify_slot` | `matchId, date, time, venueId` | `{ ok, conflicts[] }` | `booking-calculator.calculateTimeWindow`, matches/bookings queries |

`verify_slot` checks exactly three physical hard rules:
1. **Venue free** — proposed window (via `calculateTimeWindow` + `app_settings` buffers)
   does not overlap any existing booking for that `(venueId, date)`.
2. **No own-team double-book** — neither team has another active match that day.
3. **Inside the round/matchday window** — date falls within the min/max kickoffDate of
   the same league + matchDay in the locally-synced `matches` table (so the federation
   will accept it; reflects the last sync).

Conflicts are returned typed (`{ type, detail, severity }`); `ok = no blocking conflict`.
Venue/double-book are blocking; an indeterminate round window (no other matches synced
for that league+matchDay) is a non-blocking warning, not a hard fail.

## Reasoning loop

- Vercel AI SDK (v5): `streamText` with the provider from `config/ai.ts`, model from
  `ASSISTANT_MODEL` (default `gemini-2.5-flash`; Gemini Pro or another provider is a
  config/one-line change).
- Multi-step tool loop with a step cap (the AI reads → reasons → verifies → answers
  over several tool turns).
- System prompt (`system-prompt.ts`) encodes three disciplines:
  1. **Verify before surfacing** — a slot may be presented only after `verify_slot`
     returns `ok:true`.
  2. **Suggest-only** — the federation is read-only; instruct the user to enter the
     chosen slot on basketball-bund.net; the next sync converges.
  3. **Referee caveat** — pre-move referee availability is a heuristic from local
     rules; flag it ("confirm after portal entry").
- Output per turn: ranked proposals, each with the `verify_slot` result and a
  next-step line.

## Rules model (v1)

- The user types rules/preferences in natural language each conversation. The AI maps
  them onto its reasoning and onto read-tool queries (date range, venue scope, blackout
  dates).
- Hard physical rules are always enforced via `verify_slot`, independent of what the
  user types.
- No persisted/standing rules in v1 (later increment).

## Auth

- **In-app chat:** `POST /admin/assistant/reschedule/chat` behind `requireAuth` +
  `requirePermission("match", "update")`. Tools run as the logged-in user; RBAC,
  versioning, and audit are inherited through the service calls.
- **MCP `/mcp`:** bearer-token auth (`MCP_TOKEN`). The MCP server is provider-neutral —
  it can be attached to any MCP host (Claude Desktop, Cursor, etc.) regardless of which
  model drives the in-app chat. For personal use, a token tied to the admin user.
  Read-only surface keeps the blast radius small.

## Data flow

1. Admin opens the match detail page → "Suggest reschedule" seeds a chat with that
   `matchId`, or opens the chat panel directly.
2. The chat route streams via the AI SDK; the model receives the seeded match + the
   user's NL rules.
3. The model calls read tools to pull the match, the club's games in the window, venue
   bookings, venues, the round window, and referee eligibility.
4. The model forms candidate slots from the rules and data, then calls `verify_slot`
   on its top picks.
5. The model presents only `ok:true` slots, ranked, with the verify result and the
   "enter on portal" next step. The user refines in NL; the loop repeats.

## Error handling

- Tool failures return error tool-results so the model explains rather than crashing
  the stream.
- `ASSISTANT_ENABLED=false` kill switch and a max-steps cap on the tool loop. No
  deterministic fallback needed — v1 is interactive chat only; nothing automated depends
  on it. (A per-user daily token budget is a later increment, not v1.)
- `verify_slot` is the correctness guard; the discipline that no `ok:false` slot is
  surfaced is tested directly.

## Testing (90/95 thresholds)

- **Read tools + `verify_slot`** — deterministic service wrappers; unit-tested
  including conflict cases (overlapping window, own-team double-book, outside round
  window).
- **Tool registry + MCP adapter** — registration and a round-trip over a mock
  transport.
- **Chat loop** — mock the AI SDK provider; assert tool wiring and that a mocked model
  proposing an `ok:false` slot is blocked by the verify discipline. Plumbing and guard
  are tested deterministically; model prose is not asserted.

## Out of scope (v1) — clean later increments

- Write-back: local kickoff/venue override, referee re-assignment, booking edits.
- Saved/standing rules (a configurable rule store + UI).
- Travel/distance scoring (blocked on venue geocoding).
- Native-app chat (web admin + external MCP hosts only).
- Proactive/scheduled digest worker.
- Per-user daily token budget.

## Dependencies to add

**`apps/api`:** `ai` (Vercel AI SDK v5), `@ai-sdk/google`, `@modelcontextprotocol/sdk`
(MCP server adapter).

**`apps/web`:** `ai` + `@ai-sdk/react` (v2, peer-matches React 19).

**New env** in `config/env.ts` (Zod) + root `.env.example` + CLAUDE.md env section:
`GOOGLE_GENERATIVE_AI_API_KEY` (required when `ASSISTANT_ENABLED=true`), `ASSISTANT_MODEL`
(default `gemini-2.5-flash`), `ASSISTANT_ENABLED` (default false), `MCP_TOKEN` (min 32
chars). Mirror the Secret Manager / Terraform plumbing used for `SCOREBOARD_INGEST_KEY`
for production. Add the same keys to `apps/api/vitest.setup.ts` if any are non-optional.

## Open questions for the plan

- Exact AI SDK v5 multi-step API (`stopWhen`/step count) and streaming wiring into the
  existing SSE pattern (mirror `/admin/sync/logs/:id/stream`).
- Whether the in-app chat persists conversation history in v1 or is stateless per
  session (lean stateless for v1).
- Token-to-user mapping for MCP auth: a dedicated table vs reusing an existing
  credential mechanism.
