# Change Detection & Notification Engine

**Date:** 2026-03-16
**Status:** Draft
**Author:** Design session with JN

## Problem

The Dragons admin system syncs match data from the Basketball-Bund API, supports local edits (schedule overrides, venue changes, referee reassignments), and manages venue bookings. These systems are loosely coupled today. When a game changes — whether from a sync or a manual edit — there is no automated way to detect the change, record it, and notify the right people through the right channel.

Club admins, referees, venue managers, and team contacts need to know about changes that affect them. A game moved to tomorrow morning needs an immediate WhatsApp message. A score correction from last week can wait for a daily recap. The system should handle both without manual intervention.

## Goals

1. **Persistent change detection** — record every change to matches, bookings, referee assignments, and venues as a typed domain event, regardless of whether anyone is listening
2. **Configurable notifications** — role-based defaults that work out of the box, plus admin-defined custom watch rules with a condition builder UI
3. **Multi-channel delivery** — in-app, WhatsApp group (Business API), push notifications, email, and future WhatsApp DMs
4. **Urgency-aware routing** — urgent changes fire immediately to external channels; routine changes are batched into digests
5. **Browsable history** — a Notification Center in the admin panel where every change is visible, filterable, and deep-linked to its source entity

## Non-Goals

- WhatsApp individual DMs (low priority, deferred)
- User self-service rule creation (admin-only for now)
- External webhook consumers (future, but the architecture supports it)

## Architecture Overview

The system has four layers:

```
Change Sources (sync pipeline, match admin, booking admin, referee admin)
        ↓ emit events
Change Detection Layer (foundation)
   ├── domain_events table (persistent store of ALL changes)
   ├── matchChanges table (existing field-level diffs)
   └── Event Bus (BullMQ queue on Redis)
        ↓ consumed by
Notification Center (in-app)          Notification Engine (external delivery)
   reads domain_events directly        consumes from BullMQ queue
   every change visible individually   evaluates watch rules + role defaults
   browsable, filterable, deep-linked  routes by urgency
                                              ↓
                                       Channel Adapters
                                       WA Group | Push | Email | (WA DM future)
                                              ↓
                                       Audit: notification_log
```

### Key Principle: Change Detection is the Foundation

The `domain_events` table is the source of truth. It records what changed, when, from what to what, and who triggered it. The notification system is one consumer of this data. The Notification Center is another. Future consumers (webhooks, reports, dashboards) can be added without touching the notification engine.

## Domain Events

### Base Event Shape

Every event emitted by any source carries this structure:

```typescript
interface DomainEvent {
  id: string                    // unique event ID (ULID or UUID)
  type: string                  // hierarchical: "match.kickoffTime.changed"
  source: "sync" | "manual" | "reconciliation"
  urgency: "immediate" | "routine"
  occurredAt: Date
  actor: string | null          // userId for manual edits, null for sync
  syncRunId: number | null      // links to syncRuns table when source is sync
  entityType: "match" | "booking" | "referee"
  entityId: number              // ID of the changed entity
  entityName: string            // human-readable: "U16 Dragons vs. TSV Giessen"
  payload: Record<string, unknown>  // event-type-specific data
}
```

### Event Types

**Match events:**

| Type | Payload | Default Urgency |
|---|---|---|
| `match.schedule.changed` | matchId, teamIds[], leagueId, oldDate, newDate, oldTime, newTime | immediate if within 7 days, else routine |
| `match.venue.changed` | matchId, teamIds[], leagueId, oldVenueId, newVenueId, oldVenueName, newVenueName | immediate if within 7 days, else routine |
| `match.cancelled` | matchId, teamIds[], leagueId, reason | immediate |
| `match.forfeited` | matchId, teamIds[], leagueId, forfeitTeamId | immediate |
| `match.created` | matchId, teamIds[], leagueId, kickoffDate, kickoffTime, venueName | routine |
| `match.score.changed` | matchId, teamIds[], leagueId, oldScores, newScores | routine |
| `match.removed` | matchId, teamIds[], leagueId, kickoffDate, kickoffTime, venueName | immediate if within 7 days, else routine |

Note on the 7-day urgency rule: "immediate if within 7 days" means immediate if **either** the old or new date falls within 7 days of now. A match moved from 3 days out to 2 months out is still urgent (it was imminent). A match moved from 2 months out to next week is also urgent (it's now imminent).

**Referee events:**

| Type | Payload | Default Urgency |
|---|---|---|
| `referee.assigned` | matchId, teamIds[], refereeId, refereeName, slotNumber, roleId | routine |
| `referee.unassigned` | matchId, teamIds[], refereeId, refereeName, slotNumber, roleId | routine |
| `referee.reassigned` | matchId, teamIds[], oldRefereeId, newRefereeId, oldRefereeName, newRefereeName, slotNumber, roleId | routine |

**Booking events:**

| Type | Payload | Default Urgency |
|---|---|---|
| `booking.created` | bookingId, venueId, venueName, matchIds[], startTime, endTime | routine |
| `booking.status.changed` | bookingId, venueId, venueName, oldStatus, newStatus | routine |
| `booking.needs_reconfirmation` | bookingId, venueId, venueName, matchIds[], reason | immediate |

**Override events:**

| Type | Payload | Default Urgency |
|---|---|---|
| `override.conflict` | matchId, teamIds[], fieldName, localValue, newRemoteValue, overrideOwner | immediate |
| `override.applied` | matchId, teamIds[], fieldName, oldValue, newValue, changedBy | routine |

### Event Emission Points

Events are emitted at the point where changes are already detected:

- **Sync pipeline** (`services/sync/matches.sync.ts`, `referees.sync.ts`): after hash comparison detects a change and the upsert completes
- **Match admin service** (`services/admin/match-admin.service.ts`): inside `updateMatchLocal()` after field changes are recorded
- **Booking admin service** (`services/admin/booking-admin.service.ts`): in `createBooking()`, `updateBooking()`, `updateBookingStatus()`, and `deleteBooking()` methods
- **Venue booking service** (`services/venue-booking/venue-booking.service.ts`): inside `reconcileAfterSync()` when bookings need reconfirmation

Each emitter calls `publishDomainEvent(event)` which uses a transactional outbox pattern:

1. Write the event to the `domain_events` table inside the existing database transaction (same transaction as the entity upsert)
2. After the transaction commits, enqueue to the BullMQ `domain-events` queue on Redis

If the Redis enqueue fails after the DB commit, a catch-up poller (`EventOutboxPoller`) runs every 30 seconds to find `domain_events` rows that haven't been enqueued yet (tracked via a `enqueuedAt` column) and retries the enqueue. This guarantees at-least-once delivery to the event bus without requiring cross-datastore transactions.

## Watch Rules

### Data Model

```typescript
interface WatchRule {
  id: number                    // serial
  name: string                  // human-readable: "U16 venue changes → Hall WhatsApp"
  enabled: boolean
  createdBy: string             // userId

  // Condition
  eventTypes: string[]          // ["match.venue.changed", "match.cancelled"]
                                // supports wildcards: "match.*"
  filters: FilterCondition[]    // AND-combined

  // Action
  channels: ChannelTarget[]     // where to send
  urgencyOverride: "immediate" | "routine" | null  // override default urgency
  templateOverride: string | null  // custom message template key
}

interface FilterCondition {
  field: "teamId" | "leagueId" | "venueId" | "source"
  operator: "eq" | "neq" | "in" | "any"
  value: string | string[] | null  // null when operator is "any"
}

interface ChannelTarget {
  channel: "in_app" | "whatsapp_group" | "push" | "email"
  targetId: string              // channelConfigId
}
```

### Condition Evaluation

When the event worker processes an event:

1. Load all enabled watch rules
2. For each rule, check if the event type matches (with wildcard support)
3. For matching rules, evaluate all filters against the event payload (AND logic)
4. The `any` operator matches all values for that field (global rules)
5. Collect all matched rules, deduplicate channel targets
6. Apply urgency: use the rule's `urgencyOverride` if set, otherwise the event's default urgency

### Role-Based Defaults

The existing auth system defines two roles: `admin` and `user`. Referee status is derived from the `user.refereeId` FK. Venue manager and team contact roles do not exist in the current data model.

**Phase 1 (this feature):** Role-based defaults use the existing role model plus referee detection:

| Audience | Detection | Events | Channel |
|---|---|---|---|
| Admin | `user.role === "admin"` | All match.*, booking.*, override.*, referee.* | in_app |
| Referee | `user.refereeId IS NOT NULL` | referee.assigned/unassigned/reassigned (own assignments), match.cancelled (assigned matches) | in_app |

**Phase 2 (future):** Add `venue_manager` and `team_contact` as new user roles in the auth system. This requires a migration to add role values and an admin UI for role assignment. Once added:

| Audience | Detection | Events | Channel |
|---|---|---|---|
| Venue Manager | `user.role === "venue_manager"` | booking.*, match.venue.changed, match.schedule.changed (managed venues) | in_app |
| Team Contact | `user.role === "team_contact"` | match.schedule.changed, match.venue.changed, match.cancelled (own team) | in_app |

Built-in defaults cannot be deleted but users can mute categories in their preferences.

### Admin UI: Condition Builder

The admin panel at `/admin/notifications/rules` provides a rule builder with three sections:

- **WHEN** — event type picker (multi-select tags, supports wildcards)
- **AND** — filter rows with dropdowns: field selector, operator (eq/neq/in/any), value picker (populated from existing teams/leagues/venues). The "any" operator disables the value picker and matches everything.
- **THEN** — channel picker referencing configured channels from `channel_configs`
- **Urgency** — toggle: use default / force immediate / force routine

## Channel Configuration

### Data Model

```typescript
interface ChannelConfig {
  id: number
  name: string                  // "Referee WhatsApp Group"
  type: "in_app" | "whatsapp_group" | "whatsapp_dm" | "push" | "email"
  enabled: boolean
  config: Record<string, unknown>  // type-specific (JSONB)

  // Digest settings
  digestMode: "per_sync" | "scheduled" | "none"
  digestCron: string | null     // cron expression when digestMode = "scheduled"
  digestTimezone: string        // default: "Europe/Berlin"
}
```

### Type-Specific Config

**whatsapp_group:**
```json
{ "groupId": "120363...", "phoneNumberId": "1234567", "locale": "de" }
```

**push:**
```json
{ "audienceRole": "admin", "topicFilter": null }
```
Resolves to `push_devices` entries by user role. Phase 1 supports `admin` and referee-based targeting. Phase 2 adds `venue_manager` and `team_contact` audiences.

**email:**
```json
{ "recipients": ["admin@dragons.de"], "replyTo": "noreply@dragons.de", "provider": "smtp" }
```

**in_app:**
```json
{ "audienceRole": "admin" }
```
Resolves to all users with that role.

### Delivery Priority (Build Order)

1. In-app (extend existing system)
2. WhatsApp group (Business API)
3. Push notifications
4. Email
5. WhatsApp individual DMs (future)

## Three-Layer Notification Model

### Layer 1: In-App (always, every change)

The Notification Center reads directly from `domain_events`. Every change appears as an individual entry the moment it is detected. No rules are needed — this is the browsable change history. Filterable by event type, entity, date range. Each entry deep-links to the source entity.

### Layer 2: Immediate (urgent, external channels)

Urgent events (cancellations, near-term changes within 7 days, booking reconfirmation needs, override conflicts) are dispatched immediately to matched external channels. The rule engine determines which channels receive the notification.

### Layer 3: Digest (recap, external channels)

The digest includes ALL changes from the period — both urgent ones that were already sent immediately and routine ones that were not. It is the "nothing slipped through" safety net. Each channel config specifies its digest mode:

- **per_sync** — digest sent after each sync run completes
- **scheduled** — digest sent on a cron schedule (e.g. daily at 08:00)
- **none** — no digest, only immediate delivery

Digest messages include deep links to each individual item and a link to the Notification Center filtered view.

## Notification Center (Admin Panel)

### Purpose

The existing notifications page at `/admin/notifications` is replaced with a full Notification Center that serves two purposes:

1. **Change history** — browse all changes detected by the system (from `domain_events`)
2. **Delivery status** — see which notifications were sent, to which channels, and whether they succeeded (from `notification_log`)

### Features

- **Filter bar** — by event type, channel, delivery status, date range, search text
- **Individual entries** — each change shown with title, body, event type badge, source badge, delivery status per channel, deep link to entity
- **Digest groups** — digest deliveries shown as expandable groups that reveal individual items
- **Failed deliveries** — highlighted with error message and retry button
- **Unread tracking** — in-app entries track read/unread status per user

### Deep Link Strategy

Every `domain_event` entry stores:

- `entityType` — "match" | "booking" | "referee"
- `entityId` — the entity's database ID
- `entityName` — human-readable display name
- `deepLinkPath` — pre-resolved path like `/admin/matches/42`

The `notification_log` references `domain_events` via `eventId` FK — deep link info is resolved via join, not duplicated.

**In-app:** click navigates to the deep link path.
**External channels:** messages include the full URL (e.g. `https://dragons.app/admin/matches/42`).
**Digest messages:** each item has its own entity link, plus the digest itself links to `/admin/notifications?digest=run-123`.

## Delivery Guarantees

### Retry Policy

- 3 attempts per channel with exponential backoff (30s, 2m, 10m)
- After 3 failures: logged as failed in `notification_log` with error message
- Failed deliveries visible in Notification Center with manual retry button

### Deduplication

- Unique constraint on eventId + channelConfigId + recipientId in `notification_log`
- Prevents double-sends on worker restart or reprocessing

### Rate Limiting

- Per-channel rate limits respecting provider constraints (WhatsApp API limits)
- Overflow automatically converts to digest delivery

## Message Templates

Messages are rendered by a function-based template engine — one render function per event type, no external template library. Each function takes a `DomainEvent` and a locale string, returns `{ title: string, body: string }`. This keeps the system simple and type-safe. Template functions live in `services/notifications/templates/`.

### Single Notification Example (German)

```
🏀 Spielverlegung: U16 Dragons vs. TSV Giessen
Neuer Termin: Sa 22.03. um 14:00 Uhr (vorher: 16:00 Uhr)
→ https://dragons.app/admin/matches/42
```

### Digest Example (German)

```
📋 Tägliche Zusammenfassung — 5 Änderungen

⚡ Spielabsage: U14 Dragons vs. BC Marburg (bereits gemeldet um 19:12)
🏀 Spielverlegung: U16 vs. TSV Giessen → Sa 22.03. 14:00 (vorher 16:00)
👤 Neuer SR: Herren 1 vs. BC Marburg — Max Müller als SR1
📊 Ergebnis: U14 vs. Eintracht — 68:54
🏟️ Buchung bestätigt: Sporthalle Nord, Sa 29.03.

Details: https://dragons.app/admin/notifications?digest=run-456
```

Templates are locale-aware. Each user/channel can specify a locale preference. Messages are rendered in the target locale.

## Database Schema (New Tables)

### domain_events

The persistent event store. Foundation of the system.

| Column | Type | Notes |
|---|---|---|
| id | text (ULID) | Primary key |
| type | text | Event type, indexed |
| source | text | "sync" / "manual" / "reconciliation" |
| urgency | text | "immediate" / "routine" |
| occurredAt | timestamp | When the change happened |
| actor | text | userId or null |
| syncRunId | integer | FK to syncRuns, nullable |
| entityType | text | "match" / "booking" / "referee" |
| entityId | integer | ID of changed entity |
| entityName | text | Human-readable name for display |
| deepLinkPath | text | Pre-resolved admin path |
| enqueuedAt | timestamp | When enqueued to BullMQ, nullable (used by outbox poller) |
| payload | jsonb | Event-type-specific data |
| createdAt | timestamp | Record creation time |

Indexes: type, entityType+entityId, occurredAt, syncRunId, enqueuedAt (partial, WHERE enqueuedAt IS NULL)

### Retention Policy

Events older than 1 year are archived or deleted by a cleanup job (similar to the existing `cleanupOldSyncRuns` pattern with configurable retention). The cleanup runs as a scheduled BullMQ job.

### watch_rules

Admin-defined notification rules.

| Column | Type | Notes |
|---|---|---|
| id | serial | Primary key |
| name | text | Human-readable rule name |
| enabled | boolean | Default true |
| createdBy | text | userId |
| eventTypes | text[] | Array of event type patterns |
| filters | jsonb | Array of FilterCondition |
| channels | jsonb | Array of ChannelTarget |
| urgencyOverride | text | Nullable |
| templateOverride | text | Nullable |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### channel_configs

Configuration for each delivery channel instance.

| Column | Type | Notes |
|---|---|---|
| id | serial | Primary key |
| name | text | "Referee WhatsApp Group" |
| type | text | Channel type enum |
| enabled | boolean | Default true |
| config | jsonb | Type-specific provider config |
| digestMode | text | "per_sync" / "scheduled" / "none" |
| digestCron | text | Cron expression, nullable |
| digestTimezone | text | Default "Europe/Berlin" |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### notification_log

Audit trail of every delivery attempt.

| Column | Type | Notes |
|---|---|---|
| id | serial | Primary key |
| eventId | text | FK to domain_events |
| watchRuleId | integer | FK to watch_rules, nullable (null = role default) |
| channelConfigId | integer | FK to channel_configs |
| recipientId | text | userId, nullable (null for group channels) |
| title | text | Rendered message title |
| body | text | Rendered message body |
| locale | text | "de" / "en" |
| status | text | "pending" / "sent" / "failed" / "read" |
| sentAt | timestamp | Nullable |
| readAt | timestamp | Nullable |
| digestRunId | integer | Groups items sent in same digest, nullable |
| errorMessage | text | Nullable |
| retryCount | integer | Default 0 |
| createdAt | timestamp | |

Deduplication constraint: unique index on `(eventId, channelConfigId, COALESCE(recipientId, '__group__'))`. This handles group channels where `recipientId` is null — PostgreSQL treats NULLs as distinct in unique constraints, so `COALESCE` ensures group channel deduplication works correctly.

### digest_buffer

Holds events waiting for digest delivery.

| Column | Type | Notes |
|---|---|---|
| id | serial | Primary key |
| eventId | text | FK to domain_events |
| channelConfigId | integer | FK to channel_configs |
| createdAt | timestamp | |

Unique constraint: eventId + channelConfigId (prevents duplicate buffering on worker retry).

Cleared after digest is sent.

## Existing Tables: Changes

### notifications (existing)

Replaced by `notification_log` for delivery tracking. The existing `notifications` table can be migrated and eventually dropped.

### userNotificationPreferences (existing)

Extended with:
- `locale` (text, default "de") — preferred message language
- `mutedEventTypes` (text[], default empty) — event types the user has muted from role defaults

## Integration Points

### Sync Pipeline

In `services/sync/matches.sync.ts` and `referees.sync.ts`, after a change is detected and upserted, call `publishDomainEvent()`. The sync pipeline already tracks what changed (hash comparison, field diffs) — the event emission adds one function call at each detection point.

### Match Admin Service

In `services/admin/match-admin.service.ts`, inside `updateMatchLocal()`, after field changes are recorded in `matchChanges` and `matchLocalVersions`, emit the corresponding domain event(s).

### Venue Booking Service

In `services/venue-booking/venue-booking.service.ts`, inside `reconcileAfterSync()` and status change operations, emit booking events.

### BullMQ Workers

New workers added to the existing worker infrastructure in `workers/`:

- **Event worker** — processes the `domain-events` queue, evaluates rules, dispatches or buffers
- **Digest worker** — flushes `digest_buffer` per channel, renders digest messages, delivers. Triggered in two ways:
  - **per_sync**: the sync worker emits a `sync.completed` event at the end of `fullSync()`. The event worker recognizes this as a digest trigger and enqueues a digest job for all channels with `digestMode = "per_sync"`.
  - **scheduled**: a BullMQ repeatable job runs on each channel's `digestCron` schedule.
- **Outbox poller** — runs every 30 seconds, finds `domain_events` rows where `enqueuedAt IS NULL`, enqueues them to BullMQ, and sets `enqueuedAt`. Catches any events missed due to Redis failures after DB commit.

Expected watch rule cardinality: <50 rules for a club app. Rules are loaded from the database on each event (no caching needed at this scale). If rule count grows significantly, add an in-memory cache with short TTL.

## Testing Strategy

- **Event emission**: unit tests verifying each emitter publishes the correct event type and payload for different change scenarios
- **Rule engine**: unit tests for condition matching (wildcards, any operator, AND filters, urgency override)
- **Channel adapters**: unit tests with mocked providers, integration tests for in-app delivery
- **Digest worker**: unit tests for buffer collection, grouping, template rendering
- **Notification Center API**: integration tests for list, filter, mark-read, retry endpoints
- **End-to-end**: sync run that detects a change → event emitted → rule matched → notification delivered → visible in Notification Center
