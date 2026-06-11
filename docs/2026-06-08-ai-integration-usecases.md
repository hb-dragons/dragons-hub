# AI / KI integration — use-case research for the club platform

Date: 2026-06-08. Produced by a multi-agent pass over the real codebase (7 domain
recon agents → use-case generation → adversarial feasibility verification of the
top candidates → two flagship deep-designs → synthesis). 60 use cases generated,
top 16 adversarially verified.

Audience: platform owner deciding what to build. Every recommendation is tied to
code that exists today (`apps/api`, `packages/db`, `packages/sdk`).

---

## The one fact that shapes everything: the federation is read-only, except referee assignment

The Basketball-Bund SDK (`packages/sdk/src/index.ts`, `apps/api/src/services/sync/sdk-client.ts`)
exposes **read-only** endpoints for matches, standings, venues and game detail.
The **only** writes back to the federation that exist are
`submitRefereeAssignment()` / `submitRefereeUnassignment()`
(`POST /rest/assignschiri/submit/{spielplanId}`). There is no match-reschedule,
no venue write, no score write. Grep for `verlegen|spielplan/edit|setSpiel`
returns nothing.

What this means for every AI feature:

| Capability | Can the platform *act*? | Realistic ceiling |
|---|---|---|
| Referee SR1/SR2 assignment | **Yes** — real federation write | **copilot** (human confirms each submit; never fully autonomous) |
| Match reschedule (date/time/venue) | **No** — portal-only, out-of-band | copilot that *proposes*; human enters on basketball-bund.net; local override only bridges until sync converges |
| Venue / hall booking | **No** — booked by emailing the city | copilot *drafts*; human sends (no SMTP sender exists — channels are in-app/push/whatsapp only) |
| Member notifications | **Yes** — internal write | assist/copilot; outbound posts stay human-confirmed |
| Local overrides, tasks, preferences | **Yes** — internal writes, all audited | varies |

The discipline this forces: **any "reschedule" or "book the hall" feature that
writes locally without the federation/city having accepted it is actively
harmful** — it makes the public ICS feed and push notifications announce a
date/venue that isn't real. Correct shape everywhere: AI proposes → human commits
out-of-band → optional provisional local override clearly marked "pending
federation sync" → next sync converges.

Of the 60 use cases generated, **0** can be fully autonomous, 36 are copilot
(draft-an-action), 24 are assist (surface-info). That distribution is the
federation constraint showing through, and it is correct.

Net-new fact confirmed at research time: there is **zero** LLM dependency in the
repo today (no `@anthropic-ai/sdk`, no `ANTHROPIC_*` in `config/env.ts`), and
`venues.latitude/longitude` are never populated by sync (any travel-distance
feature is dead until a geocoder is added — use referee `entfernung` from the
federation instead).

---

## Five themes — where AI actually moves the needle here

- **A. The data is structured, relational and live; the work is filtering/joining,
  not document search.** Most high-value questions resolve to one or two existing
  routes plus a join. So **deterministic solvers/scorers are the workhorse** and
  the LLM is confined to the seams it's good at: language in, language out. The
  strongest-verified items are the non-LLM ones (referee assigner, candidate
  ranker, eligibility engine, conflict detector).
- **B. Referee assignment is the crown jewel, because it is the one place the
  platform can act.** Rich, live candidate metadata (distance, workload,
  eligibility) already feeds the picker UI; `assignReferee()` genuinely writes to
  the federation. This is the rare domain where a copilot closes the loop.
- **C. Scheduling/booking consequence-management is high value but advise-only,
  and partly already automated.** `reconcileAfterSync` already re-tunes booking
  windows and flips status to `needsReconfirmation`. The real gaps are *surfacing*
  (same-day venue overlap, deadline urgency) and *drafting* German correspondence.
- **D. Content generation (previews/recaps/captions) is low-risk, modest-value,
  and the clean first LLM use case** — read-only, human-reviewed prose over
  already-computed numbers. Good for de-risking the AI infra before betting it on
  operations.
- **E. "Turn events into tasks" is wanted everywhere but rarely needs an LLM.**
  The domain-event payloads are structured and low-variance — title/priority/due
  are rule-derivable. Ship deterministic templating, not a model.

---

## Prioritized roadmap

### Wave 1 — Quick wins (high value, high feasibility, low risk, NO LLM)

These need no Anthropic dependency, no API key, no cost posture — and they harden
the substrate the bigger bets depend on. Build these first.

1. **One-click best-candidate ranking in the referee candidate picker**
   *(verified: solid, 4v/5f, M)*. Pure deterministic scorer over the already-fetched
   `getRefs` candidate data + the leaderboard merge. Highest value-per-effort in the
   catalog. Seam: post-process `searchCandidates()` in `referee-assignment.service.ts`.
   Keep the "why" line templated, not LLM-generated.
2. **Unified referee-eligibility engine** *(verified: solid, 4v/5f, M)*. Foundational —
   collapse the SQL visibility builders and the TS `resolveClaimableSlots` into one
   predicate with a property-based equivalence test. De-risks every referee AI feature.
3. **Same-day venue time-conflict & changeover-gap detector**
   *(verified: solid, fixed 4f, S–M)*. Deterministic interval-overlap over the existing
   `(venueId, date)` booking groups. Caveat: `teams.estimatedGameDuration` is null for
   most teams — make kickoff-overlap a hard flag, changeover-gap advisory. Add a new
   `booking.time_conflict` event type (don't reuse `OVERRIDE_CONFLICT`).
4. **Override-time validation guard** *(3v/5f, S)*. Deterministic `end>start` /
   window-encloses-kickoffs assertion in create/update booking. Warn, don't hard-block.
5. **Booking deadline / urgency ranking** *(fixed 4f, S)*. Wire up the currently-dead
   `venue_booking_due_days_before` config key; bucket pending bookings overdue/soon/ok.
   Needs a reminder-dedup column + a real `booking.due` event.
6. **Deterministic event-to-task templating** for the four actionable events
   (`MATCH_SCHEDULE_CHANGED`, `MATCH_VENUE_CHANGED`, `BOOKING_NEEDS_RECONFIRMATION`,
   `REFEREE_SLOTS_NEEDED`). A switch statement beats an LLM on cost/latency/testability.
   Prerequisite fix: `matches.sync.ts` hardcodes `oldVenueName/newVenueName = null` —
   join venues at emit time. Add a `sourceEventId` idempotency key on tasks.

### Wave 2 — Flagship bets (need the LLM/solver infrastructure)

7. **Fair-and-near referee auto-assigner for open our-club SR slots**
   *(verified: solid, 4v/4f, L)*. The marquee operational feature, and the only one
   that truly *acts*. Min-cost assignment over live candidates: minimize travel +
   workload-balance penalty, subject to hard eligibility (federation pre-filters
   `EINSETZBAR`). Solver core, no LLM. Submit via existing `assignReferee`. Stay
   **copilot per line** — stale candidate pool + shared rate limiter make batch
   auto-submit unsafe. Pair with "cache the candidate pool" *(solid, S)* to stop the
   redundant per-assign `getRefs` call.
8. **Game Rescheduling Assistant** — see flagship design below. Solver-core hybrid;
   MVP is solver-only with templated rationale. Honors the read-only constraint:
   proposes, human enters on portal, provisional override marked "pending sync".
9. **Auto-drafted opponent scouting preview** *(verified: solid, fixed 4f, M)* +
   **quarter-by-quarter recap** *(needs-scoping, 3f)*. First LLM *generation* features,
   lowest-risk way to validate the AI infra. Read-only over `getMatchContext` /
   `getTeamStats`. Pass only computed numbers; the model will otherwise invent
   momentum narratives, player names and margins not in the data.

### Wave 3 — Later / research

10. **Club Assistant — conversational agentic layer** — see flagship design below.
    The read-only Q&A subset ("weekend readiness") is verified solid (5/5) and could
    ship as a contained slice earlier.
11. **Coverage-risk forecast / personalized smart reminders / season fairness
    rebalancing.** Forecasting needs a season of `refereeAssignmentIntents` history
    (cold-start weak). Ship a lead-time + pool-size heuristic baseline first.
12. **Federation boxscore/play-by-play ingestion → player-of-the-game** *(5v/3f, XL)*.
    Unlocks the only genuinely missing data dimension (zero player-level data exists
    today), but is the heaviest item: unknown payload shape, new schema + migrations +
    sync reconciliation. Research-gate it.
13. **NL board command bar / NL notification-preferences / comment summarization**
    *(low value)*. Cheap additions once the assistant infra exists; defer.

---

## Flagship design 1 — Game Rescheduling Assistant

When a home game must move (hall double-books, team can't field players, federation
letter), the assistant proposes ranked alternative `(date, time, venue)` slots that
satisfy every hard constraint and optimize the soft ones, then drives the human
through the irreducibly manual steps (portal entry, referee re-assignment).

**Copilot, not autonomous — by necessity.** The reschedule on basketball-bund.net
is entered by a human; the next sync brings it back and converges with the local
override. The agent's value is the search and the constraint-checking, not the commit.

**Constraint set (grounded in schema):**

- *Hard:* venue free (`venue_bookings` unique `(venueId,date)` + window overlap via
  `calculateTimeWindow`); no own-team double-book that day; no clash with other club
  games at the same venue; inside the league round/matchday window (`getSpielplan`
  spieltage); current referees still holdable.
- *Soft (ranking):* minimal disruption (closest to original); travel/min-rest; keeps
  current referees; hall utilization (piggyback an existing booking); avoid
  re-confirming an already-confirmed hall.

**Architecture: hybrid, solver-core + thin LLM shell. MVP is solver-only.** Constraint
satisfaction is not an LLM job — it's exact, cheap, deterministic predicates over
indexed Postgres columns, and the candidate space is tiny (a few weekends × a few halls
× a few kickoff times), so hand-written generate-and-filter beats OR-Tools and is fully
unit-testable to the repo's 90/95 bar. Claude earns its place at three seams only:
(1) **German free-text/letter intake → structured constraints** (Haiku, strict
structured-output); (2) **bilingual rationale + portal-entry plan** grounded in solver
facts (Opus); (3) **trade-off explanation** when top proposals are close.

**Where it plugs in:** new `apps/api/src/services/reschedule/` (`reschedule.service.ts`
+ `reschedule.solver.ts`), route `POST /admin/matches/:id/reschedule/suggest` gated
`requirePermission("match","update")`. Reuse `calculateTimeWindow` / `groupByVenueDate`
/ `getBookingConfig` verbatim. No new table for MVP (proposals are ephemeral); full
version adds a `reschedule_proposals` status table for convergence tracking.

**Guardrails:** no silent writes (manual tool-use loop, write tools confirm-gated);
local override marked `reason="reschedule pending federation sync"`; referee
availability is heuristic pre-move, truth only after portal entry (`assignReferee`
re-validates and fails `NOT_QUALIFIED`); notification blast fires only after the
override is applied, never on a proposal.

---

## Flagship design 2 — Club Assistant (conversational + agentic)

A chat layer over the whole platform. The endpoint table in `AGENTS.md` is already a
typed, RBAC-gated **tool surface** — almost every query a referee coordinator / admin /
coach asks resolves to one or two existing routes.

Example queries: *"Which home games next month still have an open SR slot AND no
confirmed booking?"*, *"Who hasn't reffed in 6 weeks?"*, *"Draft the weekend preview
post"*, *"Where's my team's next away game and what's the opponent's form?"*

**Architecture: Claude agent with tool use, each tool a thin proxy to an existing Hono
route, dispatched in-process as the calling user** (`app.request(path, {headers})`).

- *Reject MCP-over-DB* — bypasses `rbac.ts` and the service invariants (versioning,
  override audit, outbox events). An LLM with raw SQL could read/write past the caller's
  permissions.
- *Reject RAG-as-primary* — the data is small, relational and live; "which rows match
  these predicates right now" is filter/aggregate, not semantic search. (A few short
  "how the club operates" docs as Claude Skills is the only retrieval that helps.)

**The load-bearing safety property: the assistant never holds its own authority.** Every
tool call re-runs `requirePermission` / `requireRefereeSelf` downstream — a `teamManager`
asking a referee-history question gets a real 403, returned to Claude as an error
`tool_result`. The tool catalog is also pre-filtered per caller via `can()`/`parseRoles`,
but the route's middleware is the actual gate; the LLM's self-restraint is never the
security control. Write tools (`create/update/delete/claim/release/trigger`) are
human-confirm-gated; outbound posts are never a silent tool effect.

**Where it runs:** new route group `apps/api/src/routes/admin/assistant.routes.ts` under
the already-authed `/admin/*` prefix; services in `apps/api/src/services/assistant/`;
`config/anthropic.ts` singleton. The proactive "Thursday weekend digest" is a BullMQ
worker running as a dedicated non-admin service-principal user (so its authority is still
bounded by `rbac.ts`), output to a draft, never auto-sent.

---

## Shared AI infrastructure to build once

Follows the repo conventions (Zod env, `config/` singletons, co-located tests, 90/95).

- **Dependency & config:** add `@anthropic-ai/sdk` to `apps/api`; `config/anthropic.ts`
  singleton; Zod-validated `ANTHROPIC_API_KEY` (required), `ASSISTANT_MODEL`,
  `ASSISTANT_ENABLED` (kill switch), `ASSISTANT_DAILY_TOKEN_BUDGET` in `config/env.ts` +
  `.env.example` + the CLAUDE.md env section. Mirror the Secret Manager / Terraform
  plumbing already used for `SCOREBOARD_INGEST_KEY`.
- **Model choice (ids):** orchestrating agent loop → **`claude-opus-4-8`** (1M context,
  $5/$25 per 1M; adaptive thinking, effort `high`; put explicit "call this when…"
  triggers in tool descriptions — 4.8 under-reaches on tools by default). Budget tier for
  the whole loop → **`claude-sonnet-4-6`** ($3/$15). Bounded sub-tasks (German→JSON
  intake, templated formatting, intent classification) → **`claude-haiku-4-5`** ($1/$5)
  as an isolated subagent call (keep the main loop on one model so the prompt cache
  survives).
- **Agent/tool-use loop reusing Hono + RBAC:** manual tool-use loop (not the auto-runner)
  so write tools pause for human confirmation; each tool a thin proxy to an existing route
  dispatched as the calling user (RBAC, validation, audit, events inherited for free); use
  tool-search for the ~70-endpoint surface rather than loading every schema each turn.
- **Prompt caching & cost:** freeze system prompt + tool catalog as a byte-stable
  cacheable prefix (Opus 4.8 needs a ≥4096-token prefix — easily cleared); volatile user
  turn last; verify via `usage.cache_read_input_tokens`. Route the latency-insensitive
  proactive digest through the Message Batches API (50% off). Per-user/day token budget +
  kill switch. Pre-estimate with `messages.count_tokens` (never tiktoken).
- **Eval & guardrails:** mock the LLM call to hit coverage; keep a deterministic fallback
  for every generation feature so an LLM outage degrades to templated output; treat all
  tool output (federation-sourced names/strings) as untrusted data via the
  mid-conversation system channel, never interpolated as instructions; log every tool
  call reusing the `syncRunEntries` / `matchChanges` audit pattern.

---

## Risks & anti-patterns

- **Hallucination on public-facing prose (scouting/recaps/captions).** With only W/L
  flags and aggregate totals, the model invents momentum, player names and margins — and
  this is *public text about real opponents*. Pass only computed numbers, instruct
  hedging, mandate human review, deterministic fallback for null-data rows. Do not rely on
  `check:ai-slop` to catch it — that scanner only walks `.md/.mdx/.txt`, never API JSON.
- **Autonomy where the federation is read-only (the cardinal sin).** Auto-applying a local
  date/venue override the portal hasn't accepted makes the ICS feed and push announce a
  fake date. Every reschedule/booking feature stays copilot, marks provisional state, and
  notifies members only after human confirmation.
- **Auto-submitting referee assignments.** The one real write must never auto-fire: stale
  candidate pool between solve and submit, a shared rate limiter contending with sync, no
  batch-atomic API, brittle German success-string gate. Confirm per line.
- **LLM where a switch statement wins.** The event-to-task proposals are the trap:
  structured, low-variance payloads, every output field rule-derivable. Use templating.
- **Data gaps masquerading as features.** `venues.lat/long` null for 100% of rows (no
  geocoder) — travel-distance dead on arrival; read referee `entfernung` instead.
  `teams.estimatedGameDuration` null for most — changeover-gap must be advisory. No
  recipient contact data anywhere (`auth.users.email` is the only email column) — outbound
  correspondence is always copy-paste, never send.
- **PII / secrets in prompts.** Referee/member data flows through tool results — never put
  `SDK_PASSWORD` / session tokens / API keys in prompt content.
- **Cost creep.** Cap iterations, default effort `high`/`medium`, batch the proactive path,
  enforce a daily budget, preserve the prompt cache (don't switch models mid-session).

**Bottom line:** lead with Wave 1's deterministic referee/booking wins (no LLM, immediate
value, hardens the substrate), prove the LLM infra on low-risk scouting prose, then invest
in the two flagship copilots — the fair referee auto-assigner (the only feature that truly
acts) and the rescheduling assistant (which respects that it can only advise).

---

## Appendix — full 60-use-case catalog

Format: `[value/feasibility effort autonomy · pattern]`. Verified items carry the
adversarial verdict.

(See the workflow result for the full per-use-case detail; the consolidated, deduplicated
recommendations are the roadmap above. The same two ideas — fair referee assignment and a
venue conflict detector — surfaced independently in 4–5 separate domain agents, which is a
strong signal they are the real priorities.)
