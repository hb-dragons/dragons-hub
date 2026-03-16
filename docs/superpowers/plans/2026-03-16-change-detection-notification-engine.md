# Change Detection & Notification Engine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an event-driven change detection and notification system that records all entity changes as domain events and delivers notifications via in-app, WhatsApp, push, and email channels.

**Architecture:** Domain events are persisted in a `domain_events` table (transactional outbox pattern) and published to a BullMQ queue. A rule engine evaluates watch rules and role-based defaults, routing events to channel adapters by urgency. The Notification Center reads events directly from the database for browsable history.

**Tech Stack:** Drizzle ORM (schema/migrations), BullMQ (queues/workers), Zod (validation), Hono (API routes), Next.js (admin UI), ULID (event IDs)

**Spec:** `docs/superpowers/specs/2026-03-16-change-detection-notification-engine-design.md`

---

## File Structure

### New Files

```
packages/db/src/schema/domain-events.ts          # domain_events table
packages/db/src/schema/watch-rules.ts             # watch_rules table
packages/db/src/schema/channel-configs.ts         # channel_configs table
packages/db/src/schema/notification-log.ts        # notification_log table
packages/db/src/schema/digest-buffer.ts           # digest_buffer table

packages/shared/src/domain-events.ts              # DomainEvent types, event type constants, payload types
packages/shared/src/watch-rules.ts                # WatchRule, FilterCondition, ChannelTarget types
packages/shared/src/channel-configs.ts            # ChannelConfig types

apps/api/src/services/events/event-publisher.ts   # publishDomainEvent(), outbox pattern
apps/api/src/services/events/event-types.ts       # Event type registry, urgency classification
apps/api/src/services/events/outbox-poller.ts     # Catch-up poller for missed enqueues

apps/api/src/services/notifications/rule-engine.ts         # Watch rule evaluation, wildcard matching
apps/api/src/services/notifications/role-defaults.ts       # Built-in role-based notification rules
apps/api/src/services/notifications/channels/in-app.ts     # In-app channel adapter
apps/api/src/services/notifications/channels/types.ts      # ChannelAdapter interface
apps/api/src/services/notifications/templates/match.ts     # Match event templates (de/en)
apps/api/src/services/notifications/templates/referee.ts   # Referee event templates
apps/api/src/services/notifications/templates/booking.ts   # Booking event templates
apps/api/src/services/notifications/templates/override.ts  # Override event templates
apps/api/src/services/notifications/templates/digest.ts    # Digest template renderer
apps/api/src/services/notifications/templates/index.ts     # Template registry

apps/api/src/workers/event.worker.ts              # Processes domain-events queue
apps/api/src/workers/digest.worker.ts             # Flushes digest buffer per channel

apps/api/src/services/admin/event-admin.service.ts     # Notification Center listing/filtering
apps/api/src/services/admin/watch-rule-admin.service.ts  # CRUD for watch rules
apps/api/src/services/admin/channel-config-admin.service.ts # CRUD for channel configs

apps/api/src/routes/admin/event.routes.ts         # Domain event listing endpoints
apps/api/src/routes/admin/watch-rule.routes.ts    # Watch rule CRUD endpoints
apps/api/src/routes/admin/channel-config.routes.ts # Channel config CRUD endpoints
```

### Modified Files

```
packages/db/src/schema/index.ts                   # Export new schema tables
packages/db/src/schema/notifications.ts           # Extend userNotificationPreferences

packages/shared/src/index.ts                      # Export new shared types

apps/api/src/services/sync/matches.sync.ts        # Emit match events after change detection
apps/api/src/services/sync/referees.sync.ts       # Emit referee events after assignment changes
apps/api/src/services/sync/index.ts               # Emit sync.completed event

apps/api/src/services/admin/match-admin.service.ts     # Emit events in updateMatchLocal()
apps/api/src/services/admin/booking-admin.service.ts   # Emit events in booking mutations

apps/api/src/services/venue-booking/venue-booking.service.ts # Emit booking.needs_reconfirmation

apps/api/src/workers/queues.ts                    # Add domain-events and digest queues
apps/api/src/workers/index.ts                     # Initialize new workers

apps/api/src/routes/index.ts                      # Mount new admin routes
```

---

## Chunk 1: Database Schema & Shared Types

### Task 1: Install ULID dependency

**Files:**
- Modify: `package.json` (root or `apps/api/package.json`)

- [ ] **Step 1: Install ulid package**

```bash
pnpm --filter @dragons/api add ulid
```

- [ ] **Step 2: Verify installation**

```bash
pnpm --filter @dragons/api exec -- node -e "const { ulid } = require('ulid'); console.log(ulid())"
```

Expected: prints a ULID string like `01HXXXXXXXXXXXXXXXXXXXXXX`

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore: add ulid dependency for domain event IDs"
```

---

### Task 2: Create domain_events schema

**Files:**
- Create: `packages/db/src/schema/domain-events.ts`
- Test: `packages/db/src/schema/domain-events.test.ts`

- [ ] **Step 1: Write the schema file**

```typescript
// packages/db/src/schema/domain-events.ts
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { syncRuns } from "./sync-runs";

export const domainEvents = pgTable(
  "domain_events",
  {
    id: text("id").primaryKey(), // ULID
    type: text("type").notNull(),
    source: text("source").notNull(), // "sync" | "manual" | "reconciliation"
    urgency: text("urgency").notNull(), // "immediate" | "routine"
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    actor: text("actor"),
    syncRunId: integer("sync_run_id").references(() => syncRuns.id),
    entityType: text("entity_type").notNull(), // "match" | "booking" | "referee"
    entityId: integer("entity_id").notNull(),
    entityName: text("entity_name").notNull(),
    deepLinkPath: text("deep_link_path").notNull(),
    enqueuedAt: timestamp("enqueued_at", { withTimezone: true }),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    typeIdx: index("domain_events_type_idx").on(table.type),
    entityIdx: index("domain_events_entity_idx").on(table.entityType, table.entityId),
    occurredAtIdx: index("domain_events_occurred_at_idx").on(table.occurredAt),
    syncRunIdx: index("domain_events_sync_run_idx").on(table.syncRunId),
    outboxIdx: index("domain_events_outbox_idx")
      .on(table.enqueuedAt)
      .where(sql`enqueued_at IS NULL`),
  }),
);

export type DomainEventRow = typeof domainEvents.$inferSelect;
export type DomainEventInsert = typeof domainEvents.$inferInsert;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @dragons/db exec -- tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/domain-events.ts
git commit -m "feat(db): add domain_events schema table"
```

---

### Task 3: Create watch_rules schema

**Files:**
- Create: `packages/db/src/schema/watch-rules.ts`

- [ ] **Step 1: Write the schema file**

```typescript
// packages/db/src/schema/watch-rules.ts
import {
  boolean,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const watchRules = pgTable("watch_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: text("created_by").notNull(),
  eventTypes: text("event_types").array().notNull(),
  filters: jsonb("filters").notNull().$type<FilterConditionRow[]>().default([]),
  channels: jsonb("channels").notNull().$type<ChannelTargetRow[]>().default([]),
  urgencyOverride: text("urgency_override"), // "immediate" | "routine" | null
  templateOverride: text("template_override"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export interface FilterConditionRow {
  field: "teamId" | "leagueId" | "venueId" | "source";
  operator: "eq" | "neq" | "in" | "any";
  value: string | string[] | null;
}

export interface ChannelTargetRow {
  channel: "in_app" | "whatsapp_group" | "push" | "email";
  targetId: string;
}

export type WatchRuleRow = typeof watchRules.$inferSelect;
export type WatchRuleInsert = typeof watchRules.$inferInsert;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @dragons/db exec -- tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/watch-rules.ts
git commit -m "feat(db): add watch_rules schema table"
```

---

### Task 4: Create channel_configs schema

**Files:**
- Create: `packages/db/src/schema/channel-configs.ts`

- [ ] **Step 1: Write the schema file**

```typescript
// packages/db/src/schema/channel-configs.ts
import {
  boolean,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const channelConfigs = pgTable("channel_configs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "in_app" | "whatsapp_group" | "whatsapp_dm" | "push" | "email"
  enabled: boolean("enabled").notNull().default(true),
  config: jsonb("config").notNull().$type<Record<string, unknown>>().default({}),
  digestMode: text("digest_mode").notNull().default("per_sync"), // "per_sync" | "scheduled" | "none"
  digestCron: text("digest_cron"),
  digestTimezone: text("digest_timezone").notNull().default("Europe/Berlin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChannelConfigRow = typeof channelConfigs.$inferSelect;
export type ChannelConfigInsert = typeof channelConfigs.$inferInsert;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @dragons/db exec -- tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/channel-configs.ts
git commit -m "feat(db): add channel_configs schema table"
```

---

### Task 5: Create notification_log schema

**Files:**
- Create: `packages/db/src/schema/notification-log.ts`

- [ ] **Step 1: Write the schema file**

```typescript
// packages/db/src/schema/notification-log.ts
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { domainEvents } from "./domain-events";
import { watchRules } from "./watch-rules";
import { channelConfigs } from "./channel-configs";

export const notificationLog = pgTable(
  "notification_log",
  {
    id: serial("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => domainEvents.id),
    watchRuleId: integer("watch_rule_id").references(() => watchRules.id),
    channelConfigId: integer("channel_config_id")
      .notNull()
      .references(() => channelConfigs.id),
    recipientId: text("recipient_id"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    locale: text("locale").notNull().default("de"),
    status: text("status").notNull().default("pending"), // "pending" | "sent" | "failed" | "read"
    sentAt: timestamp("sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    digestRunId: integer("digest_run_id"),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // NOTE: Drizzle's .on() may not support sql expressions. If this fails,
    // add a custom migration with raw SQL instead:
    // CREATE UNIQUE INDEX notification_log_dedup_idx
    //   ON notification_log (event_id, channel_config_id, COALESCE(recipient_id, '__group__'));
    eventChannelRecipientIdx: uniqueIndex("notification_log_dedup_idx").on(
      table.eventId,
      table.channelConfigId,
    ).where(sql`true`), // placeholder — see custom migration note above
    statusIdx: index("notification_log_status_idx").on(table.status),
    recipientIdx: index("notification_log_recipient_idx").on(table.recipientId),
    digestRunIdx: index("notification_log_digest_run_idx").on(table.digestRunId),
  }),
);

export type NotificationLogRow = typeof notificationLog.$inferSelect;
export type NotificationLogInsert = typeof notificationLog.$inferInsert;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @dragons/db exec -- tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/notification-log.ts
git commit -m "feat(db): add notification_log schema table"
```

---

### Task 6: Create digest_buffer schema

**Files:**
- Create: `packages/db/src/schema/digest-buffer.ts`

- [ ] **Step 1: Write the schema file**

```typescript
// packages/db/src/schema/digest-buffer.ts
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { domainEvents } from "./domain-events";
import { channelConfigs } from "./channel-configs";

export const digestBuffer = pgTable(
  "digest_buffer",
  {
    id: serial("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => domainEvents.id),
    channelConfigId: integer("channel_config_id")
      .notNull()
      .references(() => channelConfigs.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventChannelIdx: uniqueIndex("digest_buffer_event_channel_idx").on(
      table.eventId,
      table.channelConfigId,
    ),
  }),
);

export type DigestBufferRow = typeof digestBuffer.$inferSelect;
export type DigestBufferInsert = typeof digestBuffer.$inferInsert;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @dragons/db exec -- tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/digest-buffer.ts
git commit -m "feat(db): add digest_buffer schema table"
```

---

### Task 7: Export new schemas and extend userNotificationPreferences

**Files:**
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/schema/notifications.ts`

- [ ] **Step 1: Add exports to schema index**

Add to `packages/db/src/schema/index.ts`:

```typescript
export * from "./domain-events";
export * from "./watch-rules";
export * from "./channel-configs";
export * from "./notification-log";
export * from "./digest-buffer";
```

- [ ] **Step 2: Extend userNotificationPreferences**

In `packages/db/src/schema/notifications.ts`, add two columns to `userNotificationPreferences`:

```typescript
locale: text("locale").notNull().default("de"),
mutedEventTypes: text("muted_event_types").array().notNull().default([]),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @dragons/db exec -- tsc --noEmit
```

- [ ] **Step 4: Generate migration**

```bash
pnpm --filter @dragons/db db:generate
```

- [ ] **Step 5: Review generated migration file**

Check the generated SQL creates all 5 new tables with correct columns, indexes, and constraints. Verify the `userNotificationPreferences` ALTER ADD COLUMN statements.

- [ ] **Step 6: Run migration**

```bash
pnpm --filter @dragons/db db:migrate
```

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/index.ts packages/db/src/schema/notifications.ts packages/db/drizzle/
git commit -m "feat(db): export new schemas, extend user preferences, generate migration"
```

---

### Task 8: Create shared domain event types

**Files:**
- Create: `packages/shared/src/domain-events.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write shared types**

```typescript
// packages/shared/src/domain-events.ts

// --- Event source and urgency ---

export type EventSource = "sync" | "manual" | "reconciliation";
export type EventUrgency = "immediate" | "routine";
export type EventEntityType = "match" | "booking" | "referee";

// --- Event type constants ---

export const EVENT_TYPES = {
  // Match
  MATCH_SCHEDULE_CHANGED: "match.schedule.changed",
  MATCH_VENUE_CHANGED: "match.venue.changed",
  MATCH_CANCELLED: "match.cancelled",
  MATCH_FORFEITED: "match.forfeited",
  MATCH_CREATED: "match.created",
  MATCH_SCORE_CHANGED: "match.score.changed",
  MATCH_REMOVED: "match.removed",
  // Referee
  REFEREE_ASSIGNED: "referee.assigned",
  REFEREE_UNASSIGNED: "referee.unassigned",
  REFEREE_REASSIGNED: "referee.reassigned",
  // Booking
  BOOKING_CREATED: "booking.created",
  BOOKING_STATUS_CHANGED: "booking.status.changed",
  BOOKING_NEEDS_RECONFIRMATION: "booking.needs_reconfirmation",
  // Override
  OVERRIDE_CONFLICT: "override.conflict",
  OVERRIDE_APPLIED: "override.applied",
  // System
  SYNC_COMPLETED: "sync.completed",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// --- Payload types per event ---

export interface MatchScheduleChangedPayload {
  matchId: number;
  teamIds: number[];
  leagueId: number;
  oldDate: string | null;
  newDate: string;
  oldTime: string | null;
  newTime: string;
}

export interface MatchVenueChangedPayload {
  matchId: number;
  teamIds: number[];
  leagueId: number;
  oldVenueId: number | null;
  newVenueId: number;
  oldVenueName: string | null;
  newVenueName: string;
}

export interface MatchCancelledPayload {
  matchId: number;
  teamIds: number[];
  leagueId: number;
  reason: string | null;
}

export interface MatchForfeitedPayload {
  matchId: number;
  teamIds: number[];
  leagueId: number;
  forfeitTeamId: number | null;
}

export interface MatchCreatedPayload {
  matchId: number;
  teamIds: number[];
  leagueId: number;
  kickoffDate: string;
  kickoffTime: string | null;
  venueName: string | null;
}

export interface MatchScoreChangedPayload {
  matchId: number;
  teamIds: number[];
  leagueId: number;
  oldScores: { home: number | null; guest: number | null };
  newScores: { home: number | null; guest: number | null };
}

export interface MatchRemovedPayload {
  matchId: number;
  teamIds: number[];
  leagueId: number;
  kickoffDate: string | null;
  kickoffTime: string | null;
  venueName: string | null;
}

export interface RefereeAssignedPayload {
  matchId: number;
  teamIds: number[];
  refereeId: number;
  refereeName: string;
  slotNumber: number;
  roleId: number | null;
}

export interface RefereeUnassignedPayload {
  matchId: number;
  teamIds: number[];
  refereeId: number;
  refereeName: string;
  slotNumber: number;
  roleId: number | null;
}

export interface RefereeReassignedPayload {
  matchId: number;
  teamIds: number[];
  oldRefereeId: number;
  newRefereeId: number;
  oldRefereeName: string;
  newRefereeName: string;
  slotNumber: number;
  roleId: number | null;
}

export interface BookingCreatedPayload {
  bookingId: number;
  venueId: number;
  venueName: string;
  matchIds: number[];
  startTime: string;
  endTime: string;
}

export interface BookingStatusChangedPayload {
  bookingId: number;
  venueId: number;
  venueName: string;
  oldStatus: string;
  newStatus: string;
}

export interface BookingNeedsReconfirmationPayload {
  bookingId: number;
  venueId: number;
  venueName: string;
  matchIds: number[];
  reason: string;
}

export interface OverrideConflictPayload {
  matchId: number;
  teamIds: number[];
  fieldName: string;
  localValue: string | null;
  newRemoteValue: string | null;
  overrideOwner: string | null;
}

export interface OverrideAppliedPayload {
  matchId: number;
  teamIds: number[];
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string | null;
}

export interface SyncCompletedPayload {
  syncRunId: number;
  duration: number;
  summary: Record<string, unknown>;
}

// --- Domain Event API types ---

export interface DomainEventItem {
  id: string;
  type: string;
  source: EventSource;
  urgency: EventUrgency;
  occurredAt: string;
  actor: string | null;
  syncRunId: number | null;
  entityType: EventEntityType;
  entityId: number;
  entityName: string;
  deepLinkPath: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface DomainEventListResult {
  events: DomainEventItem[];
  total: number;
}
```

- [ ] **Step 2: Add exports to shared index**

In `packages/shared/src/index.ts`, add:

```typescript
// Domain events
export * from "./domain-events";
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @dragons/shared exec -- tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/domain-events.ts packages/shared/src/index.ts
git commit -m "feat(shared): add domain event types and constants"
```

---

### Task 9: Create shared watch rule and channel config types

**Files:**
- Create: `packages/shared/src/watch-rules.ts`
- Create: `packages/shared/src/channel-configs.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write watch rule shared types**

```typescript
// packages/shared/src/watch-rules.ts

export interface FilterCondition {
  field: "teamId" | "leagueId" | "venueId" | "source";
  operator: "eq" | "neq" | "in" | "any";
  value: string | string[] | null;
}

export interface ChannelTarget {
  channel: "in_app" | "whatsapp_group" | "push" | "email";
  targetId: string;
}

export interface WatchRuleItem {
  id: number;
  name: string;
  enabled: boolean;
  createdBy: string;
  eventTypes: string[];
  filters: FilterCondition[];
  channels: ChannelTarget[];
  urgencyOverride: string | null;
  templateOverride: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WatchRuleListResult {
  rules: WatchRuleItem[];
  total: number;
}

export interface CreateWatchRuleBody {
  name: string;
  eventTypes: string[];
  filters: FilterCondition[];
  channels: ChannelTarget[];
  urgencyOverride?: string | null;
  templateOverride?: string | null;
}

export interface UpdateWatchRuleBody {
  name?: string;
  enabled?: boolean;
  eventTypes?: string[];
  filters?: FilterCondition[];
  channels?: ChannelTarget[];
  urgencyOverride?: string | null;
  templateOverride?: string | null;
}
```

- [ ] **Step 2: Write channel config shared types**

```typescript
// packages/shared/src/channel-configs.ts

export type ChannelType = "in_app" | "whatsapp_group" | "whatsapp_dm" | "push" | "email";
export type DigestMode = "per_sync" | "scheduled" | "none";

export interface ChannelConfigItem {
  id: number;
  name: string;
  type: ChannelType;
  enabled: boolean;
  config: Record<string, unknown>;
  digestMode: DigestMode;
  digestCron: string | null;
  digestTimezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelConfigListResult {
  channels: ChannelConfigItem[];
  total: number;
}

export interface CreateChannelConfigBody {
  name: string;
  type: ChannelType;
  config: Record<string, unknown>;
  digestMode?: DigestMode;
  digestCron?: string | null;
  digestTimezone?: string;
}

export interface UpdateChannelConfigBody {
  name?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
  digestMode?: DigestMode;
  digestCron?: string | null;
  digestTimezone?: string;
}
```

- [ ] **Step 3: Add exports to shared index**

In `packages/shared/src/index.ts`, add:

```typescript
export * from "./watch-rules";
export * from "./channel-configs";
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter @dragons/shared exec -- tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/watch-rules.ts packages/shared/src/channel-configs.ts packages/shared/src/index.ts
git commit -m "feat(shared): add watch rule and channel config types"
```

---

## Chunk 2: Event Publisher & Urgency Classification

### Task 10: Create event type registry and urgency classifier

**Files:**
- Create: `apps/api/src/services/events/event-types.ts`
- Test: `apps/api/src/services/events/event-types.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/services/events/event-types.test.ts
import { describe, expect, it } from "vitest";
import { classifyUrgency, isWithin7Days } from "./event-types";
import { EVENT_TYPES } from "@dragons/shared";

describe("isWithin7Days", () => {
  it("returns true for a date 3 days from now", () => {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    expect(isWithin7Days(date.toISOString().split("T")[0])).toBe(true);
  });

  it("returns false for a date 10 days from now", () => {
    const date = new Date();
    date.setDate(date.getDate() + 10);
    expect(isWithin7Days(date.toISOString().split("T")[0])).toBe(false);
  });

  it("returns true for today", () => {
    expect(isWithin7Days(new Date().toISOString().split("T")[0])).toBe(true);
  });

  it("returns true for a date 2 days ago", () => {
    const date = new Date();
    date.setDate(date.getDate() - 2);
    expect(isWithin7Days(date.toISOString().split("T")[0])).toBe(true);
  });
});

describe("classifyUrgency", () => {
  it("returns immediate for match.cancelled", () => {
    expect(
      classifyUrgency(EVENT_TYPES.MATCH_CANCELLED, {}),
    ).toBe("immediate");
  });

  it("returns immediate for match.schedule.changed when old date is within 7 days", () => {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    expect(
      classifyUrgency(EVENT_TYPES.MATCH_SCHEDULE_CHANGED, {
        oldDate: threeDaysFromNow.toISOString().split("T")[0],
        newDate: "2027-06-01",
      }),
    ).toBe("immediate");
  });

  it("returns immediate for match.schedule.changed when new date is within 7 days", () => {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    expect(
      classifyUrgency(EVENT_TYPES.MATCH_SCHEDULE_CHANGED, {
        oldDate: "2027-06-01",
        newDate: threeDaysFromNow.toISOString().split("T")[0],
      }),
    ).toBe("immediate");
  });

  it("returns routine for match.schedule.changed when both dates are far out", () => {
    expect(
      classifyUrgency(EVENT_TYPES.MATCH_SCHEDULE_CHANGED, {
        oldDate: "2027-06-01",
        newDate: "2027-07-01",
      }),
    ).toBe("routine");
  });

  it("returns routine for match.created", () => {
    expect(
      classifyUrgency(EVENT_TYPES.MATCH_CREATED, {}),
    ).toBe("routine");
  });

  it("returns immediate for booking.needs_reconfirmation", () => {
    expect(
      classifyUrgency(EVENT_TYPES.BOOKING_NEEDS_RECONFIRMATION, {}),
    ).toBe("immediate");
  });

  it("returns routine for referee.assigned", () => {
    expect(
      classifyUrgency(EVENT_TYPES.REFEREE_ASSIGNED, {}),
    ).toBe("routine");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @dragons/api exec -- vitest run src/services/events/event-types.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Write implementation**

```typescript
// apps/api/src/services/events/event-types.ts
import { EVENT_TYPES, type EventUrgency } from "@dragons/shared";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function isWithin7Days(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.abs(date.getTime() - now.getTime()) <= SEVEN_DAYS_MS;
}

// Events that are always immediate
const ALWAYS_IMMEDIATE: Set<string> = new Set([
  EVENT_TYPES.MATCH_CANCELLED,
  EVENT_TYPES.MATCH_FORFEITED,
  EVENT_TYPES.BOOKING_NEEDS_RECONFIRMATION,
  EVENT_TYPES.OVERRIDE_CONFLICT,
]);

// Events that are always routine
const ALWAYS_ROUTINE: Set<string> = new Set([
  EVENT_TYPES.MATCH_CREATED,
  EVENT_TYPES.MATCH_SCORE_CHANGED,
  EVENT_TYPES.REFEREE_ASSIGNED,
  EVENT_TYPES.REFEREE_UNASSIGNED,
  EVENT_TYPES.REFEREE_REASSIGNED,
  EVENT_TYPES.BOOKING_CREATED,
  EVENT_TYPES.BOOKING_STATUS_CHANGED,
  EVENT_TYPES.OVERRIDE_APPLIED,
]);

// Events with date-dependent urgency (immediate if within 7 days)
const DATE_DEPENDENT: Set<string> = new Set([
  EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
  EVENT_TYPES.MATCH_VENUE_CHANGED,
  EVENT_TYPES.MATCH_REMOVED,
]);

export function classifyUrgency(
  eventType: string,
  payload: Record<string, unknown>,
): EventUrgency {
  if (ALWAYS_IMMEDIATE.has(eventType)) return "immediate";
  if (ALWAYS_ROUTINE.has(eventType)) return "routine";

  if (DATE_DEPENDENT.has(eventType)) {
    const oldDate = payload.oldDate as string | undefined;
    const newDate = payload.newDate as string | undefined;
    const kickoffDate = payload.kickoffDate as string | undefined;

    if (isWithin7Days(oldDate) || isWithin7Days(newDate) || isWithin7Days(kickoffDate)) {
      return "immediate";
    }
    return "routine";
  }

  // Default to routine for unknown event types
  return "routine";
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @dragons/api exec -- vitest run src/services/events/event-types.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/events/event-types.ts apps/api/src/services/events/event-types.test.ts
git commit -m "feat(api): add event type registry and urgency classifier"
```

---

### Task 11: Create event publisher with outbox pattern

**Files:**
- Create: `apps/api/src/services/events/event-publisher.ts`
- Test: `apps/api/src/services/events/event-publisher.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/services/events/event-publisher.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildDomainEvent } from "./event-publisher";
import { EVENT_TYPES } from "@dragons/shared";

describe("buildDomainEvent", () => {
  it("creates a domain event with correct fields", () => {
    const event = buildDomainEvent({
      type: EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
      source: "sync",
      entityType: "match",
      entityId: 42,
      entityName: "U16 Dragons vs. TSV Giessen",
      deepLinkPath: "/admin/matches/42",
      payload: {
        matchId: 42,
        teamIds: [1, 2],
        leagueId: 5,
        oldDate: "2026-03-20",
        newDate: "2026-03-22",
        oldTime: "16:00",
        newTime: "14:00",
      },
      syncRunId: 10,
    });

    expect(event.id).toMatch(/^[0-9A-Z]{26}$/); // ULID format
    expect(event.type).toBe("match.schedule.changed");
    expect(event.source).toBe("sync");
    expect(event.entityType).toBe("match");
    expect(event.entityId).toBe(42);
    expect(event.entityName).toBe("U16 Dragons vs. TSV Giessen");
    expect(event.deepLinkPath).toBe("/admin/matches/42");
    expect(event.syncRunId).toBe(10);
    expect(event.actor).toBeNull();
    expect(event.urgency).toBeDefined(); // classified by urgency function
    expect(event.occurredAt).toBeInstanceOf(Date);
    expect(event.payload).toHaveProperty("matchId", 42);
  });

  it("sets actor for manual events", () => {
    const event = buildDomainEvent({
      type: EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
      source: "manual",
      actor: "user-123",
      entityType: "match",
      entityId: 42,
      entityName: "Test Match",
      deepLinkPath: "/admin/matches/42",
      payload: { matchId: 42, teamIds: [], leagueId: 1, oldDate: "2027-06-01", newDate: "2027-06-02", oldTime: "16:00", newTime: "14:00" },
    });

    expect(event.actor).toBe("user-123");
    expect(event.syncRunId).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @dragons/api exec -- vitest run src/services/events/event-publisher.test.ts
```

- [ ] **Step 3: Write implementation**

```typescript
// apps/api/src/services/events/event-publisher.ts
import { ulid } from "ulid";
import { db } from "../../config/database";
import { domainEvents } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import type { EventSource, EventEntityType } from "@dragons/shared";
import { classifyUrgency } from "./event-types";
import { domainEventsQueue } from "../../workers/queues";
import { logger } from "../../config/logger";

const log = logger.child({ service: "event-publisher" });

export interface PublishEventParams {
  type: string;
  source: EventSource;
  entityType: EventEntityType;
  entityId: number;
  entityName: string;
  deepLinkPath: string;
  payload: Record<string, unknown>;
  actor?: string | null;
  syncRunId?: number | null;
}

export interface BuiltDomainEvent {
  id: string;
  type: string;
  source: EventSource;
  urgency: "immediate" | "routine";
  occurredAt: Date;
  actor: string | null;
  syncRunId: number | null;
  entityType: EventEntityType;
  entityId: number;
  entityName: string;
  deepLinkPath: string;
  payload: Record<string, unknown>;
}

export function buildDomainEvent(params: PublishEventParams): BuiltDomainEvent {
  return {
    id: ulid(),
    type: params.type,
    source: params.source,
    urgency: classifyUrgency(params.type, params.payload),
    occurredAt: new Date(),
    actor: params.actor ?? null,
    syncRunId: params.syncRunId ?? null,
    entityType: params.entityType,
    entityId: params.entityId,
    entityName: params.entityName,
    deepLinkPath: params.deepLinkPath,
    payload: params.payload,
  };
}

/**
 * Insert a domain event into the database.
 * Call this inside an existing transaction to guarantee atomicity with the entity change.
 * The outbox poller will enqueue it to BullMQ if Redis enqueue fails.
 */
export async function insertDomainEvent(
  event: BuiltDomainEvent,
  tx?: typeof db,
): Promise<void> {
  const conn = tx ?? db;
  await conn.insert(domainEvents).values(event);
  log.debug({ eventId: event.id, type: event.type }, "domain event persisted");
}

/**
 * Enqueue a domain event to BullMQ and mark it as enqueued.
 * Called after DB transaction commits, or by the outbox poller for missed events.
 */
export async function enqueueDomainEvent(event: BuiltDomainEvent): Promise<void> {
  try {
    await domainEventsQueue.add(event.type, event, {
      jobId: event.id, // deduplicate by event ID
    });

    await db
      .update(domainEvents)
      .set({ enqueuedAt: new Date() })
      .where(eq(domainEvents.id, event.id));

    log.debug({ eventId: event.id, type: event.type }, "domain event enqueued");
  } catch (error) {
    // Log but don't throw — outbox poller will retry
    log.warn({ eventId: event.id, error }, "failed to enqueue domain event, outbox poller will retry");
  }
}

/**
 * High-level publish: insert to DB (inside optional tx) then try to enqueue.
 */
export async function publishDomainEvent(
  params: PublishEventParams,
  tx?: typeof db,
): Promise<BuiltDomainEvent> {
  const event = buildDomainEvent(params);
  await insertDomainEvent(event, tx);
  // Fire-and-forget enqueue — outbox poller catches failures
  void enqueueDomainEvent(event);
  return event;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @dragons/api exec -- vitest run src/services/events/event-publisher.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/events/event-publisher.ts apps/api/src/services/events/event-publisher.test.ts
git commit -m "feat(api): add event publisher with transactional outbox pattern"
```

---

### Task 12: Add domain-events queue to BullMQ infrastructure

**Files:**
- Modify: `apps/api/src/workers/queues.ts`

- [ ] **Step 1: Add domain-events and digest queues**

In `apps/api/src/workers/queues.ts`, add after the existing sync queue:

```typescript
export const domainEventsQueue = new Queue("domain-events", {
  prefix: "{bull}",
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    attempts: 1, // events are idempotent, no retry at queue level
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export const digestQueue = new Queue("digest", {
  prefix: "{bull}",
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @dragons/api exec -- tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/workers/queues.ts
git commit -m "feat(api): add domain-events and digest BullMQ queues"
```

---

### Task 13: Create outbox poller

**Files:**
- Create: `apps/api/src/services/events/outbox-poller.ts`
- Test: `apps/api/src/services/events/outbox-poller.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/api/src/services/events/outbox-poller.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { pollOutbox } from "./outbox-poller";

// This test verifies the poller function queries for un-enqueued events
// Full integration test requires DB + Redis, so we test the query logic shape
describe("pollOutbox", () => {
  it("is a function", () => {
    expect(typeof pollOutbox).toBe("function");
  });
});
```

- [ ] **Step 2: Write implementation**

```typescript
// apps/api/src/services/events/outbox-poller.ts
import { db } from "../../config/database";
import { domainEvents } from "@dragons/db/schema";
import { isNull } from "drizzle-orm";
import { domainEventsQueue } from "../../workers/queues";
import { eq } from "drizzle-orm";
import { logger } from "../../config/logger";

const log = logger.child({ service: "outbox-poller" });

export async function pollOutbox(): Promise<number> {
  const pending = await db
    .select()
    .from(domainEvents)
    .where(isNull(domainEvents.enqueuedAt))
    .limit(100);

  if (pending.length === 0) return 0;

  let enqueued = 0;
  for (const event of pending) {
    try {
      await domainEventsQueue.add(event.type, event, {
        jobId: event.id,
      });
      await db
        .update(domainEvents)
        .set({ enqueuedAt: new Date() })
        .where(eq(domainEvents.id, event.id));
      enqueued++;
    } catch (error) {
      log.warn({ eventId: event.id, error }, "outbox poller failed to enqueue event");
    }
  }

  if (enqueued > 0) {
    log.info({ enqueued, total: pending.length }, "outbox poller processed events");
  }

  return enqueued;
}

let pollerInterval: ReturnType<typeof setInterval> | null = null;

export function startOutboxPoller(intervalMs = 30_000): void {
  if (pollerInterval) return;
  pollerInterval = setInterval(() => {
    pollOutbox().catch((err) =>
      log.error({ error: err }, "outbox poller error"),
    );
  }, intervalMs);
  log.info({ intervalMs }, "outbox poller started");
}

export function stopOutboxPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    log.info("outbox poller stopped");
  }
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @dragons/api exec -- vitest run src/services/events/outbox-poller.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/events/outbox-poller.ts apps/api/src/services/events/outbox-poller.test.ts
git commit -m "feat(api): add outbox poller for domain event catch-up"
```

---

## Chunk 3: Rule Engine

### Task 14: Create rule engine with wildcard matching

**Files:**
- Create: `apps/api/src/services/notifications/rule-engine.ts`
- Test: `apps/api/src/services/notifications/rule-engine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/services/notifications/rule-engine.test.ts
import { describe, expect, it } from "vitest";
import {
  matchesEventType,
  evaluateFilter,
  evaluateRule,
} from "./rule-engine";
import type { FilterConditionRow, ChannelTargetRow } from "@dragons/db";

describe("matchesEventType", () => {
  it("exact match", () => {
    expect(matchesEventType("match.cancelled", "match.cancelled")).toBe(true);
  });

  it("no match for different type", () => {
    expect(matchesEventType("match.cancelled", "match.created")).toBe(false);
  });

  it("wildcard match.* matches match.cancelled", () => {
    expect(matchesEventType("match.*", "match.cancelled")).toBe(true);
  });

  it("wildcard match.* matches match.schedule.changed", () => {
    expect(matchesEventType("match.*", "match.schedule.changed")).toBe(true);
  });

  it("wildcard *.cancelled does not match match.cancelled", () => {
    // Only trailing wildcards supported
    expect(matchesEventType("*.cancelled", "match.cancelled")).toBe(false);
  });

  it("wildcard * matches everything", () => {
    expect(matchesEventType("*", "match.cancelled")).toBe(true);
  });
});

describe("evaluateFilter", () => {
  const payload = {
    matchId: 42,
    teamIds: [10, 20],
    leagueId: 5,
  };

  it("eq operator matches", () => {
    const filter: FilterConditionRow = { field: "leagueId", operator: "eq", value: "5" };
    expect(evaluateFilter(filter, payload)).toBe(true);
  });

  it("eq operator does not match", () => {
    const filter: FilterConditionRow = { field: "leagueId", operator: "eq", value: "99" };
    expect(evaluateFilter(filter, payload)).toBe(false);
  });

  it("neq operator matches", () => {
    const filter: FilterConditionRow = { field: "leagueId", operator: "neq", value: "99" };
    expect(evaluateFilter(filter, payload)).toBe(true);
  });

  it("in operator matches for array field (teamId)", () => {
    const filter: FilterConditionRow = { field: "teamId", operator: "in", value: ["10", "30"] };
    expect(evaluateFilter(filter, payload)).toBe(true);
  });

  it("in operator does not match", () => {
    const filter: FilterConditionRow = { field: "teamId", operator: "in", value: ["30", "40"] };
    expect(evaluateFilter(filter, payload)).toBe(false);
  });

  it("any operator always matches", () => {
    const filter: FilterConditionRow = { field: "teamId", operator: "any", value: null };
    expect(evaluateFilter(filter, payload)).toBe(true);
  });

  it("eq on teamId matches if any teamId matches", () => {
    const filter: FilterConditionRow = { field: "teamId", operator: "eq", value: "20" };
    expect(evaluateFilter(filter, payload)).toBe(true);
  });

  it("source filter matches event source", () => {
    const filter: FilterConditionRow = { field: "source", operator: "eq", value: "sync" };
    expect(evaluateFilter(filter, { ...payload }, "sync")).toBe(true);
  });
});

describe("evaluateRule", () => {
  it("matches when event type and all filters match", () => {
    const rule = {
      eventTypes: ["match.cancelled", "match.venue.changed"],
      filters: [
        { field: "teamId" as const, operator: "eq" as const, value: "10" },
      ],
      channels: [{ channel: "whatsapp_group" as const, targetId: "1" }],
      urgencyOverride: null,
    };

    const result = evaluateRule(rule, "match.cancelled", {
      teamIds: [10, 20],
      leagueId: 5,
    }, "sync");

    expect(result).toEqual({
      matched: true,
      channels: [{ channel: "whatsapp_group", targetId: "1" }],
      urgencyOverride: null,
    });
  });

  it("does not match when event type does not match", () => {
    const rule = {
      eventTypes: ["match.cancelled"],
      filters: [],
      channels: [{ channel: "in_app" as const, targetId: "1" }],
      urgencyOverride: null,
    };

    const result = evaluateRule(rule, "match.created", {}, "sync");
    expect(result.matched).toBe(false);
  });

  it("does not match when a filter fails", () => {
    const rule = {
      eventTypes: ["match.*"],
      filters: [
        { field: "leagueId" as const, operator: "eq" as const, value: "99" },
      ],
      channels: [{ channel: "in_app" as const, targetId: "1" }],
      urgencyOverride: null,
    };

    const result = evaluateRule(rule, "match.cancelled", { leagueId: 5 }, "sync");
    expect(result.matched).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @dragons/api exec -- vitest run src/services/notifications/rule-engine.test.ts
```

- [ ] **Step 3: Write implementation**

```typescript
// apps/api/src/services/notifications/rule-engine.ts
import type { FilterConditionRow, ChannelTargetRow } from "@dragons/db";

/**
 * Check if a rule's event type pattern matches the actual event type.
 * Supports trailing wildcards: "match.*" matches "match.anything.here"
 * and "*" matches everything.
 */
export function matchesEventType(pattern: string, eventType: string): boolean {
  if (pattern === "*") return true;
  if (pattern === eventType) return true;

  // Only support trailing wildcard: "match.*"
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2); // "match"
    return eventType.startsWith(prefix + ".");
  }

  return false;
}

/**
 * Extract the value from the payload for a given filter field.
 * Handles teamId → teamIds[] array, and source from event metadata.
 */
function getFieldValue(
  field: string,
  payload: Record<string, unknown>,
  source?: string,
): unknown {
  switch (field) {
    case "teamId":
      return payload.teamIds; // array
    case "leagueId":
      return payload.leagueId;
    case "venueId":
      return payload.venueId ?? payload.oldVenueId ?? payload.newVenueId;
    case "source":
      return source;
    default:
      return payload[field];
  }
}

/**
 * Evaluate a single filter condition against the event payload.
 */
export function evaluateFilter(
  filter: FilterConditionRow,
  payload: Record<string, unknown>,
  source?: string,
): boolean {
  if (filter.operator === "any") return true;

  const fieldValue = getFieldValue(filter.field, payload, source);

  // For array fields (teamIds), check if any element matches
  if (Array.isArray(fieldValue)) {
    const values = fieldValue.map(String);

    switch (filter.operator) {
      case "eq":
        return values.includes(String(filter.value));
      case "neq":
        return !values.includes(String(filter.value));
      case "in": {
        const filterValues = Array.isArray(filter.value)
          ? filter.value.map(String)
          : [String(filter.value)];
        return values.some((v) => filterValues.includes(v));
      }
      default:
        return false;
    }
  }

  // Scalar field
  const strValue = String(fieldValue);

  switch (filter.operator) {
    case "eq":
      return strValue === String(filter.value);
    case "neq":
      return strValue !== String(filter.value);
    case "in": {
      const filterValues = Array.isArray(filter.value)
        ? filter.value.map(String)
        : [String(filter.value)];
      return filterValues.includes(strValue);
    }
    default:
      return false;
  }
}

interface RuleInput {
  eventTypes: string[];
  filters: FilterConditionRow[];
  channels: ChannelTargetRow[];
  urgencyOverride: string | null;
}

interface RuleResult {
  matched: boolean;
  channels: ChannelTargetRow[];
  urgencyOverride: string | null;
}

/**
 * Evaluate a single watch rule against an event.
 */
export function evaluateRule(
  rule: RuleInput,
  eventType: string,
  payload: Record<string, unknown>,
  source: string,
): RuleResult {
  // Check if any event type pattern matches
  const typeMatches = rule.eventTypes.some((pattern) =>
    matchesEventType(pattern, eventType),
  );

  if (!typeMatches) {
    return { matched: false, channels: [], urgencyOverride: null };
  }

  // Check all filters (AND logic)
  const filtersMatch = rule.filters.every((filter) =>
    evaluateFilter(filter, payload, source),
  );

  if (!filtersMatch) {
    return { matched: false, channels: [], urgencyOverride: null };
  }

  return {
    matched: true,
    channels: rule.channels,
    urgencyOverride: rule.urgencyOverride,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @dragons/api exec -- vitest run src/services/notifications/rule-engine.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/notifications/rule-engine.ts apps/api/src/services/notifications/rule-engine.test.ts
git commit -m "feat(api): add watch rule engine with wildcard matching"
```

---

### Task 15: Create role-based defaults

**Files:**
- Create: `apps/api/src/services/notifications/role-defaults.ts`
- Test: `apps/api/src/services/notifications/role-defaults.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/api/src/services/notifications/role-defaults.test.ts
import { describe, expect, it } from "vitest";
import { getDefaultNotificationsForEvent } from "./role-defaults";
import { EVENT_TYPES } from "@dragons/shared";

describe("getDefaultNotificationsForEvent", () => {
  it("returns admin in-app notification for match.cancelled", () => {
    const result = getDefaultNotificationsForEvent(
      EVENT_TYPES.MATCH_CANCELLED,
      { matchId: 42, teamIds: [10], leagueId: 5 },
      "sync",
    );

    expect(result).toContainEqual(
      expect.objectContaining({
        audience: "admin",
        channel: "in_app",
      }),
    );
  });

  it("returns referee notification for referee.assigned", () => {
    const result = getDefaultNotificationsForEvent(
      EVENT_TYPES.REFEREE_ASSIGNED,
      { matchId: 42, teamIds: [10], refereeId: 7, refereeName: "Max", slotNumber: 1, roleId: null },
      "sync",
    );

    expect(result).toContainEqual(
      expect.objectContaining({
        audience: "referee",
        channel: "in_app",
        refereeId: 7,
      }),
    );
  });

  it("returns admin notification for booking events", () => {
    const result = getDefaultNotificationsForEvent(
      EVENT_TYPES.BOOKING_CREATED,
      { bookingId: 1, venueId: 2, venueName: "Halle", matchIds: [], startTime: "", endTime: "" },
      "sync",
    );

    expect(result.some((r) => r.audience === "admin")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @dragons/api exec -- vitest run src/services/notifications/role-defaults.test.ts
```

- [ ] **Step 3: Write implementation**

```typescript
// apps/api/src/services/notifications/role-defaults.ts
import { EVENT_TYPES } from "@dragons/shared";

export interface DefaultNotification {
  audience: "admin" | "referee";
  channel: "in_app";
  /** For referee audience: the specific refereeId to notify */
  refereeId?: number;
}

const ADMIN_EVENT_PREFIXES = ["match.", "booking.", "override.", "referee."];
const REFEREE_EVENT_TYPES = new Set([
  EVENT_TYPES.REFEREE_ASSIGNED,
  EVENT_TYPES.REFEREE_UNASSIGNED,
  EVENT_TYPES.REFEREE_REASSIGNED,
]);
const REFEREE_MATCH_EVENTS = new Set([
  EVENT_TYPES.MATCH_CANCELLED,
]);

export function getDefaultNotificationsForEvent(
  eventType: string,
  payload: Record<string, unknown>,
  _source: string,
): DefaultNotification[] {
  const result: DefaultNotification[] = [];

  // Admin gets everything that starts with known prefixes
  if (ADMIN_EVENT_PREFIXES.some((prefix) => eventType.startsWith(prefix))) {
    result.push({ audience: "admin", channel: "in_app" });
  }

  // Referee gets their own assignment changes
  if (REFEREE_EVENT_TYPES.has(eventType as typeof EVENT_TYPES[keyof typeof EVENT_TYPES])) {
    const refereeId = payload.refereeId as number | undefined;
    const newRefereeId = payload.newRefereeId as number | undefined;
    const oldRefereeId = payload.oldRefereeId as number | undefined;

    if (refereeId) {
      result.push({ audience: "referee", channel: "in_app", refereeId });
    }
    // For reassignment, notify both old and new referee
    if (newRefereeId && newRefereeId !== refereeId) {
      result.push({ audience: "referee", channel: "in_app", refereeId: newRefereeId });
    }
    if (oldRefereeId && oldRefereeId !== refereeId) {
      result.push({ audience: "referee", channel: "in_app", refereeId: oldRefereeId });
    }
  }

  // Referee gets cancellation for their assigned matches
  // (requires checking assignments at notification delivery time, not here)
  // This is handled by the event worker, not the defaults function

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @dragons/api exec -- vitest run src/services/notifications/role-defaults.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/notifications/role-defaults.ts apps/api/src/services/notifications/role-defaults.test.ts
git commit -m "feat(api): add role-based notification defaults"
```

---

## Chunk 4: Message Templates & In-App Channel

### Task 16: Create message template functions

**Files:**
- Create: `apps/api/src/services/notifications/templates/match.ts`
- Create: `apps/api/src/services/notifications/templates/referee.ts`
- Create: `apps/api/src/services/notifications/templates/booking.ts`
- Create: `apps/api/src/services/notifications/templates/override.ts`
- Create: `apps/api/src/services/notifications/templates/digest.ts`
- Create: `apps/api/src/services/notifications/templates/index.ts`
- Test: `apps/api/src/services/notifications/templates/match.test.ts`

- [ ] **Step 1: Write failing tests for match templates**

```typescript
// apps/api/src/services/notifications/templates/match.test.ts
import { describe, expect, it } from "vitest";
import { renderMatchEvent } from "./match";
import { EVENT_TYPES } from "@dragons/shared";

describe("renderMatchEvent", () => {
  it("renders match.schedule.changed in German", () => {
    const result = renderMatchEvent(EVENT_TYPES.MATCH_SCHEDULE_CHANGED, {
      matchId: 42,
      teamIds: [1, 2],
      leagueId: 5,
      oldDate: "2026-03-20",
      newDate: "2026-03-22",
      oldTime: "16:00",
      newTime: "14:00",
    }, "U16 Dragons vs. TSV Giessen", "de");

    expect(result.title).toContain("Spielverlegung");
    expect(result.title).toContain("U16 Dragons vs. TSV Giessen");
    expect(result.body).toContain("22.03.");
    expect(result.body).toContain("14:00");
  });

  it("renders match.schedule.changed in English", () => {
    const result = renderMatchEvent(EVENT_TYPES.MATCH_SCHEDULE_CHANGED, {
      matchId: 42,
      teamIds: [1, 2],
      leagueId: 5,
      oldDate: "2026-03-20",
      newDate: "2026-03-22",
      oldTime: "16:00",
      newTime: "14:00",
    }, "U16 Dragons vs. TSV Giessen", "en");

    expect(result.title).toContain("Schedule change");
    expect(result.body).toContain("14:00");
  });

  it("renders match.cancelled in German", () => {
    const result = renderMatchEvent(EVENT_TYPES.MATCH_CANCELLED, {
      matchId: 42,
      teamIds: [1, 2],
      leagueId: 5,
      reason: "Hallensperre",
    }, "U16 Dragons vs. TSV Giessen", "de");

    expect(result.title).toContain("Spielabsage");
    expect(result.body).toContain("Hallensperre");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @dragons/api exec -- vitest run src/services/notifications/templates/match.test.ts
```

- [ ] **Step 3: Write match template implementation**

```typescript
// apps/api/src/services/notifications/templates/match.ts
import { EVENT_TYPES } from "@dragons/shared";

export interface RenderedMessage {
  title: string;
  body: string;
}

function formatDate(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  if (locale === "de") {
    return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.`;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function renderMatchEvent(
  eventType: string,
  payload: Record<string, unknown>,
  entityName: string,
  locale: string,
): RenderedMessage {
  const de = locale === "de";

  switch (eventType) {
    case EVENT_TYPES.MATCH_SCHEDULE_CHANGED: {
      const newDate = formatDate(payload.newDate as string, locale);
      const newTime = payload.newTime as string;
      const oldTime = payload.oldTime as string | null;
      return {
        title: de
          ? `🏀 Spielverlegung: ${entityName}`
          : `🏀 Schedule change: ${entityName}`,
        body: de
          ? `Neuer Termin: ${newDate} um ${newTime} Uhr${oldTime ? ` (vorher: ${oldTime} Uhr)` : ""}`
          : `New schedule: ${newDate} at ${newTime}${oldTime ? ` (was: ${oldTime})` : ""}`,
      };
    }

    case EVENT_TYPES.MATCH_VENUE_CHANGED: {
      const newVenue = payload.newVenueName as string;
      const oldVenue = payload.oldVenueName as string | null;
      return {
        title: de
          ? `🏟️ Hallenänderung: ${entityName}`
          : `🏟️ Venue change: ${entityName}`,
        body: de
          ? `Neue Halle: ${newVenue}${oldVenue ? ` (vorher: ${oldVenue})` : ""}`
          : `New venue: ${newVenue}${oldVenue ? ` (was: ${oldVenue})` : ""}`,
      };
    }

    case EVENT_TYPES.MATCH_CANCELLED: {
      const reason = payload.reason as string | null;
      return {
        title: de
          ? `⚡ Spielabsage: ${entityName}`
          : `⚡ Game cancelled: ${entityName}`,
        body: de
          ? `Spiel wurde abgesagt${reason ? `: ${reason}` : ""}`
          : `Game has been cancelled${reason ? `: ${reason}` : ""}`,
      };
    }

    case EVENT_TYPES.MATCH_FORFEITED: {
      return {
        title: de
          ? `⚡ Spielwertung: ${entityName}`
          : `⚡ Game forfeited: ${entityName}`,
        body: de
          ? "Spiel wurde gewertet"
          : "Game has been forfeited",
      };
    }

    case EVENT_TYPES.MATCH_CREATED: {
      const kickoffDate = payload.kickoffDate
        ? formatDate(payload.kickoffDate as string, locale)
        : "";
      const kickoffTime = payload.kickoffTime as string | null;
      return {
        title: de
          ? `🆕 Neues Spiel: ${entityName}`
          : `🆕 New game: ${entityName}`,
        body: de
          ? `${kickoffDate}${kickoffTime ? ` um ${kickoffTime} Uhr` : ""}`
          : `${kickoffDate}${kickoffTime ? ` at ${kickoffTime}` : ""}`,
      };
    }

    case EVENT_TYPES.MATCH_SCORE_CHANGED: {
      const newScores = payload.newScores as { home: number | null; guest: number | null };
      return {
        title: de
          ? `📊 Ergebnis: ${entityName}`
          : `📊 Score update: ${entityName}`,
        body: `${newScores.home ?? "?"} : ${newScores.guest ?? "?"}`,
      };
    }

    case EVENT_TYPES.MATCH_REMOVED: {
      return {
        title: de
          ? `❌ Spiel entfernt: ${entityName}`
          : `❌ Game removed: ${entityName}`,
        body: de
          ? "Spiel wurde aus dem Spielplan entfernt"
          : "Game has been removed from the schedule",
      };
    }

    default:
      return {
        title: entityName,
        body: eventType,
      };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @dragons/api exec -- vitest run src/services/notifications/templates/match.test.ts
```

Expected: PASS

- [ ] **Step 5: Write referee, booking, override templates (similar pattern)**

```typescript
// apps/api/src/services/notifications/templates/referee.ts
import { EVENT_TYPES } from "@dragons/shared";
import type { RenderedMessage } from "./match";

export function renderRefereeEvent(
  eventType: string,
  payload: Record<string, unknown>,
  entityName: string,
  locale: string,
): RenderedMessage {
  const de = locale === "de";
  const refereeName = (payload.refereeName ?? payload.newRefereeName) as string;

  switch (eventType) {
    case EVENT_TYPES.REFEREE_ASSIGNED:
      return {
        title: de ? `👤 Neuer SR: ${entityName}` : `👤 Referee assigned: ${entityName}`,
        body: de ? `${refereeName} als SR${payload.slotNumber}` : `${refereeName} as referee ${payload.slotNumber}`,
      };
    case EVENT_TYPES.REFEREE_UNASSIGNED:
      return {
        title: de ? `👤 SR entfernt: ${entityName}` : `👤 Referee removed: ${entityName}`,
        body: de ? `${refereeName} wurde entfernt` : `${refereeName} has been removed`,
      };
    case EVENT_TYPES.REFEREE_REASSIGNED: {
      const oldName = payload.oldRefereeName as string;
      const newName = payload.newRefereeName as string;
      return {
        title: de ? `👤 SR-Wechsel: ${entityName}` : `👤 Referee change: ${entityName}`,
        body: de ? `${oldName} → ${newName}` : `${oldName} → ${newName}`,
      };
    }
    default:
      return { title: entityName, body: eventType };
  }
}
```

```typescript
// apps/api/src/services/notifications/templates/booking.ts
import { EVENT_TYPES } from "@dragons/shared";
import type { RenderedMessage } from "./match";

export function renderBookingEvent(
  eventType: string,
  payload: Record<string, unknown>,
  entityName: string,
  locale: string,
): RenderedMessage {
  const de = locale === "de";
  const venueName = payload.venueName as string;

  switch (eventType) {
    case EVENT_TYPES.BOOKING_CREATED:
      return {
        title: de ? `🏟️ Neue Buchung: ${venueName}` : `🏟️ New booking: ${venueName}`,
        body: `${payload.startTime} – ${payload.endTime}`,
      };
    case EVENT_TYPES.BOOKING_STATUS_CHANGED:
      return {
        title: de ? `🏟️ Buchungsstatus: ${venueName}` : `🏟️ Booking status: ${venueName}`,
        body: de ? `${payload.oldStatus} → ${payload.newStatus}` : `${payload.oldStatus} → ${payload.newStatus}`,
      };
    case EVENT_TYPES.BOOKING_NEEDS_RECONFIRMATION:
      return {
        title: de ? `⚠️ Buchung prüfen: ${venueName}` : `⚠️ Booking needs action: ${venueName}`,
        body: de ? `Grund: ${payload.reason}` : `Reason: ${payload.reason}`,
      };
    default:
      return { title: entityName, body: eventType };
  }
}
```

```typescript
// apps/api/src/services/notifications/templates/override.ts
import { EVENT_TYPES } from "@dragons/shared";
import type { RenderedMessage } from "./match";

export function renderOverrideEvent(
  eventType: string,
  payload: Record<string, unknown>,
  entityName: string,
  locale: string,
): RenderedMessage {
  const de = locale === "de";
  const fieldName = payload.fieldName as string;

  switch (eventType) {
    case EVENT_TYPES.OVERRIDE_CONFLICT:
      return {
        title: de ? `⚠️ Überschreibungskonflikt: ${entityName}` : `⚠️ Override conflict: ${entityName}`,
        body: de
          ? `Feld "${fieldName}": Lokaler Wert weicht vom neuen Remote-Wert ab`
          : `Field "${fieldName}": local value differs from new remote value`,
      };
    case EVENT_TYPES.OVERRIDE_APPLIED:
      return {
        title: de ? `✏️ Überschreibung: ${entityName}` : `✏️ Override applied: ${entityName}`,
        body: `${fieldName}: ${payload.oldValue ?? "–"} → ${payload.newValue ?? "–"}`,
      };
    default:
      return { title: entityName, body: eventType };
  }
}
```

- [ ] **Step 6: Write template index/registry**

```typescript
// apps/api/src/services/notifications/templates/index.ts
import { renderMatchEvent, type RenderedMessage } from "./match";
import { renderRefereeEvent } from "./referee";
import { renderBookingEvent } from "./booking";
import { renderOverrideEvent } from "./override";

export type { RenderedMessage } from "./match";

export function renderEventMessage(
  eventType: string,
  payload: Record<string, unknown>,
  entityName: string,
  locale: string,
): RenderedMessage {
  if (eventType.startsWith("match.")) {
    return renderMatchEvent(eventType, payload, entityName, locale);
  }
  if (eventType.startsWith("referee.")) {
    return renderRefereeEvent(eventType, payload, entityName, locale);
  }
  if (eventType.startsWith("booking.")) {
    return renderBookingEvent(eventType, payload, entityName, locale);
  }
  if (eventType.startsWith("override.")) {
    return renderOverrideEvent(eventType, payload, entityName, locale);
  }

  // Fallback
  return { title: entityName, body: eventType };
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/notifications/templates/
git commit -m "feat(api): add locale-aware message templates for all event types"
```

---

### Task 17: Create in-app channel adapter

**Files:**
- Create: `apps/api/src/services/notifications/channels/types.ts`
- Create: `apps/api/src/services/notifications/channels/in-app.ts`
- Test: `apps/api/src/services/notifications/channels/in-app.test.ts`

- [ ] **Step 1: Write channel adapter interface**

```typescript
// apps/api/src/services/notifications/channels/types.ts
import type { RenderedMessage } from "../templates";

export interface DeliveryResult {
  success: boolean;
  error?: string;
}

export interface ChannelAdapter {
  send(params: {
    eventId: string;
    channelConfigId: number;
    recipientId: string | null;
    message: RenderedMessage;
    deepLinkPath: string;
    locale: string;
  }): Promise<DeliveryResult>;
}
```

- [ ] **Step 2: Write failing tests**

```typescript
// apps/api/src/services/notifications/channels/in-app.test.ts
import { describe, expect, it } from "vitest";
import { InAppChannelAdapter } from "./in-app";

describe("InAppChannelAdapter", () => {
  it("is a class implementing ChannelAdapter", () => {
    const adapter = new InAppChannelAdapter();
    expect(typeof adapter.send).toBe("function");
  });
});
```

- [ ] **Step 3: Write implementation**

```typescript
// apps/api/src/services/notifications/channels/in-app.ts
import { db } from "../../../config/database";
import { notificationLog } from "@dragons/db/schema";
import type { ChannelAdapter, DeliveryResult } from "./types";
import type { RenderedMessage } from "../templates";
import { logger } from "../../../config/logger";

const log = logger.child({ service: "in-app-channel" });

export class InAppChannelAdapter implements ChannelAdapter {
  async send(params: {
    eventId: string;
    channelConfigId: number;
    recipientId: string | null;
    message: RenderedMessage;
    deepLinkPath: string;
    locale: string;
    watchRuleId?: number | null;
    digestRunId?: number | null;
  }): Promise<DeliveryResult> {
    try {
      await db.insert(notificationLog).values({
        eventId: params.eventId,
        channelConfigId: params.channelConfigId,
        watchRuleId: params.watchRuleId ?? null,
        recipientId: params.recipientId,
        title: params.message.title,
        body: params.message.body,
        locale: params.locale,
        status: "sent",
        sentAt: new Date(),
      }).onConflictDoNothing(); // dedup constraint

      log.debug({
        eventId: params.eventId,
        recipientId: params.recipientId,
      }, "in-app notification sent");

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      log.error({ error, eventId: params.eventId }, "in-app notification failed");
      return { success: false, error: message };
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @dragons/api exec -- vitest run src/services/notifications/channels/in-app.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/notifications/channels/
git commit -m "feat(api): add channel adapter interface and in-app adapter"
```

---

## Chunk 5: Event Worker & Wiring

### Task 18: Create event worker

**Files:**
- Create: `apps/api/src/workers/event.worker.ts`
- Modify: `apps/api/src/workers/index.ts`

- [ ] **Step 1: Write event worker**

```typescript
// apps/api/src/workers/event.worker.ts
import { Worker, type Job } from "bullmq";
import { env } from "../config/env";
import { db } from "../config/database";
import { watchRules, channelConfigs, digestBuffer } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { evaluateRule } from "../services/notifications/rule-engine";
import { getDefaultNotificationsForEvent } from "../services/notifications/role-defaults";
import { renderEventMessage } from "../services/notifications/templates";
import { InAppChannelAdapter } from "../services/notifications/channels/in-app";
import { logger } from "../config/logger";
import type { BuiltDomainEvent } from "../services/events/event-publisher";

const log = logger.child({ service: "event-worker" });
const inAppAdapter = new InAppChannelAdapter();

async function processEvent(job: Job<BuiltDomainEvent>): Promise<void> {
  const event = job.data;
  log.info({ eventId: event.id, type: event.type }, "processing domain event");

  // 1. Load all enabled watch rules
  const rules = await db
    .select()
    .from(watchRules)
    .where(eq(watchRules.enabled, true));

  // 2. Evaluate each rule
  const matchedChannels: Map<string, {
    channelConfigId: number;
    urgency: string;
    watchRuleId: number | null;
  }> = new Map();

  for (const rule of rules) {
    const result = evaluateRule(
      {
        eventTypes: rule.eventTypes,
        filters: rule.filters,
        channels: rule.channels,
        urgencyOverride: rule.urgencyOverride,
      },
      event.type,
      event.payload,
      event.source,
    );

    if (result.matched) {
      const urgency = result.urgencyOverride ?? event.urgency;
      for (const ch of result.channels) {
        const key = `${ch.targetId}`;
        if (!matchedChannels.has(key)) {
          matchedChannels.set(key, {
            channelConfigId: Number(ch.targetId),
            urgency,
            watchRuleId: rule.id,
          });
        }
      }
    }
  }

  // 3. Process role-based defaults (in-app)
  const defaults = getDefaultNotificationsForEvent(
    event.type,
    event.payload,
    event.source,
  );

  // 4. Render message
  const message = renderEventMessage(
    event.type,
    event.payload,
    event.entityName,
    "de", // default locale, per-recipient locale handled at delivery
  );

  // 5. Deliver or buffer each matched channel
  for (const [, match] of matchedChannels) {
    const config = await db
      .select()
      .from(channelConfigs)
      .where(eq(channelConfigs.id, match.channelConfigId))
      .then((rows) => rows[0]);

    if (!config || !config.enabled) continue;

    if (match.urgency === "immediate" || config.digestMode === "none") {
      // Immediate delivery
      if (config.type === "in_app") {
        await inAppAdapter.send({
          eventId: event.id,
          channelConfigId: config.id,
          recipientId: null, // resolved by audience
          message,
          deepLinkPath: event.deepLinkPath,
          locale: "de",
          watchRuleId: match.watchRuleId,
        });
      }
      // Other channel adapters will be added here (WhatsApp, push, email)
    }

    // Always buffer for digest if channel has digest mode
    if (config.digestMode !== "none") {
      await db
        .insert(digestBuffer)
        .values({
          eventId: event.id,
          channelConfigId: config.id,
        })
        .onConflictDoNothing();
    }
  }

  // 6. Handle role-based defaults (in-app for admins/referees)
  for (const defaultNotif of defaults) {
    // In-app notifications for role defaults go directly to notification_log
    // The Notification Center reads from domain_events for the browse view,
    // but we still create notification_log entries for delivery tracking
    // This is a simplified version — full implementation resolves user IDs from roles
    log.debug({
      audience: defaultNotif.audience,
      eventId: event.id,
    }, "role default notification queued");
  }

  log.info({ eventId: event.id, matchedRules: matchedChannels.size }, "event processed");
}

export const eventWorker = new Worker<BuiltDomainEvent>(
  "domain-events",
  processEvent,
  {
    prefix: "{bull}",
    connection: { url: env.REDIS_URL },
    concurrency: 5,
  },
);

eventWorker.on("failed", (job, error) => {
  log.error({ jobId: job?.id, error: error.message }, "event worker job failed");
});

eventWorker.on("error", (error) => {
  log.error({ error: error.message }, "event worker error");
});
```

- [ ] **Step 2: Wire up in workers/index.ts**

Add to `apps/api/src/workers/index.ts`:

```typescript
import { eventWorker } from "./event.worker";
import { startOutboxPoller, stopOutboxPoller } from "../services/events/outbox-poller";
```

In `initializeWorkers()`, add:

```typescript
startOutboxPoller();
log.info("event worker and outbox poller initialized");
```

In `shutdownWorkers()`, add:

```typescript
stopOutboxPoller();
await eventWorker.close();
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @dragons/api exec -- tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/workers/event.worker.ts apps/api/src/workers/index.ts
git commit -m "feat(api): add event worker and wire up outbox poller"
```

---

### Task 19: Emit events from sync pipeline (matches)

**Files:**
- Modify: `apps/api/src/services/sync/matches.sync.ts`

This task wires up event emission at the change detection points in the match sync pipeline. The exact insertion points depend on the current code structure — the implementer should:

- [ ] **Step 1: Import event publisher**

At the top of `matches.sync.ts`:

```typescript
import { publishDomainEvent } from "../events/event-publisher";
import { EVENT_TYPES } from "@dragons/shared";
```

- [ ] **Step 2: Emit events after match updates**

After `effectiveChanges` array is computed and changes are recorded (around the match update transaction), add event emission for each detected field change. Map field names to event types:

- `kickoffDate` or `kickoffTime` changes → `EVENT_TYPES.MATCH_SCHEDULE_CHANGED`
- `venueId` changes → `EVENT_TYPES.MATCH_VENUE_CHANGED`
- `isCancelled` set to true → `EVENT_TYPES.MATCH_CANCELLED`
- `isForfeited` set to true → `EVENT_TYPES.MATCH_FORFEITED`
- Score field changes → `EVENT_TYPES.MATCH_SCORE_CHANGED`

Build the payload from the match row and field change data. Use the DB transaction (`tx`) for the `publishDomainEvent` call to ensure atomicity.

- [ ] **Step 3: Emit events for new matches**

After match INSERT, emit `EVENT_TYPES.MATCH_CREATED` with the match details.

- [ ] **Step 4: Emit sync.completed at end of fullSync()**

In `apps/api/src/services/sync/index.ts`, at the end of `fullSync()` after all steps complete:

```typescript
// NOTE: sync.completed uses entityType "match" and entityId 0 as a convention
// since it's a system-level event, not tied to a specific entity.
await publishDomainEvent({
  type: EVENT_TYPES.SYNC_COMPLETED,
  source: "sync",
  entityType: "match",
  entityId: 0,
  entityName: "Sync Run",
  deepLinkPath: `/admin/sync/logs/${syncRun.id}`,
  payload: { syncRunId: syncRun.id, duration: durationMs, summary },
  syncRunId: syncRun.id,
});
```

- [ ] **Step 5: Run existing tests to verify nothing is broken**

```bash
pnpm --filter @dragons/api test
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/sync/matches.sync.ts apps/api/src/services/sync/index.ts
git commit -m "feat(api): emit domain events from match sync pipeline"
```

---

### Task 19b: Emit events from referee sync pipeline

**Files:**
- Modify: `apps/api/src/services/sync/referees.sync.ts`

- [ ] **Step 1: Import event publisher**

At the top of `referees.sync.ts`:

```typescript
import { publishDomainEvent } from "../events/event-publisher";
import { EVENT_TYPES } from "@dragons/shared";
```

- [ ] **Step 2: Emit referee assignment events**

In `syncRefereeAssignmentsFromData()`, after detecting assignment changes (new assignment, removed assignment, or reassignment), emit the appropriate event:

- New referee in a slot → `EVENT_TYPES.REFEREE_ASSIGNED`
- Referee removed from a slot → `EVENT_TYPES.REFEREE_UNASSIGNED`
- Different referee in same slot → `EVENT_TYPES.REFEREE_REASSIGNED`

Build the entity name from the match data (e.g. "U16 Dragons vs. TSV Giessen"). Use the match's deep link path.

- [ ] **Step 3: Run existing tests**

```bash
pnpm --filter @dragons/api test
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/sync/referees.sync.ts
git commit -m "feat(api): emit domain events from referee sync pipeline"
```

---

### Task 20: Emit events from admin services

**Files:**
- Modify: `apps/api/src/services/admin/match-admin.service.ts`
- Modify: `apps/api/src/services/admin/booking-admin.service.ts`
- Modify: `apps/api/src/services/venue-booking/venue-booking.service.ts`

- [ ] **Step 1: Add event emission to match-admin updateMatchLocal()**

Import `publishDomainEvent` and `EVENT_TYPES`. After the `fieldChanges` array is built and before the transaction commits, emit the appropriate events based on which fields changed:

```typescript
// Inside the transaction, after fieldChanges are computed
for (const change of fieldChanges) {
  if (change.field === "kickoffDate" || change.field === "kickoffTime") {
    await publishDomainEvent({
      type: EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
      source: "manual",
      actor: changedBy,
      entityType: "match",
      entityId: id,
      entityName: `${match.homeTeamName} vs. ${match.guestTeamName}`,
      deepLinkPath: `/admin/matches/${id}`,
      payload: { /* build from match and change */ },
    }, tx);
  }
  // Similar for venue, cancellation, score changes
}
```

- [ ] **Step 2: Add event emission to booking-admin mutations**

In `booking-admin.service.ts`, add event emission in `createBooking()`, `updateBookingStatus()`, and `deleteBooking()`.

- [ ] **Step 3: Add event emission to venue-booking reconciliation**

In `venue-booking.service.ts`, inside `reconcileAfterSync()`, emit `BOOKING_NEEDS_RECONFIRMATION` when a booking's `needsReconfirmation` flag is set.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @dragons/api test
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/admin/match-admin.service.ts apps/api/src/services/admin/booking-admin.service.ts apps/api/src/services/venue-booking/venue-booking.service.ts
git commit -m "feat(api): emit domain events from admin services and reconciliation"
```

---

## Chunk 6: Admin APIs

### Task 21: Create Notification Center API (domain event listing)

**Files:**
- Create: `apps/api/src/services/admin/event-admin.service.ts`
- Create: `apps/api/src/routes/admin/event.routes.ts`
- Test: `apps/api/src/services/admin/event-admin.service.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing test for event listing service**

```typescript
// apps/api/src/services/admin/event-admin.service.test.ts
import { describe, expect, it } from "vitest";
import { listDomainEvents } from "./event-admin.service";

describe("listDomainEvents", () => {
  it("is a function", () => {
    expect(typeof listDomainEvents).toBe("function");
  });
});
```

- [ ] **Step 2: Write event admin service**

```typescript
// apps/api/src/services/admin/event-admin.service.ts
import { db } from "../../config/database";
import { domainEvents } from "@dragons/db/schema";
import { desc, eq, and, gte, lte, like, sql, count } from "drizzle-orm";
import type { DomainEventListResult } from "@dragons/shared";

interface ListParams {
  page?: number;
  limit?: number;
  type?: string;
  entityType?: string;
  source?: string;
  from?: string;
  to?: string;
  search?: string;
}

export async function listDomainEvents(params: ListParams): Promise<DomainEventListResult> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [];

  if (params.type) {
    conditions.push(like(domainEvents.type, `${params.type}%`));
  }
  if (params.entityType) {
    conditions.push(eq(domainEvents.entityType, params.entityType));
  }
  if (params.source) {
    conditions.push(eq(domainEvents.source, params.source));
  }
  if (params.from) {
    conditions.push(gte(domainEvents.occurredAt, new Date(params.from)));
  }
  if (params.to) {
    conditions.push(lte(domainEvents.occurredAt, new Date(params.to)));
  }
  if (params.search) {
    conditions.push(like(domainEvents.entityName, `%${params.search}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [events, totalResult] = await Promise.all([
    db
      .select()
      .from(domainEvents)
      .where(where)
      .orderBy(desc(domainEvents.occurredAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(domainEvents)
      .where(where),
  ]);

  return {
    events: events.map((e) => ({
      ...e,
      occurredAt: e.occurredAt.toISOString(),
      createdAt: e.createdAt.toISOString(),
      payload: e.payload as Record<string, unknown>,
    })),
    total: totalResult[0].count,
  };
}
```

- [ ] **Step 3: Write routes**

```typescript
// apps/api/src/routes/admin/event.routes.ts
import { Hono } from "hono";
import { listDomainEvents } from "../../services/admin/event-admin.service";

const eventRoutes = new Hono();

eventRoutes.get("/events", async (c) => {
  const query = c.req.query();
  const result = await listDomainEvents({
    page: query.page ? Number(query.page) : undefined,
    limit: query.limit ? Number(query.limit) : undefined,
    type: query.type || undefined,
    entityType: query.entityType || undefined,
    source: query.source || undefined,
    from: query.from || undefined,
    to: query.to || undefined,
    search: query.search || undefined,
  });
  return c.json(result);
});

export { eventRoutes };
```

- [ ] **Step 4: Mount routes**

In `apps/api/src/routes/index.ts`, add:

```typescript
import { eventRoutes } from "./admin/event.routes";
// Mount alongside other admin routes
routes.route("/admin", eventRoutes);
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @dragons/api test
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/admin/event-admin.service.ts apps/api/src/services/admin/event-admin.service.test.ts apps/api/src/routes/admin/event.routes.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add Notification Center API for domain event listing"
```

---

### Task 22: Create watch rule CRUD API

**Files:**
- Create: `apps/api/src/services/admin/watch-rule-admin.service.ts`
- Create: `apps/api/src/routes/admin/watch-rule.routes.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write watch rule admin service**

Implement `listWatchRules()`, `getWatchRule(id)`, `createWatchRule(data, userId)`, `updateWatchRule(id, data)`, `deleteWatchRule(id)` following the same pattern as existing admin services.

- [ ] **Step 2: Write routes**

CRUD routes at `/admin/watch-rules`:
- `GET /` — list with pagination
- `GET /:id` — get by ID
- `POST /` — create
- `PATCH /:id` — update
- `DELETE /:id` — delete

- [ ] **Step 3: Mount routes in index**

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @dragons/api test
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/admin/watch-rule-admin.service.ts apps/api/src/routes/admin/watch-rule.routes.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add watch rule CRUD API"
```

---

### Task 23: Create channel config CRUD API

**Files:**
- Create: `apps/api/src/services/admin/channel-config-admin.service.ts`
- Create: `apps/api/src/routes/admin/channel-config.routes.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write channel config admin service**

Implement `listChannelConfigs()`, `getChannelConfig(id)`, `createChannelConfig(data)`, `updateChannelConfig(id, data)`, `deleteChannelConfig(id)`.

- [ ] **Step 2: Write routes**

CRUD routes at `/admin/channel-configs`:
- `GET /` — list
- `GET /:id` — get by ID
- `POST /` — create
- `PATCH /:id` — update
- `DELETE /:id` — delete

- [ ] **Step 3: Mount and commit**

```bash
git add apps/api/src/services/admin/channel-config-admin.service.ts apps/api/src/routes/admin/channel-config.routes.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add channel config CRUD API"
```

---

## Chunk 7: Digest Worker

### Task 24: Create digest worker

**Files:**
- Create: `apps/api/src/workers/digest.worker.ts`
- Create: `apps/api/src/services/notifications/templates/digest.ts`
- Modify: `apps/api/src/workers/index.ts`

- [ ] **Step 1: Write digest template**

```typescript
// apps/api/src/services/notifications/templates/digest.ts
import type { RenderedMessage } from "./match";
import { renderEventMessage } from "./index";

interface DigestItem {
  eventType: string;
  payload: Record<string, unknown>;
  entityName: string;
  deepLinkPath: string;
  urgency: string;
  occurredAt: string;
}

export function renderDigest(
  items: DigestItem[],
  locale: string,
  baseUrl: string,
  digestRunId: number,
): RenderedMessage {
  const de = locale === "de";
  const title = de
    ? `📋 Zusammenfassung — ${items.length} Änderungen`
    : `📋 Digest — ${items.length} changes`;

  const lines = items.map((item) => {
    const msg = renderEventMessage(item.eventType, item.payload, item.entityName, locale);
    const wasImmediate = item.urgency === "immediate";
    const suffix = wasImmediate
      ? (de ? " (bereits gemeldet)" : " (already sent)")
      : "";
    return `${msg.title}${suffix}\n  → ${baseUrl}${item.deepLinkPath}`;
  });

  const footer = de
    ? `\nAlle Details: ${baseUrl}/admin/notifications?digest=run-${digestRunId}`
    : `\nFull details: ${baseUrl}/admin/notifications?digest=run-${digestRunId}`;

  return {
    title,
    body: lines.join("\n\n") + footer,
  };
}
```

- [ ] **Step 2: Write digest worker**

```typescript
// apps/api/src/workers/digest.worker.ts
import { Worker, type Job } from "bullmq";
import { env } from "../config/env";
import { db } from "../config/database";
import { digestBuffer, domainEvents, channelConfigs } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import { renderDigest } from "../services/notifications/templates/digest";
import { InAppChannelAdapter } from "../services/notifications/channels/in-app";
import { logger } from "../config/logger";

const log = logger.child({ service: "digest-worker" });
const inAppAdapter = new InAppChannelAdapter();

interface DigestJobData {
  channelConfigId: number;
  digestRunId: number;
}

async function processDigest(job: Job<DigestJobData>): Promise<void> {
  const { channelConfigId, digestRunId } = job.data;

  // Load channel config
  const config = await db
    .select()
    .from(channelConfigs)
    .where(eq(channelConfigs.id, channelConfigId))
    .then((rows) => rows[0]);

  if (!config || !config.enabled) {
    log.info({ channelConfigId }, "channel disabled, skipping digest");
    return;
  }

  // Load buffered events for this channel
  const buffered = await db
    .select({
      eventId: digestBuffer.eventId,
      type: domainEvents.type,
      payload: domainEvents.payload,
      entityName: domainEvents.entityName,
      deepLinkPath: domainEvents.deepLinkPath,
      urgency: domainEvents.urgency,
      occurredAt: domainEvents.occurredAt,
    })
    .from(digestBuffer)
    .innerJoin(domainEvents, eq(digestBuffer.eventId, domainEvents.id))
    .where(eq(digestBuffer.channelConfigId, channelConfigId))
    .orderBy(domainEvents.occurredAt);

  if (buffered.length === 0) {
    log.debug({ channelConfigId }, "no buffered events, skipping digest");
    return;
  }

  const locale = (config.config as Record<string, unknown>).locale as string ?? "de";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const message = renderDigest(
    buffered.map((b) => ({
      eventType: b.type,
      payload: b.payload as Record<string, unknown>,
      entityName: b.entityName,
      deepLinkPath: b.deepLinkPath,
      urgency: b.urgency,
      occurredAt: b.occurredAt.toISOString(),
    })),
    locale,
    baseUrl,
    digestRunId,
  );

  // Deliver via channel adapter
  if (config.type === "in_app") {
    for (const item of buffered) {
      await inAppAdapter.send({
        eventId: item.eventId,
        channelConfigId: config.id,
        recipientId: null,
        message,
        deepLinkPath: item.deepLinkPath,
        locale,
        digestRunId,
      });
    }
  }
  // Other adapters (WhatsApp, email, push) send one digest message

  // Clear buffer for this channel
  await db
    .delete(digestBuffer)
    .where(eq(digestBuffer.channelConfigId, channelConfigId));

  log.info({
    channelConfigId,
    eventCount: buffered.length,
    digestRunId,
  }, "digest sent");
}

export const digestWorker = new Worker<DigestJobData>(
  "digest",
  processDigest,
  {
    prefix: "{bull}",
    connection: { url: env.REDIS_URL },
    concurrency: 3,
  },
);

digestWorker.on("failed", (job, error) => {
  log.error({ jobId: job?.id, error: error.message }, "digest worker job failed");
});
```

- [ ] **Step 3: Wire up digest worker in workers/index.ts**

Import and close in shutdown:

```typescript
import { digestWorker } from "./digest.worker";
// In shutdownWorkers():
await digestWorker.close();
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @dragons/api test
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/digest.worker.ts apps/api/src/services/notifications/templates/digest.ts apps/api/src/workers/index.ts
git commit -m "feat(api): add digest worker and digest template renderer"
```

---

## Chunk 8: Event Cleanup & Integration Testing

### Task 25: Add domain event retention cleanup

**Files:**
- Modify: `apps/api/src/workers/index.ts`

- [ ] **Step 1: Add cleanup function**

Follow the existing `cleanupOldSyncRuns` pattern. Add `cleanupOldDomainEvents(retentionDays: number)` that deletes `domain_events` rows older than the retention period. Also deletes associated `notification_log`, `digest_buffer` rows via CASCADE or explicit delete.

- [ ] **Step 2: Schedule cleanup in initializeWorkers()**

Add to the initialization:

```typescript
await cleanupOldDomainEvents(365); // 1 year retention
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/workers/index.ts
git commit -m "feat(api): add domain event retention cleanup (1 year)"
```

---

### Task 26: Full typecheck, lint, and test pass

- [ ] **Step 1: Run typecheck**

```bash
pnpm typecheck
```

Fix any type errors.

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Fix any lint errors.

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Fix any test failures.

- [ ] **Step 4: Run AI slop check**

```bash
pnpm check:ai-slop
```

Fix any banned phrases.

- [ ] **Step 5: Commit fixes if needed**

```bash
git add -A
git commit -m "fix: resolve type errors, lint issues, and test failures"
```

---

## Summary

**Tasks 1-9 (Chunk 1):** Database schema for all 5 new tables + shared types. Foundation that everything else builds on.

**Tasks 10-13 (Chunk 2):** Event publisher with transactional outbox pattern, urgency classification, BullMQ queues, outbox poller.

**Tasks 14-15 (Chunk 3):** Rule engine with wildcard matching, filter evaluation, role-based defaults.

**Tasks 16-17 (Chunk 4):** Locale-aware message templates for all event types, in-app channel adapter with delivery tracking.

**Tasks 18-20 (Chunk 5):** Event worker that processes events through rules, event emission wired into sync pipeline and admin services.

**Tasks 21-23 (Chunk 6):** Admin APIs for Notification Center (event listing), watch rule CRUD, channel config CRUD.

**Task 24 (Chunk 7):** Digest worker that flushes buffered events into digest messages per channel.

**Tasks 25-26 (Chunk 8):** Retention cleanup and full integration verification.

**Not in this plan (future work):**
- WhatsApp Business API channel adapter
- Push notification channel adapter
- Email channel adapter
- Notification Center mark-read and manual retry endpoints
- Unread tracking per user for in-app notifications
- Per-channel rate limiting with overflow-to-digest
- Admin UI (Notification Center page, rule builder, channel config management)
- Phase 2 roles (venue_manager, team_contact)
