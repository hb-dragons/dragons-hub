# Referee Notification System — Design Spec

## Problem

Home games in certain leagues require the club to provide its own referees. Today, the referee coordinator manually tracks which games need referees and contacts people individually. This creates unnecessary coordination overhead and risks games going unstaffed when communication falls through.

## Goal

Automate the "games need referees" notification loop:

1. When a home game that needs referees is synced, automatically notify a WhatsApp group
2. Send escalating reminders as the game approaches if slots remain unfilled
3. Reduce the referee coordinator's manual workload to near-zero for the notification side

## Scope

**In scope:**
- Domain events for referee slot availability (`referee.slots.needed`, `referee.slots.reminder`)
- Reminder job scheduling with configurable day thresholds
- Reminder job lifecycle (create, cancel on fill/cancel/reschedule, re-create on unfill)
- WhatsApp group delivery via WAHA (self-hosted, WEBJS engine)
- WhatsApp group channel adapter in the notification pipeline
- German-language message templates with slot-aware content
- Admin setting for reminder schedule (`referee_reminder_days`)

**Out of scope (deferred):**
- Referee dashboard UI improvements (tabs, game-day view)
- WhatsApp Channel support (future config swap, same adapter)
- Individual WhatsApp messages to referees
- Push notifications
- Admin UI for managing watch rules

---

## Architecture

### Event Model

Two new domain event types:

| Event | Emitted By | Trigger |
|---|---|---|
| `referee.slots.needed` | Match sync | New home game in `ownClubRefs` league (regardless of sr*Open), OR `sr1Open`/`sr2Open` flips `false→true` on any own-club home game |
| `referee.slots.reminder` | Reminder worker | Delayed job fires at configured days before kickoff |

Both events share the same payload:

```typescript
interface RefereeSlotsPayload {
  matchId: number;
  matchNo: string;
  homeTeam: string;
  guestTeam: string;
  leagueId: number;
  leagueName: string;
  kickoffDate: string;         // "2026-03-15"
  kickoffTime: string;         // "14:00"
  venueId: number;
  venueName: string;
  sr1Open: boolean;
  sr2Open: boolean;
  sr1Assigned: string | null;  // referee name if filled
  sr2Assigned: string | null;
  reminderLevel?: number;      // days before kickoff (only on reminder events)
  deepLink: string;            // "/referee/matches?take={matchId}"
}
```

Slot state (`sr1Open`, `sr2Open`, `sr1Assigned`, `sr2Assigned`) is evaluated at emission time. For reminders, the worker reads current DB state when the job fires, not when it was scheduled.

### Reminder Job Lifecycle

**Queue:** New BullMQ queue `referee-reminders` with its own worker.

**Configuration:** `appSettings` key `referee_reminder_days`, value is a JSON array of integers (e.g., `[7, 3, 1]`). Admin-configurable via the settings page. Default: `[7, 3, 1]`.

**Job creation** — in `matches.sync.ts` after a qualifying match is created:

Reminder jobs are only created for own-club home games in `ownClubRefs` leagues (where the club is responsible for providing referees). Federation-open slots (`sr1Open`/`sr2Open`) trigger an immediate notification but no reminders — those are the federation's responsibility to fill.

1. Match has `homeTeam.isOwnClub = true` AND `league.ownClubRefs = true`
2. Read `referee_reminder_days` from `appSettings`
3. For each reminder day N, calculate delay: `kickoffDateTime - N days - now`
4. Skip reminders where delay is negative (already past)
5. Create delayed jobs with deterministic IDs: `reminder:{matchId}:{days}`

**Job execution** — when a delayed job fires:

1. Load match with current slot state + assignments from DB
2. If both slots filled → skip, emit nothing
3. If match cancelled or forfeited → skip
4. If at least one slot unfilled → publish `referee.slots.reminder` domain event
5. Event flows through notification pipeline → WhatsApp group delivery

**Job cancellation:**

| Trigger | Action |
|---|---|
| Both slots filled (detected during sync or via referee take) | Remove all pending reminder jobs for this match |
| Match cancelled or forfeited | Remove all pending reminder jobs |
| Match rescheduled (kickoff date/time changes) | Remove old jobs, create new ones with updated delays |
| Referee unassigned (slot re-opens) | Re-create reminder jobs for remaining thresholds that haven't passed |

**Edge cases:**

- **Config changes** (`referee_reminder_days` updated): Only affects newly created matches. Existing scheduled jobs continue with their original schedule.
- **Server restart:** BullMQ delayed jobs persist in Redis. No jobs lost.
- **Duplicate prevention:** Deterministic job IDs (`reminder:{matchId}:{days}`) prevent duplicate scheduling. BullMQ's `jobId` dedup handles this.

### WhatsApp Delivery via WAHA

**Infrastructure:**

- WAHA Docker container added to `docker/docker-compose.dev.yml` (WEBJS engine)
- Dedicated prepaid SIM, QR-scanned once for authentication
- Free Core tier (sufficient for sending text + images to groups)
- Runs alongside existing Postgres + Redis containers

**Channel adapter** integrated into the existing notification channel system:

```typescript
// channelConfigs table entry
{
  type: "whatsapp_group",
  name: "Referee WhatsApp Group",
  enabled: true,
  config: {
    wahaBaseUrl: "http://waha:3000",
    wahaSession: "default",
    groupChatId: "123456789@g.us"
  }
}
```

The adapter calls WAHA's `POST /api/sendText` with `chatId` set to the configured group ID.

**Switching to WhatsApp Channel later:** Change `groupChatId` from `123456789@g.us` to `123456789@newsletter`. Same API, same adapter, same code.

### Message Templates

All messages in German with WhatsApp markdown formatting.

**Initial notification** (`referee.slots.needed`):

```
🏀 *Schiedsrichter gesucht!*

Dragons U16 vs. TSV Neustadt
📅 Sa, 15.03.2026 um 14:00
📍 Sporthalle Musterstraße
🏟️ Kreisliga U16

SR1: ❌ offen
SR2: ❌ offen

👉 Spiel übernehmen: https://app.dragons.de/referee/matches?take=42
```

**Reminder — both slots open:**

```
⚠️ *Noch Schiedsrichter benötigt!*

Dragons U16 vs. TSV Neustadt
📅 Sa, 15.03.2026 um 14:00
📍 Sporthalle Musterstraße

SR1: ❌ offen
SR2: ❌ offen

Spieltag in 3 Tagen!
👉 https://app.dragons.de/referee/matches?take=42
```

**Reminder — one slot filled:**

```
⚠️ *Noch ein Schiedsrichter benötigt!*

Dragons U16 vs. TSV Neustadt
📅 Sa, 15.03.2026 um 14:00
📍 Sporthalle Musterstraße

SR1: ✅ Max Mustermann
SR2: ❌ *offen*

Spieltag in 3 Tagen!
👉 https://app.dragons.de/referee/matches?take=42
```

Template rendering is a pure function: `(event payload) → string`. No external dependencies.

### Integration Points

**Event emission** — in `matches.sync.ts`:

- After inserting a new match: check `homeTeam.isOwnClub` + `league.ownClubRefs` → emit `referee.slots.needed` + schedule reminder jobs
- After updating a match: detect `sr1Open`/`sr2Open` flip `false→true` → emit `referee.slots.needed`
- After updating a match: detect kickoff date/time change → reschedule reminder jobs
- After updating a match: detect cancellation/forfeiture → cancel reminder jobs

**Slot fill detection** — in `referees.sync.ts`:

- After confirming referee assignments: check if both slots now filled → cancel remaining reminder jobs

**Notification pipeline** — existing infrastructure handles routing:

- `referee.slots.needed` and `referee.slots.reminder` flow through `processEvent()`
- Watch rule or role-based default routes to `whatsapp_group` channel config
- WhatsApp adapter renders template and sends via WAHA

### Codebase Changes

| File | Change |
|---|---|
| `packages/shared/src/domain-events.ts` | Add `referee.slots.needed` and `referee.slots.reminder` event types + payload type |
| `apps/api/src/services/sync/matches.sync.ts` | Emit `referee.slots.needed` on qualifying match creation and sr*Open flip; schedule/manage reminder jobs |
| `apps/api/src/services/sync/referees.sync.ts` | Cancel reminder jobs when both slots filled |
| `apps/api/src/workers/queues.ts` | Add `referee-reminders` queue definition |
| `apps/api/src/workers/referee-reminder.worker.ts` | **New** — processes delayed reminder jobs, emits `referee.slots.reminder` domain events |
| `apps/api/src/workers/index.ts` | Register new worker |
| `apps/api/src/services/referee/referee-reminders.service.ts` | **New** — schedule, cancel, reschedule reminder jobs |
| `apps/api/src/services/notifications/channels/whatsapp-group.ts` | **New** — WhatsApp group channel adapter using WAHA API |
| `apps/api/src/services/notifications/templates/referee-slots.ts` | **New** — German message template renderer |
| `apps/api/src/services/notifications/role-defaults.ts` | Add default routing for `referee.slots.*` events to whatsapp_group channel |
| `apps/api/src/services/notifications/event-types.ts` | Add urgency classification for new event types |
| `docker/docker-compose.dev.yml` | Add WAHA service |
| `apps/api/src/config/env.ts` | Add `WAHA_BASE_URL` env var (optional, defaults to `http://waha:3000`) |

### Environment Variables

New optional variables:

```
WAHA_BASE_URL=http://waha:3000       # WAHA API base URL
WAHA_SESSION=default                  # WAHA session name
```

The WhatsApp group chat ID is stored in the `channelConfigs` table, not in env vars (admin-configurable).

### Error Handling

- **WAHA unreachable:** Log error, mark notification as failed in `notificationLog`. Notification pipeline continues for other channels. No retry (next reminder will fire anyway).
- **WhatsApp number banned:** WAHA returns error. Same handling as unreachable. Admin notified via in-app notification to re-register with a new number.
- **Reminder job fires but match data inconsistent:** Skip and log. Don't send a notification with incomplete data.

### Testing

- **Reminder service:** Unit tests for job scheduling, cancellation, rescheduling logic
- **WhatsApp adapter:** Unit test with mocked WAHA HTTP calls
- **Message templates:** Unit tests for all template variants (both open, one filled, reminder levels)
- **Integration:** Sync pipeline tests verifying events are emitted and jobs scheduled for qualifying matches
- **Reminder worker:** Tests verifying DB state check before emission (filled slots → skip, cancelled → skip)
