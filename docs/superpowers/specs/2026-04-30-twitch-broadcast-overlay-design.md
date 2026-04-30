# Twitch Broadcast Overlay — Design

**Date:** 2026-04-30
**Author:** brainstorming session with James
**Status:** Draft, awaiting review before plan

## Goal

Add an admin-controlled live broadcast mode to the Dragons stack so a Twitch
operator can:

1. Pick the match that is being live-streamed (own-club only, today's matches by
   default with full search).
2. Configure broadcast-only display fields (3-letter team abbreviations, optional
   color overrides).
3. Hit one **Go Live** button to flip the system into broadcast mode.
4. Point OBS at a single public `/overlay` URL that renders the right thing for
   each phase (pre-game card → live score bug → blank when off air).

The Stramatel ingest pipeline (Pi → API → DB → SSE) keeps running unchanged; the
broadcast layer sits on top of it as a separate, gated channel.

## Non-Goals

- Halftime / quarter-break overlay variants (deferred).
- Final-score or box-score post-game card (deferred).
- Pushing scoreboard results back to the `matches` table (basketball-bund.net is
  the official source).
- Sponsor slots, stats panels, player photos.
- Replacing the existing `/[locale]/live` projector page or the
  `/[locale]/admin/scoreboard` debug page — both stay.

## Architecture

A `broadcastConfigs` table holds the per-device binding (which match is bound to
which Pi, plus broadcast-only display fields). A new `/admin/broadcast` page
gates the entire flow. A new `/overlay` page consumes a broadcast-aware SSE
channel that merges scoreboard frames with the bound match and phase. Soft
gating: ingest always writes to the DB; SSE/overlay only emit when `isLive=true`.

## Decisions Locked During Brainstorming

| # | Decision | Rationale |
|---|---|---|
| 1 | One `deviceId ↔ matchId` binding per row in a dedicated `broadcastConfigs` table | Single Pi today, but schema models the binding so a second Pi doesn't need a migration. |
| 2 | Logos served by existing `GET /assets/clubs/:id.webp` endpoint via `team.clubId` | No new logo storage. Misshappen logos: swap the `.webp` file. |
| 3 | Single **Go Live** toggle, soft-gated | DB always records (forensics). SSE/overlay silent unless live. |
| 4 | Match picker: today's matches default + search for any own-club match | Common case is fast; rare edge case is reachable. |
| 5 | Single public `/overlay` URL, no auth | Overlay is blank when off air. A leaked URL during a Twitch broadcast just shows the same data already on Twitch. |
| 6 | `broadcastAbbr` lives on `broadcastConfigs` (not `teams`) | Broadcast-scoped customisation; `teams` stays free of broadcast concerns. |
| 7 | Overlay phases: `idle` / `pregame` / `live`, computed server-side | Client renders whichever layout the server says — no client state machine. |

## Section 1 — Data Model

### New table: `broadcastConfigs`

```ts
deviceId           text PRIMARY KEY      // matches liveScoreboards.deviceId
matchId            integer NULL → matches.id
isLive             boolean NOT NULL DEFAULT false
homeAbbr           varchar(8) NULL       // e.g. "DRA"
guestAbbr          varchar(8) NULL
homeColorOverride  varchar(20) NULL      // override team.badgeColor for this broadcast
guestColorOverride varchar(20) NULL
startedAt          timestamptz NULL      // when isLive last flipped to true
endedAt            timestamptz NULL      // when last flipped to false
updatedAt          timestamptz NOT NULL DEFAULT now()
```

### Modified tables

`teams` — untouched. `liveScoreboards` — untouched.

### Abbreviation fallback

When `homeAbbr` / `guestAbbr` are null, derive at render time from the team:
`nameShort.slice(0, 3).toUpperCase()`, falling back to `name.slice(0, 3).toUpperCase()`.
Computed in the server-side merge, not stored.

### Why a table instead of `app_settings`

Per-device rows with structured fields require proper migrations, FKs, and
indexes. `app_settings` is single-key/value — JSON-in-text would be a regression.

## Section 2 — API Surface

All admin routes require admin role (same gate as existing `/admin/scoreboard/*`).

### Admin

```
GET  /admin/broadcast/config?deviceId=<id>
  → 200 { deviceId, matchId, isLive, homeAbbr, guestAbbr, homeColorOverride,
          guestColorOverride, match: <matches+teams+league joined>,
          startedAt, endedAt }

PUT  /admin/broadcast/config
  body: { deviceId, matchId?, homeAbbr?, guestAbbr?,
          homeColorOverride?, guestColorOverride? }
  → updates the binding without changing isLive.
  → upserts the row if no row exists for the deviceId.

POST /admin/broadcast/start
  body: { deviceId }
  → 400 if matchId is null on the row.
  → otherwise sets isLive=true, startedAt=now(). Triggers a publish so the
    overlay flips immediately even with no inbound frame.

POST /admin/broadcast/stop
  body: { deviceId }
  → sets isLive=false, endedAt=now(). Triggers a publish.

GET  /admin/broadcast/matches?q=<search>&scope=today|all
  → list of own-club matches (joined with both teams + league).
    scope=today: kickoffDate=today, sorted by kickoffTime.
    scope=all: searchable by opponent name / kickoff date.
    Filter: at least one of homeTeamApiId / guestTeamApiId belongs to a team
    with isOwnClub=true.
```

### Public

```
GET  /public/broadcast/state?deviceId=<id>
  → 200 {
      isLive: boolean,
      phase: "idle" | "pregame" | "live",
      match: { id, kickoffDate, kickoffTime, league: {id, name},
               home: {name, abbr, color, clubId},
               guest: {name, abbr, color, clubId} } | null,
      scoreboard: <PublicLiveSnapshot> | null,
      stale: boolean   // true if last frame > 30s ago while live
    }

GET  /public/broadcast/stream?deviceId=<id>
  → text/event-stream. event: "snapshot", data: same shape as /state.
    15s heartbeat, Last-Event-ID replay (LIMIT 100), retry: 2000.
    Reuses Redis pub/sub plumbing.
```

### Behaviour changes to existing ingest

`processIngest` (in `apps/api/src/services/scoreboard/ingest.ts`):

1. Always writes to `liveScoreboards` + `scoreboardSnapshots` (unchanged).
2. After DB write, **always** publishes the existing scoreboard event (so the
   admin debug page keeps working — it bypasses the broadcast gate).
3. If `broadcastConfigs.isLive=true` for the deviceId, **also** publishes a
   merged broadcast event on the broadcast channel. If false, no broadcast
   publish.

Two SSE channels:
- `scoreboard:<deviceId>` — admin debug. Always publishes.
- `broadcast:<deviceId>` — overlay. Publishes only when `isLive=true`.

This separation prevents pre-game testing scoreboard data from leaking onto the
public overlay.

## Section 3 — Web UI

### Admin: `/[locale]/admin/broadcast`

Single-page control panel. German + English (next-intl).

```
┌─ Broadcast Control ─────────────────────────────────────┐
│                                                          │
│ Device:  [dragons-1 ▾]              ● Live  /  ○ Idle    │
│                                                          │
│ ┌─ Selected Match ────────────────────────────────────┐ │
│ │  HSG Dragons Köln  vs  TV Opponent                  │ │
│ │  Sa, 02.05.2026 — 19:30 — Bezirksliga 1             │ │
│ │  [Change match...]                                   │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─ Broadcast Config ──────────────────────────────────┐ │
│ │ Home abbr:  [DRA]   Color: [#1e90ff ▾] (default)    │ │
│ │ Guest abbr: [TVO]   Color: [#dc2626 ▾] (default)    │ │
│ │ [Save]                                               │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ ┌─ Preview ───────────────────────────────────────────┐ │
│ │  [Iframe rendering /overlay live preview]            │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│  [▶ GO LIVE]   /   [■ END BROADCAST]                    │
│                                                          │
│ OBS URL:  https://app.hbdragons.de/de/overlay  [Copy]   │
└──────────────────────────────────────────────────────────┘
```

Match-picker modal:
- Tab "Today" — default — own-club matches with `kickoffDate = today`, sorted
  by `kickoffTime`.
- Tab "Search" — text input filters by opponent / date.

Preview iframe loads `/overlay` against the same deviceId so the admin can see
exactly what OBS will show, including transparent areas (bordered for legibility
in the iframe).

### Public: `/[locale]/overlay`

Transparent body, no chrome, no navbar, no footer. Standalone layout (mirrors
the existing `/live` standalone layout).

Three render branches driven entirely by `phase`:

- **`phase = "idle"`** → `<></>`. OBS browser source stays loaded but invisible.
- **`phase = "pregame"`** → wide centred pre-game card (~600px wide), both club
  logos via `/assets/clubs/<clubId>.webp`, full team names (use `customName ??
  name`), kickoff time, league. Semi-transparent dark backdrop with team-color
  accents on the side rails. Vertically positioned in the lower half so a
  presenter can sit in the upper half of frame.
- **`phase = "live"`** → bottom-left score bug, fixed pixel layout.

Score bug detail:

```
┌──────────────────────────────────────────────────────────┐
│ ▓▓ DRA  78  ●●●○○                       [Q3 08:42] [24] │
│ ░░ TVO  71  ●●○○○                                        │
└──────────────────────────────────────────────────────────┘
   ^team color blocks  ^foul pips           ^period+clock  ^shot clock
```

Conventions sourced from broadcast research (NBA TNT, ESPN, Fox 2025 redesign,
MagentaSport BBL):

- Team color blocks left of team abbr; abbr in 3-letter caps.
- Score in the largest, boldest tabular-nums type on the bug.
- Period + clock in the centre-right slot.
- Shot clock in a separate block, **red when ≤ 5s**, dimmed when 0.
- 5 foul pips per team; pip filled per foul; **bonus** indicator (yellow border
  or fill) when fouls ≥ 5.
- Score change animates with a 200ms scale-pop so viewers don't miss buckets.
- When `stale=true`: bar dims to 50% opacity; clock text shows last value.

### Existing pages

`/[locale]/live` and `/[locale]/admin/scoreboard` are not modified by this work.

## Section 4 — Lifecycle & State

### Phase computation (server-side)

```
if !isLive || matchId is null:           phase = "idle"
elif clockRunning is false AND period == 0: phase = "pregame"
else:                                     phase = "live"
```

Rationale: the Stramatel console emits `period=0` until the ref starts the
clock for Q1, at which point period flips to 1. So "have we tipped off yet" is
detectable from existing fixture data without new fields.

### Walk-through

1. **30 min before tip-off** — admin opens `/admin/broadcast`, picks the match,
   sets `homeAbbr` / `guestAbbr`, saves. `isLive` still false.
2. **5 min before tip-off** — admin clicks **Go Live**. `isLive=true`,
   `startedAt=now()`. Pi has been posting all along; those frames are persisted
   but were not published to the broadcast channel. The instant `isLive` flips,
   the publisher emits a `phase=pregame` event so the overlay lights up
   immediately.
3. **Tip-off** — ref starts the clock. Pi emits `period=1, clockRunning=true`.
   Publisher emits `phase=live`. Overlay swaps to score bug.
4. **Halftime / quarter break** — clock stops, period stays > 0. `phase=live`.
   Score bug stays up showing the freeze-frame score.
5. **Final whistle** — last period clock = 00:00. `phase=live`. Score bug stays
   up showing final score until admin ends the broadcast.
6. **End Broadcast** — admin clicks. `isLive=false, endedAt=now()`. Phase flips
   to `idle`, overlay goes blank.

### Edge cases

- **Pi dies mid-broadcast.** `lastFrameAt` stops updating. After 30s, publisher
  emits `stale=true`; overlay dims to 50%. When frames resume, `stale=false`.
  Score is never blanked out — Twitch viewers see the frozen score, not an
  "offline" message.
- **Score correction across the broadcast end.** If admin ends broadcast at the
  buzzer but the ref nudges a foul count after, those frames are recorded but
  not published. Acceptable.
- **Wrong match selected.** Admin can change `matchId` mid-broadcast without
  stopping. The cache invalidation triggers on `PUT config`; the next published
  event carries the new match. If `period=0` for the new match, the overlay
  re-shows the pre-game card.
- **Race during isLive flip.** `PUT config` and `POST start` hit the same row by
  PK. Last-write-wins is acceptable since the only concurrent writer is one
  admin user.

### SSE merge & caching

When the publisher fires, it reads `broadcastConfigs` for that deviceId (PK
lookup) and the joined match data. The match join is small but happens on every
frame, so cache the joined match keyed by `(deviceId, matchId)` in process
memory. Invalidate on `PUT config`. Cache lifetime: until matchId changes or
process restarts.

### Heartbeat

15s heartbeat (mirrors existing scoreboard SSE in
`apps/api/src/services/scoreboard/sse.ts`). Reuse the same pattern on the
broadcast channel.

When admin toggles `isLive` (start or stop), the publisher pushes an immediate
event on the broadcast channel so the overlay updates within a tick.

## Section 5 — Files, Tests, Rollout

### Files to create

```
packages/db/src/schema/broadcast-configs.ts          new schema
packages/shared/src/broadcast.ts                     shared types: BroadcastConfig, BroadcastState, BroadcastPhase
apps/api/src/services/broadcast/
  ├── config.ts                                      CRUD + match-join cache
  ├── publisher.ts                                   SSE merger
  └── publisher.test.ts                              unit tests
apps/api/src/routes/admin/broadcast.routes.ts        admin endpoints
apps/api/src/routes/admin/broadcast.routes.test.ts   integration tests
apps/api/src/routes/public/broadcast.routes.ts       /state, /stream
apps/api/src/routes/public/broadcast.routes.test.ts
apps/web/src/app/[locale]/admin/broadcast/
  ├── page.tsx                                       server component
  ├── broadcast-control.tsx                          client component
  └── match-picker.tsx                               modal
apps/web/src/app/[locale]/overlay/
  ├── layout.tsx                                     transparent layout
  ├── page.tsx                                       server component
  ├── overlay-client.tsx                             SSE consumer + phase switch
  ├── pregame-card.tsx
  └── score-bug.tsx
apps/web/src/messages/en.json + de.json              new "broadcast.*" namespace
```

### Files to modify

```
apps/api/src/services/scoreboard/ingest.ts           publish broadcast event when isLive=true
apps/api/src/services/scoreboard/pubsub.ts           broadcast channel name; same Redis client
apps/api/src/index.ts                                wire new route modules
apps/web/src/app/[locale]/admin/layout.tsx           nav link for "Broadcast"
packages/db/src/schema/index.ts                      export new schema
```

### Test strategy

1. **Unit** (`publisher.test.ts`): phase computation across all
   `(isLive, matchId, period, clockRunning)` combinations. Snapshot merge
   produces the right shape for each phase.
2. **Integration** (`broadcast.routes.test.ts`):
   - `POST /start` without matchId → 400.
   - `POST /start` → broadcast SSE emits `phase=pregame`.
   - Inbound running-clock frame → SSE emits `phase=live`.
   - `POST /stop` → SSE emits `phase=idle`.
3. **Pipeline** (new): replay the bundled Stramatel fixture against the running
   stack with a bound match and `isLive=true`, assert the broadcast SSE emits
   the expected (phase, score) sequence over the run. **This is the test gap
   the previous `changed:false` curl bug exposed — fill it here.**
4. **Manual smoke**: Pi running → admin selects today's match → Go Live → OBS
   browser source loads `/overlay` → confirm pre-game card → start clock on
   console → confirm flip to score bug.

### Rollout — two PRs

1. **PR 1 — Backend + admin UI.** Schema + migration, services, routes, admin
   page. No public overlay yet. Smoke-test the admin control without OBS.
2. **PR 2 — Public overlay.** `/overlay` route + components + i18n. Smoke-test
   in OBS.

### Open questions / explicit non-decisions

- Pre-game card visual styling has not been pixel-designed; the plan should
  include a small design pass during PR 2.
- No "manual phase override" admin button (e.g. forcing `pregame` during a
  timeout to plug a sponsor). Add later if needed.
- No score reconciliation back to `matches` table.
