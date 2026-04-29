# Stramatel Live Scoreboard Design

Date: 2026-04-29
Status: Draft
Audience: admin, public viewers

## Problem

The club uses a Stramatel basketball scoreboard during home games. The console drives the LED panel over an RS-485 differential pair at 19200 baud. Today the score, period, clock, fouls and timeouts are visible only to people in the gym. We want the same numbers live on `app.hbdragons.de` so members and fans elsewhere can follow the game.

A separate project, Panel2Net, already taps the RS-485 line on a Raspberry Pi and HTTP-POSTs the raw frames to a third-party PHP service. We want to replace that target with our own API at `api.app.hbdragons.de`, decode the frames in TypeScript, persist them, and push live updates to the web frontend.

## Scope (MVP)

This spec covers the first iteration. The aim is to prove that a single Pi can deliver decoded scoreboard data into Postgres and out to a browser in near real time.

In scope:

- Single Raspberry Pi, single Stramatel console, single bearer-key auth.
- Ingest endpoint that accepts raw hex from the existing `Panel2Net.py` script with minimal Pi-side change.
- TypeScript port of the Stramatel decoder from `stramatel.php`.
- Two Postgres tables: latest snapshot per device, append-only deduplicated history.
- SSE stream with heartbeats, snapshot-on-connect and `Last-Event-ID` replay.
- Public live page and admin debug page on the existing Next.js frontend.
- Unit + fixture-driven tests against the bundled `Stramatel_GEN_HEL_20171125.txt` capture.

Out of scope (deferred):

- Binding a stream to a specific federation match.
- Multiple Pis / multi-venue.
- Mobatime and SwissTiming protocols (frame detection still leaves room for them).
- Higher-level "semantic" event derivation (basket scored, foul called, period ended).
- Statistics, replay UI, broadcast overlay export.
- Rotation tooling for the bearer key beyond manual env-var swap.

## Architecture

```
Stramatel ──RS-485──▶ USB-RS485 ──USB──▶ Raspberry Pi (Panel2Net.py)
                                                │
                                                │ HTTPS POST raw hex, Bearer key
                                                ▼
                  ┌────────────────────────────────────────────────────┐
                  │ Hono ingest route                                  │
                  │  1. requireIngestKey middleware                    │
                  │  2. decode hex → snapshot                          │
                  │  3. compare vs live row → dedupe                   │
                  │  4. INSERT scoreboard_snapshots if changed         │
                  │  5. UPSERT live_scoreboards (always)               │
                  │  6. redis.publish('scoreboard:<deviceId>', json)   │
                  └─────────────────┬──────────────────────────────────┘
                                    │
              ┌─────────────────────┴──────────────────────┐
              ▼                                            ▼
     ┌───────────────────┐                         ┌───────────────────┐
     │ SSE /public/...   │ ◀── Redis SUBSCRIBE     │ Postgres          │
     │ /stream           │                         │ live_scoreboards  │
     └─────────┬─────────┘                         │ scoreboard_       │
               │ text/event-stream                 │   snapshots       │
               ▼                                   └───────────────────┘
     ┌───────────────────┐
     │ Next.js frontend  │
     │ /[locale]/live    │ (public)
     │ /[locale]/admin/  │ (auth + admin role)
     │   scoreboard      │
     └───────────────────┘
```

Persistence and pub/sub run inside the existing API process. No new services. No queue worker (BullMQ is unused for this path — the work is too short to justify a job).

## Decisions and trade-offs

- **Pi stays "dumb", server decodes.** The existing `Panel2Net.py` script ships frames as raw hex over HTTP. We change only the URL, port, scheme (HTTPS) and auth header. Decoder logic lives on the server where it can be fixed without touching the Pi. Raw hex is logged to Postgres (only on changed snapshots), giving us replay material if a frame format edge case shows up later.
- **Latest-row + append-only history.** A single row in `live_scoreboards` always reflects the most recent state, which lets the SSE handler send a snapshot to a newly connected client instantly. A separate `scoreboard_snapshots` table appends deduplicated rows so the timeline survives restarts and powers `Last-Event-ID` replay.
- **Dedupe on decoded fields, not raw bytes.** Stramatel re-emits the same frame ~10 times per second when nothing is changing. Inserting on every frame would balloon the table without adding signal. We compare the decoded snapshot against the previous and insert only when at least one field differs.
- **SSE over WebSocket.** SSE is one-way, fits the data flow, reconnects on the browser side automatically and works through standard HTTP. WebSocket would add complexity without paying for it.
- **Redis pub/sub for fanout.** Already present in the stack. Multi-instance deploys (Cloud Run scales horizontally) need cross-process fanout, and publishing decoded JSON keeps subscribers cheap.
- **Bearer key, not better-auth.** The Pi is not a user. A long random key in an env var (and a `0600` file on the Pi) matches its threat model.

## Data model

Two tables in `packages/db/src/schema/scoreboard.ts`, exported from `packages/db/src/schema/index.ts`.

### `live_scoreboards`

One row per Pi. Always upserted on every successful ingest (so `lastFrameAt` advances even when no field changed).

| Column | Type | Notes |
|---|---|---|
| `device_id` | `text` PK | Value from the `Device_ID` HTTP header (matches `Panel2Net.id`). |
| `score_home` | `integer` not null default 0 | |
| `score_guest` | `integer` not null default 0 | |
| `fouls_home` | `integer` not null default 0 | 0–9 |
| `fouls_guest` | `integer` not null default 0 | |
| `timeouts_home` | `integer` not null default 0 | |
| `timeouts_guest` | `integer` not null default 0 | |
| `period` | `integer` not null default 0 | 0 if unparseable, otherwise 1..N |
| `clock_text` | `text` not null default '' | Verbatim, e.g. `"10:00"` or `"59.5"` |
| `clock_seconds` | `integer` nullable | Parsed; null if `clock_text` is non-numeric |
| `clock_running` | `boolean` not null default false | true iff status byte ≠ "STOP" |
| `shot_clock` | `integer` not null default 0 | 0–24 |
| `timeout_active` | `boolean` not null default false | |
| `timeout_duration` | `text` not null default '' | Raw text |
| `panel_name` | `text` nullable | |
| `last_frame_at` | `timestamptz` not null default `now()` | |
| `updated_at` | `timestamptz` not null default `now()` | |

### `scoreboard_snapshots`

Append-only history. Inserted only when a meaningful field changed vs the current `live_scoreboards` row.

| Column | Type | Notes |
|---|---|---|
| `id` | `serial` PK | Acts as the SSE `Last-Event-ID`. |
| `device_id` | `text` not null | |
| (decoded fields) | mirrors `live_scoreboards` minus `updated_at` | |
| `raw_hex` | `text` nullable | The hex string of the frame that produced this snapshot. Useful for offline replay. |
| `captured_at` | `timestamptz` not null default `now()` | |

Index: `(device_id, captured_at DESC)` for the admin history table; `id` PK is enough for `Last-Event-ID` replay (`id > N` query).

The set of fields used for the dedupe comparison: `score_home, score_guest, fouls_home, fouls_guest, timeouts_home, timeouts_guest, period, clock_seconds, clock_running, shot_clock, timeout_active`. `clock_text` and `timeout_duration` are stored but excluded from the comparison so that minor textual jitter (e.g. `"05.0"` → `"05.1"`) does not create a snapshot per frame.

Migration generated by `pnpm --filter @dragons/db db:generate` after adding the schema file.

## Decoder

`apps/api/src/services/scoreboard/stramatel-decoder.ts` exports:

```ts
export interface StramatelSnapshot {
  scoreHome: number;
  scoreGuest: number;
  foulsHome: number;
  foulsGuest: number;
  timeoutsHome: number;
  timeoutsGuest: number;
  period: number;
  clockText: string;
  clockSeconds: number | null;
  clockRunning: boolean;
  shotClock: number;
  timeoutActive: boolean;
  timeoutDuration: string;
}

export function findScoreFrames(input: Buffer): Buffer[];
export function decodeScoreFrame(frame: Buffer): StramatelSnapshot | null;
```

`decodeScoreFrame` returns `null` when the frame cannot be parsed (wrong length, non-ASCII at expected offsets, etc.) rather than producing zeroes. `null` is the sentinel the ingest service uses to skip persistence — distinct from a legitimate zero-zero state at tip-off.

Frame splitting follows `Panel2Net.py:167` — start tokens `F8 33 20` or `E8 E8 E4`, end token `0D`. The decoder reads ASCII characters at fixed offsets per `stramatel.php:272–323`:

| Field | Offset | Length |
|---|---|---|
| timer minutes / seconds | 2 | 2 |
| timer seconds / tenths | 4 | 2 |
| home score | 6 | 3 |
| guest score | 9 | 3 |
| period | 12 | 1 |
| home fouls | 13 | 1 |
| guest fouls | 14 | 1 |
| home timeouts | 15 | 1 |
| guest timeouts | 16 | 1 |
| game status (`1` = STOP) | 18 | 1 |
| timeout running (space = no) | 19 | 1 |
| timeout duration | 44 | 2 |
| shot clock | 46 | 2 |

Timer format detection mirrors `stramatel.php:299–305`:

```
testCond = trim(frame[4..6])     // 2-byte slice at offset 4
if length(testCond) == 1:
    clockText    = frame[2..4] + "." + frame[3..4]   // "SS.t" sub-second mode
    clockSeconds = floor(parseFloat(clockText))
else:
    clockText    = frame[2..4] + ":" + frame[4..6]   // "MM:SS"
    clockSeconds = MM * 60 + SS
```

When the resulting `clockText` cannot be parsed numerically, `clockSeconds = null` and `clockText` carries the raw value verbatim.

Validation: each numeric field is parsed with `parseInt(trim(...), 10)`; `NaN` becomes `0`. `period` and `shotClock` get the same treatment per `stramatel.php:112–141`.

The decoder never throws. Bad frames return `null`; the ingest service treats `null` as "no useful update" and writes nothing to `live_scoreboards` or `scoreboard_snapshots`. A genuine all-zero snapshot (a valid game state immediately after console reset) is distinct from `null` and is persisted normally.

## Decoder validation

Fixture: `apps/api/src/services/scoreboard/__fixtures__/stramatel-sample.bin` (a copy of `Stramatel_GEN_HEL_20171125.txt` from the Panel2Net repo).

Vitest spec `stramatel-decoder.test.ts`:

- Reads the fixture as a `Buffer`.
- Runs `findScoreFrames` and asserts ≥1000 frames extracted (the file is 3.6 MB).
- Decodes each frame and asserts ranges: `scoreHome/Guest 0–200`, `period 0–10`, `fouls 0–9`, `timeouts 0–9`, `shotClock 0–24`, `clockSeconds null or 0–600`.
- Snapshot tests the first ten decoded frames against `expected.json` (committed alongside the fixture, generated once during dev by running `stramatel.php` over the same input — see "Cross-validation" below).
- Asserts dedupe ratio: applying the dedupe rule sequentially yields fewer change rows than total frames (proves the rule fires on real data).

Cross-validation (one-time, not in CI):

A throwaway script `scripts/validate-stramatel.ts` POSTs the fixture to a locally running PHP container hosting `stramatel.php`, parses the resulting XML and writes `expected.json`. The TypeScript decoder must produce snapshots whose `scoreHome/Guest, period, fouls*, timeouts*, shotClock, clockText` match. After this is run once and the JSON is committed, the PHP step is dropped.

## Endpoints

File layout:

```
apps/api/src/routes/
  api/
    scoreboard.routes.ts
    scoreboard.routes.test.ts
    scoreboard.schemas.ts
  public/
    scoreboard.routes.ts
    scoreboard.routes.test.ts
  admin/
    scoreboard.routes.ts
    scoreboard.routes.test.ts

apps/api/src/middleware/
  ingest-key.ts
  ingest-key.test.ts
```

`apps/api/src/routes/index.ts` mounts:

```ts
routes.route("/api/scoreboard", apiScoreboardRoutes);
routes.route("/public/scoreboard", publicScoreboardRoutes);
routes.route("/admin/scoreboard", adminScoreboardRoutes);
```

### `POST /api/scoreboard/ingest`

Auth: `requireIngestKey` middleware. Constant-time compare of the `Authorization: Bearer <token>` header against `env.SCOREBOARD_INGEST_KEY`.

Headers:
- `Authorization: Bearer <key>` — required.
- `Device_ID: <name>` — required. Must equal `env.SCOREBOARD_DEVICE_ID`. This guards against an unintended second Pi until multi-device support exists.

Body: `text/plain`, raw hex string. Limit 8 KB (`bodyLimit({ maxSize: 8 * 1024 })`).

Behaviour:

1. Convert hex string to `Buffer`.
2. `findScoreFrames(buf)`. If no complete frame is present, respond `200 { ok: true, changed: false, snapshotId: null }`.
3. Decode the last complete frame. If the decoder returns `null`, respond `200 { ok: true, changed: false, snapshotId: null }` without touching the database.
4. Read current `live_scoreboards` row inside a transaction.
5. Compute `changed` against the dedupe field set.
6. If `changed`: `INSERT scoreboard_snapshots` with `raw_hex` set to the originating frame's hex.
7. `UPSERT live_scoreboards` with the decoded fields and `last_frame_at = now()`.
8. After commit: `redis.publish('scoreboard:' + deviceId, JSON.stringify({ ...snapshot, snapshotId, lastFrameAt }))`. Failures here are logged but do not fail the request.

Response: `200 { ok: true, changed: boolean, snapshotId: number | null }`.

Errors:
- `400` on missing `Device_ID` header.
- `401` on missing or wrong bearer.
- `413` on body > 8 KB.
- `429` if rate limit exceeded (see Rate limiting).
- `500` only on database failure.

Decoder failures do not produce 5xx — the response is `200 { ok: true, changed: false, snapshotId: null }` so the Pi keeps streaming.

### `GET /public/scoreboard/latest`

Query: `deviceId` required.
Auth: none.
Returns: JSON object of the `live_scoreboards` row plus `lastFrameAt` and `secondsSinceLastFrame`. `404` with `{ error: "NO_DATA", code: "NO_DATA" }` when row is missing.
Headers: `Cache-Control: no-store`.

### `GET /public/scoreboard/stream`

Query: `deviceId` required.
Auth: none.
Content-Type: `text/event-stream`.

Behaviour:

1. Write a `retry: 2000` field on the first event so browsers reconnect after 2 s on drop.
2. Branch on the `Last-Event-ID` request header:
   - **Absent (fresh client):** read `live_scoreboards`, emit one `event: snapshot` with the current state and `id` set to the most recent snapshot row id (or 0 if no snapshot exists). This gives the user a populated UI without waiting for the next Pi frame.
   - **Present with value `N` (reconnect):** query `scoreboard_snapshots WHERE device_id = ? AND id > N ORDER BY id ASC LIMIT 100` and emit each as `event: snapshot`. Do not also emit the live row — the client already has state through `N` and the replay continues the timeline. When the client's gap exceeds 100, after emitting the 100 replayed events the live subscriber in step 3 catches up the rest naturally; intermediate snapshots between the replayed window and the live tail are absent. This is acceptable for a live view; the admin snapshot endpoint is the source of truth for backfill.
3. Subscribe to the Redis channel `scoreboard:<deviceId>`. Forward each message as `event: snapshot` with `id` set to the snapshot id from the payload.
4. Every 15 seconds write `: ping\n\n` (an SSE comment) to keep the connection alive across proxies and Cloud Run idle limits.
5. On client disconnect: unsubscribe Redis, end the stream.
6. On `SIGTERM`: write `event: shutdown\ndata: {}\n\n` and close. Browsers reconnect automatically.

A per-instance counter caps live connections at 100. Above the cap the response is `503` with `Retry-After: 5`.

### `GET /admin/scoreboard/snapshots`

Auth: `requireAuth` + `requireAnyRole("admin")`.
Query: `deviceId` required, `limit` (default 100, max 500), `afterId` optional.
Returns: JSON array of snapshots in `id DESC` order, including `rawHex`.

### `GET /admin/scoreboard/health`

Auth: `requireAuth` + `requireAnyRole("admin")`.
Query: `deviceId` required.
Returns: `{ deviceId, lastFrameAt, secondsSinceLastFrame, online }` where `online = secondsSinceLastFrame < 10`.

## Services

```
apps/api/src/services/scoreboard/
  stramatel-decoder.ts
  stramatel-decoder.test.ts
  __fixtures__/stramatel-sample.bin
  __fixtures__/expected.json
  ingest.ts                 # decode + dedupe + persist + publish
  ingest.test.ts
  pubsub.ts                 # ioredis publisher / subscriber wrappers
  pubsub.test.ts
  sse.ts                    # SSE response builder, heartbeat, replay
  sse.test.ts
```

`ingest.ts` exports `processIngest({ deviceId, hex })` returning `{ changed, snapshotId }`. The route handler is a thin wrapper around it. Tests against `ingest.ts` use pglite (already wired up in this repo) and an in-memory ioredis mock.

`pubsub.ts` lazily creates a single shared `Redis` connection for publishing and a separate one for each SSE subscriber (ioredis requires a dedicated connection in subscribe mode).

`sse.ts` exports `createScoreboardStream({ deviceId, lastEventId })` returning a Hono `Response` with the streamed body. The body wires up the snapshot-on-connect read, the optional replay query, and the Redis subscriber. Heartbeats are scheduled via `setInterval` and cleared on close.

## Rate limiting

`requireIngestKey` middleware also enforces 30 requests per second per key, using a fixed-window in-memory counter keyed by `<deviceId>:<floor(now/1s)>`. Stramatel emits ~10 frames/sec; this gives 3× headroom and trips only on misconfiguration. On trip: `429` with `Retry-After: 1`.

## Frontend

### Public live page

```
apps/web/src/app/[locale]/(public)/live/
  page.tsx
  scoreboard-live.tsx
  scoreboard-live.test.tsx
```

`page.tsx` is a server component. It calls `/public/scoreboard/latest` once via `fetchAPI` and passes the result as `initialSnapshot` to `<ScoreboardLive>`. If the call returns `NO_DATA`, it renders an "offline" placeholder.

`scoreboard-live.tsx` is a client component:

- Local state seeded with `initialSnapshot`.
- `useEffect` opens `new EventSource(${NEXT_PUBLIC_API_URL}/public/scoreboard/stream?deviceId=${deviceId})`.
- Listens for `event: snapshot`, parses the JSON, calls `setSnapshot`.
- Tracks connection status from `EventSource.readyState` plus a derived `secondsSinceLastFrame` ticker; renders a small status pill (`online` / `connecting` / `offline`).
- Cleans up `eventSource.close()` on unmount.

Layout: dark background, two large team scores side by side, period and clock centered, foul/timeout strips top and bottom. Tailwind only; no animation gymnastics.

`deviceId` for the MVP is sourced from `process.env.NEXT_PUBLIC_SCOREBOARD_DEVICE_ID` and embedded into the page at build time.

### Admin debug page

```
apps/web/src/app/[locale]/admin/scoreboard/
  page.tsx
  scoreboard-debug.tsx
  scoreboard-debug.test.tsx
```

Sections:

1. Health bar: `/admin/scoreboard/health` polled every 2 seconds via SWR. Shows device id, `lastFrameAt`, `secondsSinceLastFrame`, online dot.
2. Live snapshot tile: subscribes to the same SSE stream as the public page. Smaller layout, every decoded field visible, including raw `clockText` and `timeoutDuration`.
3. Recent snapshots table: `/admin/scoreboard/snapshots?limit=200`, with `rawHex` collapsible per row. New SSE events prepend new rows. Pause toggle freezes the table for inspection.

i18n: a small set of strings added to the existing `next-intl` message catalog (`scoreboard.live.title`, `scoreboard.live.period`, `scoreboard.live.connecting`, `scoreboard.live.offline`, `scoreboard.admin.title`, `scoreboard.admin.health`).

## Raspberry Pi changes

The existing `Panel2Net.py` script is reused. Edits, all in the `Panel2Net` repo on a `hbdragons-ingest` branch:

```python
RequestServer = 'api.app.hbdragons.de'
RequestPort   = 443
BaudRate      = 19200      # default to Stramatel speed, skip the search

# Single ingest URL for all panel types in this fork
RequestURL = '/api/scoreboard/ingest'
```

Replace `http.client.HTTPConnection` with `http.client.HTTPSConnection` and pass `ssl.create_default_context()`.

Read the bearer token from `/home/pi/Panel2Net/scoreboard.key` (mode `0600`) at startup and add the header on every request:

```python
headers['Authorization'] = 'Bearer ' + SCOREBOARD_KEY
```

`Panel2Net.id` continues to provide the `Device_ID` header. Systemd autostart unit (already documented in the existing `Scorebug Installation and Usage Manual`) is reused with `Restart=always` and `RestartSec=10`.

After 5 consecutive non-2xx responses the script sleeps 5 seconds before retrying, providing simple back-pressure when the API is misbehaving.

## Configuration

`apps/api/src/config/env.ts` Zod schema additions:

```ts
SCOREBOARD_INGEST_KEY: z.string().min(32),
SCOREBOARD_DEVICE_ID:  z.string().min(1),
```

Both required, no defaults. Add to `.env.example`.

`apps/web` adds:

```
NEXT_PUBLIC_SCOREBOARD_DEVICE_ID=<panel name from Panel2Net.id>
```

CORS: confirm `TRUSTED_ORIGINS` includes the production web origin so SSE on `api.app.hbdragons.de` is reachable from `app.hbdragons.de`.

Secret rotation: generate with `openssl rand -base64 48`, swap in the API env, update `/home/pi/Panel2Net/scoreboard.key`, restart `panel2net.service`. Documented in `apps/api/README.md`.

## Reliability

Server-side:

- Snapshot insert and live upsert run inside a single Drizzle transaction. Redis publish is fire-and-forget after commit; a missed publish is recoverable via the next ingest or by the SSE snapshot-on-connect.
- Decoder errors return zero-snapshot, route returns 200, ingest table untouched. The Pi keeps streaming and the next valid frame catches up.
- SSE heartbeats every 15 s prevent intermediaries from killing idle connections.
- Per-connection write timeout of 5 s drops slow consumers without backing up the event loop.
- Per-instance SSE connection cap (100) returns `503` with `Retry-After: 5` when exceeded.
- Graceful shutdown closes SSE streams with `event: shutdown` so browsers reconnect immediately to a healthy instance.

Client-side:

- `EventSource` reconnects on its own and re-sends `Last-Event-ID`, which our endpoint replays from `scoreboard_snapshots`.
- Connection status pill on the public page makes outages visible.
- Admin page polls `/admin/scoreboard/health` to detect Pi-side outages even when no frames are arriving.

## Observability

Pino structured logs at info level on every ingest:

```
{ event: "scoreboard.ingest", deviceId, frameLen, changed, snapshotId, decodeMs, dbMs }
```

Warn on decoder failures with truncated hex. Info on SSE subscriber count every 30 s. Existing Pino configuration in `apps/api/src/config/logger.ts` is reused.

No new dashboards or alerting is added in this iteration. The admin debug page is the live ops view.

## Test plan

Coverage thresholds (90% branches, 95% functions/lines/statements) apply per the existing `apps/api/vitest.config.ts`.

| File | Tests |
|---|---|
| `stramatel-decoder.ts` | Field-by-field offset cases. `MM:SS` and `SS.t` timer formats. Invalid input → zero snapshot. Fixture-driven snapshot test against `expected.json`. Range and dedupe-ratio assertions on full fixture. |
| `ingest.ts` | pglite + in-memory ioredis mock. Dedupe rule fires when score changes. Dedupe rule skips on identical frame. `live_scoreboards` upserted regardless. `raw_hex` only stored when changed. Redis publish called once after commit. Database failure rolls back snapshot insert. |
| `ingest-key.ts` | Missing bearer → 401. Wrong bearer → 401. Wrong device id → 400. Valid → next handler called. Rate limit triggers 429. |
| `pubsub.ts` | Publish/subscribe round-trip with ioredis mock. |
| `sse.ts` | Heartbeat fires at the configured interval. Snapshot-on-connect emitted from `live_scoreboards`. `Last-Event-ID` replay query bounds. Unsubscribe runs on close. Shutdown event emitted on `SIGTERM`. |
| `api/scoreboard.routes.ts` | 200 happy path, 400/401/413/429/500 paths, response shape. |
| `public/scoreboard.routes.ts` | Latest 200 + 404. Stream sets `Content-Type: text/event-stream` and writes initial snapshot event. |
| `admin/scoreboard.routes.ts` | RBAC guard. Pagination params. Health endpoint shape. |
| `scoreboard-live.tsx` | RTL: renders initial snapshot prop. Mocked `EventSource` dispatches `message` → state updates. Status pill reflects readyState. |
| `scoreboard-debug.tsx` | RTL: renders snapshots table. Pause toggle stops appending. Health bar updates from polled response. |

E2E is skipped for this iteration. Manual smoke test before release: `socat` a fake serial pty, replay `Stramatel_GEN_HEL_20171125.txt` into `Panel2Net.py` configured against a local API + web stack, watch the public live page update.

## Documentation updates

- `AGENTS.md` endpoint list: add the four new routes under their namespaces.
- `AGENTS.md` data model: add `live_scoreboards` and `scoreboard_snapshots`.
- `apps/api/README.md`: add the env vars, the Pi setup pointer, and the key rotation steps.
- `Panel2Net` repo (separate): note the `hbdragons-ingest` branch, the new env file `scoreboard.key`, and the URL/port/HTTPS change in its own `README.md`.

## Open questions

- Should the public page hide itself outside game days? Out of scope for now — the page renders an "offline" placeholder when there is no recent data, which is acceptable.
- Long-term retention policy on `scoreboard_snapshots` — at hundreds of rows per game and tens of games per season, the table stays under a million rows for years. Revisit if storage becomes a concern.
- Multi-Pi support — straightforward extension: drop the device-id env guard, add a small `scoreboard_devices` table with one row per Pi (name, key hash, active flag), look up by token. Not part of the MVP.

## Migration / rollout

1. Land schema migration under a feature flag check (`env.SCOREBOARD_INGEST_KEY` presence).
2. Land API routes and frontend pages dark; without the env vars the routes return 500-config and the public page is unlinked.
3. Provision the bearer key in production and on the Pi.
4. Smoke test against the live console during a practice session.
5. Add the `/[locale]/live` link to the public navigation.
