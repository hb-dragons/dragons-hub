# Board Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit domain events for task assign/unassign/comment/due-reminder actions so users get in-app + push notifications about tasks they own, with per-event opt-out via the existing `mutedEventTypes` array.

**Architecture:** Four new `task.*` event types flow through the existing domain-event pipeline (outbox → BullMQ → `processEvent` → channel adapters). A new 15-min cron worker sweeps for due-date reminders. Recipients use the pre-existing `user:<id>` convention already supported by `recipient-resolver.ts`. Legacy unused bool preference columns are dropped in the same migration that adds two reminder-dedupe timestamp columns to `tasks`.

**Tech Stack:** TypeScript 6.0, Hono 4.12, Drizzle ORM 0.45, BullMQ 5.70, Redis 7, PostgreSQL 17, Zod 4.3, Vitest 4 (with PGlite), Next.js 16, next-intl 4.9, React 19, SWR 2.4.

---

## Reference: files in scope

**Shared types:**
- `packages/shared/src/domain-events.ts` — add `"task"` to `EventEntityType`, add 4 event type constants, add 4 payload interfaces, extend `DomainEventPayload` union
- `packages/shared/src/notification-events.ts` (new) — user-toggleable event catalog
- `packages/shared/src/index.ts` — re-export new catalog

**Database:**
- `packages/db/src/schema/tasks.ts` — add `leadReminderSentAt`, `dueReminderSentAt` columns
- `packages/db/src/schema/notifications.ts` — drop `notifyOnTaskAssigned`, `notifyOnTaskComment`, `notifyOnBookingNeedsAction` columns
- `packages/db/drizzle/0031_*.sql` (generated) — migration

**API — event plumbing:**
- `apps/api/src/services/events/event-types.ts` — classify task events
- `apps/api/src/services/notifications/templates/task.ts` (new) — render the 5 variants in de + en
- `apps/api/src/services/notifications/templates/task.test.ts` (new)
- `apps/api/src/services/notifications/templates/index.ts` — register `renderTaskMessage`
- `apps/api/src/services/notifications/role-defaults.ts` — task-event branch + `audience: "user"` variant
- `apps/api/src/services/notifications/role-defaults.test.ts` — extend
- `apps/api/src/services/notifications/notification-pipeline.ts` — extend `loadMutedEventTypes` for `user:*`, extend `recipientId` construction, look up user locale
- `apps/api/src/services/notifications/notification-pipeline.test.ts` — extend
- `apps/api/src/services/notifications/notification.service.ts` — delete 3 legacy helpers
- `apps/api/src/services/notifications/notification.service.test.ts` — delete related tests

**API — task service emissions:**
- `apps/api/src/services/admin/task.service.ts` — emit events at 4 sites, reset reminder timestamps on due-date change
- `apps/api/src/services/admin/task.service.test.ts` — extend

**API — reminder worker:**
- `apps/api/src/workers/task-reminder.worker.ts` (new)
- `apps/api/src/workers/task-reminder.worker.test.ts` (new)
- `apps/api/src/workers/queues.ts` — add queue + `initTaskReminders`
- `apps/api/src/workers/queues.test.ts` — extend
- `apps/api/src/workers/index.ts` — wire `initTaskReminders` into boot
- `apps/api/src/workers/index.test.ts` — extend

**API — user preferences:**
- `apps/api/src/services/notifications/user-preferences.service.ts` (new)
- `apps/api/src/services/notifications/user-preferences.service.test.ts` (new)
- `apps/api/src/routes/admin/notification.routes.ts` — add GET + PATCH `/preferences`
- `apps/api/src/routes/admin/notification.routes.test.ts` — extend
- `apps/api/src/routes/admin/notification.schemas.ts` — add preferences body schema

**Web — settings UI:**
- `apps/web/src/components/admin/my-notifications-card.tsx` (new)
- `apps/web/src/components/admin/my-notifications-card.test.tsx` (new)
- `apps/web/src/app/[locale]/admin/settings/notifications/page.tsx` — render the card
- `apps/web/src/messages/en.json` — strings
- `apps/web/src/messages/de.json` — strings

**Docs:**
- `AGENTS.md` — document new event types, new worker, new preferences endpoints

---

## Task 1: Shared event vocabulary

**Files:**
- Modify: `packages/shared/src/domain-events.ts`

- [ ] **Step 1: Read the existing file**

Read `packages/shared/src/domain-events.ts` to confirm current shape (see spec for reference).

- [ ] **Step 2: Widen `EventEntityType`**

Change line 5 from:

```ts
export type EventEntityType = "match" | "booking" | "referee";
```

to:

```ts
export type EventEntityType = "match" | "booking" | "referee" | "task";
```

- [ ] **Step 3: Add task event type constants**

Inside `EVENT_TYPES` (before the closing `} as const;` around line 45), add:

```ts
  // Task events
  TASK_ASSIGNED: "task.assigned",
  TASK_UNASSIGNED: "task.unassigned",
  TASK_COMMENT_ADDED: "task.comment.added",
  TASK_DUE_REMINDER: "task.due.reminder",
```

- [ ] **Step 4: Add payload interfaces**

At the end of the payload-interface block (after `SyncCompletedPayload`, before the union type), add:

```ts
export interface TaskAssignedPayload {
  taskId: number;
  boardId: number;
  boardName: string;
  title: string;
  assigneeUserIds: string[];   // recipient userIds
  assignedBy: string;          // display name of the acting user (for templates)
  dueDate: string | null;
  priority: "low" | "normal" | "high";
}

export interface TaskUnassignedPayload {
  taskId: number;
  boardId: number;
  boardName: string;
  title: string;
  unassignedUserIds: string[]; // recipient userIds
  unassignedBy: string;        // display name of the acting user (for templates)
}

export interface TaskCommentAddedPayload {
  taskId: number;
  boardId: number;
  boardName: string;
  title: string;
  commentId: number;
  authorId: string;            // userId of comment author
  authorName: string;          // display name (for templates)
  bodyPreview: string;
  recipientUserIds: string[];
}

export interface TaskDueReminderPayload {
  taskId: number;
  boardId: number;
  boardName: string;
  title: string;
  dueDate: string;
  reminderKind: "lead" | "day_of";
  assigneeUserIds: string[];
}
```

- [ ] **Step 5: Extend the union**

Change `DomainEventPayload` to include the four new payloads:

```ts
export type DomainEventPayload =
  | MatchCreatedPayload
  | MatchScheduleChangedPayload
  | MatchVenueChangedPayload
  | MatchCancelledPayload
  | MatchForfeitedPayload
  | MatchScoreChangedPayload
  | MatchRemovedPayload
  | MatchConfirmedPayload
  | MatchResultEnteredPayload
  | MatchResultChangedPayload
  | RefereeAssignedPayload
  | RefereeUnassignedPayload
  | RefereeReassignedPayload
  | RefereeSlotsPayload
  | BookingCreatedPayload
  | BookingStatusChangedPayload
  | BookingNeedsReconfirmationPayload
  | OverrideConflictPayload
  | OverrideAppliedPayload
  | OverrideRevertedPayload
  | SyncCompletedPayload
  | TaskAssignedPayload
  | TaskUnassignedPayload
  | TaskCommentAddedPayload
  | TaskDueReminderPayload;
```

- [ ] **Step 6: Verify it typechecks**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/domain-events.ts
git commit -m "feat(shared): add task domain event types and payloads"
```

---

## Task 2: Event urgency classification

**Files:**
- Modify: `apps/api/src/services/events/event-types.ts`

- [ ] **Step 1: Write the failing tests**

Add the following to `apps/api/src/services/events/event-types.test.ts` at the bottom of the file:

```ts
describe("task event urgency", () => {
  it("classifies task.assigned as immediate when dueDate within 7 days", () => {
    const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(classifyUrgency("task.assigned", { dueDate: soon })).toBe("immediate");
  });

  it("classifies task.assigned as routine when dueDate beyond 7 days", () => {
    const later = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(classifyUrgency("task.assigned", { dueDate: later })).toBe("routine");
  });

  it("classifies task.assigned as routine when dueDate is null", () => {
    expect(classifyUrgency("task.assigned", { dueDate: null })).toBe("routine");
  });

  it("classifies task.unassigned as routine", () => {
    expect(classifyUrgency("task.unassigned", {})).toBe("routine");
  });

  it("classifies task.comment.added as routine", () => {
    expect(classifyUrgency("task.comment.added", {})).toBe("routine");
  });

  it("classifies task.due.reminder as immediate (lead)", () => {
    expect(classifyUrgency("task.due.reminder", { reminderKind: "lead" })).toBe("immediate");
  });

  it("classifies task.due.reminder as immediate (day_of)", () => {
    expect(classifyUrgency("task.due.reminder", { reminderKind: "day_of" })).toBe("immediate");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm --filter @dragons/api test event-types`
Expected: 7 new tests fail — current code classifies unknown types as routine, so `task.assigned` with near dueDate and `task.due.reminder` tests fail.

- [ ] **Step 3: Extend the classifier**

Update `apps/api/src/services/events/event-types.ts`:

Add `task.due.reminder` to `ALWAYS_IMMEDIATE`:

```ts
const ALWAYS_IMMEDIATE = new Set<string>([
  EVENT_TYPES.MATCH_CANCELLED,
  EVENT_TYPES.MATCH_FORFEITED,
  EVENT_TYPES.BOOKING_NEEDS_RECONFIRMATION,
  EVENT_TYPES.OVERRIDE_CONFLICT,
  EVENT_TYPES.REFEREE_SLOTS_REMINDER,
  EVENT_TYPES.TASK_DUE_REMINDER,
]);
```

Add `task.assigned` to `DATE_DEPENDENT`:

```ts
const DATE_DEPENDENT = new Set<string>([
  EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
  EVENT_TYPES.MATCH_VENUE_CHANGED,
  EVENT_TYPES.OVERRIDE_REVERTED,
  EVENT_TYPES.REFEREE_SLOTS_NEEDED,
  EVENT_TYPES.TASK_ASSIGNED,
]);
```

Add `dueDate` to the top-level fields picked up by `extractRelevantDates`:

```ts
function extractRelevantDates(payload: Record<string, unknown>): string[] {
  const dates: string[] = [];

  // Check top-level date fields
  if (typeof payload.kickoffDate === "string") dates.push(payload.kickoffDate);
  if (typeof payload.date === "string") dates.push(payload.date);
  if (typeof payload.dueDate === "string") dates.push(payload.dueDate);

  // Check changes array for date/time fields
  const changes = payload.changes;
  if (Array.isArray(changes)) {
    for (const change of changes) {
      if (typeof change !== "object" || change === null) continue;
      const c = change as Record<string, unknown>;
      if (typeof c.field === "string" && /date|time|kickoff/i.test(c.field)) {
        if (typeof c.oldValue === "string") dates.push(c.oldValue);
        if (typeof c.newValue === "string") dates.push(c.newValue);
      }
    }
  }

  return dates;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `pnpm --filter @dragons/api test event-types`
Expected: all tests pass (including the 7 new ones).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/events/event-types.ts apps/api/src/services/events/event-types.test.ts
git commit -m "feat(api): classify task event urgency"
```

---

## Task 3: Database migration — tasks reminder columns + drop legacy prefs columns

**Files:**
- Modify: `packages/db/src/schema/tasks.ts`
- Modify: `packages/db/src/schema/notifications.ts`
- Create: `packages/db/drizzle/0031_<adjective>_<noun>.sql` (generated by Drizzle)
- Create: `packages/db/drizzle/meta/0031_snapshot.json` (generated)
- Modify: `packages/db/drizzle/meta/_journal.json` (generated)

- [ ] **Step 1: Add reminder timestamp columns to `tasks` schema**

In `packages/db/src/schema/tasks.ts`, update the `tasks` table definition — add the two columns after `updatedAt`, before the closing `(table) =>` block:

```ts
export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    boardId: integer("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    columnId: integer("column_id")
      .notNull()
      .references(() => boardColumns.id),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    priority: varchar("priority", { length: 10 }).notNull().default("normal").$type<TaskPriority>(),
    dueDate: date("due_date"),
    position: integer("position").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    leadReminderSentAt: timestamp("lead_reminder_sent_at", { withTimezone: true }),
    dueReminderSentAt: timestamp("due_reminder_sent_at", { withTimezone: true }),
  },
  (table) => ({
    boardIdIdx: index("tasks_board_id_idx").on(table.boardId),
    columnIdIdx: index("tasks_column_id_idx").on(table.columnId),
    dueDateIdx: index("tasks_due_date_idx").on(table.dueDate),
  }),
);
```

- [ ] **Step 2: Remove legacy bool columns from user notification preferences**

In `packages/db/src/schema/notifications.ts`, the `userNotificationPreferences` table drops the three bool columns. Replace the existing block:

```ts
export const userNotificationPreferences = pgTable(
  "user_notification_preferences",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().unique(),
    whatsappEnabled: boolean("whatsapp_enabled").notNull().default(false),
    whatsappNumber: varchar("whatsapp_number", { length: 20 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    locale: text("locale").notNull().default("de"),
    mutedEventTypes: text("muted_event_types").array().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);
```

(Three lines — `notifyOnTaskAssigned`, `notifyOnBookingNeedsAction`, `notifyOnTaskComment` — are deleted.)

- [ ] **Step 3: Generate the migration**

Run: `pnpm --filter @dragons/db db:generate`

Expected output: a new migration file `packages/db/drizzle/0031_<words>.sql` containing:

```sql
ALTER TABLE "tasks" ADD COLUMN "lead_reminder_sent_at" timestamp with time zone;
ALTER TABLE "tasks" ADD COLUMN "due_reminder_sent_at" timestamp with time zone;
ALTER TABLE "user_notification_preferences" DROP COLUMN "notify_on_task_assigned";
ALTER TABLE "user_notification_preferences" DROP COLUMN "notify_on_booking_needs_action";
ALTER TABLE "user_notification_preferences" DROP COLUMN "notify_on_task_comment";
```

Plus updates to `meta/_journal.json` and a new `meta/0031_snapshot.json`.

Inspect the generated SQL to verify it matches this. If Drizzle produces something different (e.g., different column order), that's fine — the semantic intent is the same.

- [ ] **Step 4: Run migration against a throwaway DB to verify it applies cleanly**

Run: `pnpm --filter @dragons/db test` (the migration is exercised by PGlite test setup in downstream test suites).

If there is no `test` script, instead run one of the API integration tests to force migration:

```bash
pnpm --filter @dragons/api test -- task.service
```

Expected: tests proceed without migration errors.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/tasks.ts packages/db/src/schema/notifications.ts packages/db/drizzle/0031_*.sql packages/db/drizzle/meta/_journal.json packages/db/drizzle/meta/0031_snapshot.json
git commit -m "feat(db): add task reminder timestamps, drop legacy pref bools"
```

---

## Task 4: Task template renderer

**Files:**
- Create: `apps/api/src/services/notifications/templates/task.ts`
- Create: `apps/api/src/services/notifications/templates/task.test.ts`
- Modify: `apps/api/src/services/notifications/templates/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/notifications/templates/task.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderTaskMessage } from "./task";

describe("renderTaskMessage", () => {
  const assignedPayload = {
    taskId: 1,
    boardId: 10,
    boardName: "Board X",
    title: "Write report",
    assigneeUserIds: ["u1"],
    assignedBy: "Alice",
    dueDate: null,
    priority: "normal" as const,
  };

  it("renders task.assigned in German", () => {
    const result = renderTaskMessage("task.assigned", assignedPayload, "Write report", "de");
    expect(result).toEqual({
      title: "Neue Aufgabe: Write report",
      body: "Alice hat dich einer Aufgabe auf Board X zugewiesen.",
    });
  });

  it("renders task.assigned in English", () => {
    const result = renderTaskMessage("task.assigned", assignedPayload, "Write report", "en");
    expect(result).toEqual({
      title: "New task: Write report",
      body: "Alice assigned you a task on Board X.",
    });
  });

  it("renders task.unassigned in German", () => {
    const payload = {
      taskId: 1,
      boardId: 10,
      boardName: "Board X",
      title: "Write report",
      unassignedUserIds: ["u1"],
      unassignedBy: "Alice",
    };
    const result = renderTaskMessage("task.unassigned", payload, "Write report", "de");
    expect(result).toEqual({
      title: "Aufgabe entfernt: Write report",
      body: "Alice hat dich von einer Aufgabe auf Board X entfernt.",
    });
  });

  it("renders task.unassigned in English", () => {
    const payload = {
      taskId: 1,
      boardId: 10,
      boardName: "Board X",
      title: "Write report",
      unassignedUserIds: ["u1"],
      unassignedBy: "Alice",
    };
    const result = renderTaskMessage("task.unassigned", payload, "Write report", "en");
    expect(result).toEqual({
      title: "Removed from task: Write report",
      body: "Alice removed you from a task on Board X.",
    });
  });

  it("renders task.comment.added with preview", () => {
    const payload = {
      taskId: 1,
      boardId: 10,
      boardName: "Board X",
      title: "Write report",
      commentId: 7,
      authorId: "u2",
      authorName: "Bob",
      bodyPreview: "Looks good to me.",
      recipientUserIds: ["u1"],
    };
    const result = renderTaskMessage("task.comment.added", payload, "Write report", "en");
    expect(result).toEqual({
      title: "New comment: Write report",
      body: "Bob: Looks good to me.",
    });
  });

  it("renders task.due.reminder lead variant", () => {
    const payload = {
      taskId: 1,
      boardId: 10,
      boardName: "Board X",
      title: "Write report",
      dueDate: "2026-05-01",
      reminderKind: "lead" as const,
      assigneeUserIds: ["u1"],
    };
    const result = renderTaskMessage("task.due.reminder", payload, "Write report", "de");
    expect(result).toEqual({
      title: "Morgen fällig: Write report",
      body: "Deine Aufgabe auf Board X ist morgen fällig.",
    });
  });

  it("renders task.due.reminder day_of variant in English", () => {
    const payload = {
      taskId: 1,
      boardId: 10,
      boardName: "Board X",
      title: "Write report",
      dueDate: "2026-05-01",
      reminderKind: "day_of" as const,
      assigneeUserIds: ["u1"],
    };
    const result = renderTaskMessage("task.due.reminder", payload, "Write report", "en");
    expect(result).toEqual({
      title: "Due today: Write report",
      body: "Your task on Board X is due today.",
    });
  });

  it("returns null for non-task event type", () => {
    expect(renderTaskMessage("match.cancelled", {}, "x", "de")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm --filter @dragons/api test templates/task`
Expected: all 8 tests fail with "Cannot find module './task'".

- [ ] **Step 3: Implement the renderer**

Create `apps/api/src/services/notifications/templates/task.ts`:

```ts
import type { RenderedMessage } from "./match";

const COMMENT_PREVIEW_MAX = 140;

export function truncateForPreview(body: string): string {
  if (body.length <= COMMENT_PREVIEW_MAX) return body;
  return `${body.slice(0, COMMENT_PREVIEW_MAX)}…`;
}

function renderAssigned(
  payload: Record<string, unknown>,
  title: string,
  locale: string,
): RenderedMessage {
  const by = String(payload.assignedBy ?? "");
  const board = String(payload.boardName ?? "");
  if (locale === "de") {
    return {
      title: `Neue Aufgabe: ${title}`,
      body: `${by} hat dich einer Aufgabe auf ${board} zugewiesen.`,
    };
  }
  return {
    title: `New task: ${title}`,
    body: `${by} assigned you a task on ${board}.`,
  };
}

function renderUnassigned(
  payload: Record<string, unknown>,
  title: string,
  locale: string,
): RenderedMessage {
  const by = String(payload.unassignedBy ?? "");
  const board = String(payload.boardName ?? "");
  if (locale === "de") {
    return {
      title: `Aufgabe entfernt: ${title}`,
      body: `${by} hat dich von einer Aufgabe auf ${board} entfernt.`,
    };
  }
  return {
    title: `Removed from task: ${title}`,
    body: `${by} removed you from a task on ${board}.`,
  };
}

function renderCommentAdded(
  payload: Record<string, unknown>,
  title: string,
  locale: string,
): RenderedMessage {
  const author = String(payload.authorName ?? "");
  const preview = String(payload.bodyPreview ?? "");
  if (locale === "de") {
    return {
      title: `Neuer Kommentar: ${title}`,
      body: `${author}: ${preview}`,
    };
  }
  return {
    title: `New comment: ${title}`,
    body: `${author}: ${preview}`,
  };
}

function renderDueReminder(
  payload: Record<string, unknown>,
  title: string,
  locale: string,
): RenderedMessage {
  const kind = payload.reminderKind === "day_of" ? "day_of" : "lead";
  const board = String(payload.boardName ?? "");
  if (locale === "de") {
    if (kind === "day_of") {
      return {
        title: `Heute fällig: ${title}`,
        body: `Deine Aufgabe auf ${board} ist heute fällig.`,
      };
    }
    return {
      title: `Morgen fällig: ${title}`,
      body: `Deine Aufgabe auf ${board} ist morgen fällig.`,
    };
  }
  if (kind === "day_of") {
    return {
      title: `Due today: ${title}`,
      body: `Your task on ${board} is due today.`,
    };
  }
  return {
    title: `Due tomorrow: ${title}`,
    body: `Your task on ${board} is due tomorrow.`,
  };
}

export function renderTaskMessage(
  eventType: string,
  payload: Record<string, unknown>,
  entityName: string,
  locale: string,
): RenderedMessage | null {
  switch (eventType) {
    case "task.assigned":
      return renderAssigned(payload, entityName, locale);
    case "task.unassigned":
      return renderUnassigned(payload, entityName, locale);
    case "task.comment.added":
      return renderCommentAdded(payload, entityName, locale);
    case "task.due.reminder":
      return renderDueReminder(payload, entityName, locale);
    default:
      return null;
  }
}
```

- [ ] **Step 4: Register in template index**

In `apps/api/src/services/notifications/templates/index.ts`, add the import at the top and chain it onto the fallthrough:

```ts
import type { RenderedMessage } from "./match";
import { renderMatchMessage } from "./match";
import { renderRefereeMessage } from "./referee";
import { renderBookingMessage } from "./booking";
import { renderOverrideMessage } from "./override";
import { renderTaskMessage } from "./task";

export type { RenderedMessage } from "./match";
export { renderDigestMessage } from "./digest";
export type { DigestItem } from "./digest";

export function renderEventMessage(
  eventType: string,
  payload: Record<string, unknown>,
  entityName: string,
  locale: string,
): RenderedMessage {
  const result =
    renderMatchMessage(eventType, payload, entityName, locale) ??
    renderRefereeMessage(eventType, payload, entityName, locale) ??
    renderBookingMessage(eventType, payload, entityName, locale) ??
    renderOverrideMessage(eventType, payload, entityName, locale) ??
    renderTaskMessage(eventType, payload, entityName, locale);

  if (result) return result;

  return locale === "de"
    ? { title: `Ereignis: ${eventType}`, body: entityName }
    : { title: `Event: ${eventType}`, body: entityName };
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `pnpm --filter @dragons/api test templates/task`
Expected: all 8 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/notifications/templates/task.ts apps/api/src/services/notifications/templates/task.test.ts apps/api/src/services/notifications/templates/index.ts
git commit -m "feat(api): render task notification templates (de + en)"
```

---

## Task 5: Role-defaults — task events + user audience

**Files:**
- Modify: `apps/api/src/services/notifications/role-defaults.ts`
- Modify: `apps/api/src/services/notifications/role-defaults.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/services/notifications/role-defaults.test.ts`:

```ts
describe("task event defaults", () => {
  it("emits one in-app + one push default per assigneeUserId for task.assigned", () => {
    const result = getDefaultNotificationsForEvent(
      "task.assigned",
      { assigneeUserIds: ["u1", "u2"], boardName: "X" },
      "manual",
    );
    expect(result).toEqual([
      { audience: "user", channel: "in_app", userId: "u1" },
      { audience: "user", channel: "push", userId: "u1" },
      { audience: "user", channel: "in_app", userId: "u2" },
      { audience: "user", channel: "push", userId: "u2" },
    ]);
  });

  it("emits for unassignedUserIds on task.unassigned", () => {
    const result = getDefaultNotificationsForEvent(
      "task.unassigned",
      { unassignedUserIds: ["u3"] },
      "manual",
    );
    expect(result).toEqual([
      { audience: "user", channel: "in_app", userId: "u3" },
      { audience: "user", channel: "push", userId: "u3" },
    ]);
  });

  it("emits for recipientUserIds on task.comment.added", () => {
    const result = getDefaultNotificationsForEvent(
      "task.comment.added",
      { recipientUserIds: ["u1"] },
      "manual",
    );
    expect(result).toEqual([
      { audience: "user", channel: "in_app", userId: "u1" },
      { audience: "user", channel: "push", userId: "u1" },
    ]);
  });

  it("emits for assigneeUserIds on task.due.reminder", () => {
    const result = getDefaultNotificationsForEvent(
      "task.due.reminder",
      { assigneeUserIds: ["u1"] },
      "sync",
    );
    expect(result).toEqual([
      { audience: "user", channel: "in_app", userId: "u1" },
      { audience: "user", channel: "push", userId: "u1" },
    ]);
  });

  it("returns empty when task payload is missing userIds field", () => {
    const result = getDefaultNotificationsForEvent("task.assigned", {}, "manual");
    expect(result).toEqual([]);
  });

  it("does not emit admin notifications for task events", () => {
    const result = getDefaultNotificationsForEvent(
      "task.assigned",
      { assigneeUserIds: ["u1"] },
      "manual",
    );
    expect(result.some((n) => n.audience === "admin")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm --filter @dragons/api test role-defaults`
Expected: 6 new tests fail. `task.*` events are not recognized, so results are empty or wrong shape.

- [ ] **Step 3: Extend role-defaults.ts**

Update `apps/api/src/services/notifications/role-defaults.ts`:

Change `DefaultNotification`:

```ts
export interface DefaultNotification {
  audience: "admin" | "referee" | "user";
  channel: Channel;
  refereeId?: number;
  userId?: string;
}
```

Add task events to push-eligible set:

```ts
const PUSH_ELIGIBLE_EVENTS = new Set([
  "referee.assigned",
  "referee.unassigned",
  "referee.reassigned",
  "referee.slots.needed",
  "referee.slots.reminder",
  "match.cancelled",
  "match.rescheduled",
  "task.assigned",
  "task.unassigned",
  "task.comment.added",
  "task.due.reminder",
]);
```

Remove `task.` from the admin prefixes by keeping the current set as-is (`task.` is not in `ADMIN_EVENT_PREFIXES`, so admin audience never gets task events — correct).

Add task-event dispatch at the bottom of `getDefaultNotificationsForEvent`, before the return statement. First add the helper constants above the function:

```ts
const TASK_RECIPIENT_FIELDS: Record<string, string> = {
  "task.assigned": "assigneeUserIds",
  "task.unassigned": "unassignedUserIds",
  "task.comment.added": "recipientUserIds",
  "task.due.reminder": "assigneeUserIds",
};
```

Extend `getDefaultNotificationsForEvent` — after the existing `if (isAdminEvent(eventType))` block and the referee blocks, add:

```ts
  const taskField = TASK_RECIPIENT_FIELDS[eventType];
  if (taskField) {
    const raw = payload[taskField];
    const userIds = Array.isArray(raw) ? raw.filter((x) => typeof x === "string") as string[] : [];
    for (const userId of userIds) {
      emit({ audience: "user", channel: "in_app", userId });
    }
  }
```

The `emit` helper already handles push-eligibility fan-out — no change needed there.

- [ ] **Step 4: Run tests, verify they pass**

Run: `pnpm --filter @dragons/api test role-defaults`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/notifications/role-defaults.ts apps/api/src/services/notifications/role-defaults.test.ts
git commit -m "feat(api): route task events to user:<id> recipients by default"
```

---

## Task 6: Pipeline — user recipients, mute loading, locale

**Files:**
- Modify: `apps/api/src/services/notifications/notification-pipeline.ts`
- Modify: `apps/api/src/services/notifications/notification-pipeline.test.ts`

- [ ] **Step 1: Write the failing tests**

Add the following describe block to `apps/api/src/services/notifications/notification-pipeline.test.ts` (append at the end before the final `});`). Use the test helpers already in the file — inspect them first to see how other tests set up a user/task.

```ts
describe("task event dispatch", () => {
  it("dispatches in-app notification to user:<id> recipient", async () => {
    const userId = await createTestUser(db, { name: "Alice", role: "admin" });
    const event = await insertTestTaskEvent(db, {
      type: "task.assigned",
      payload: { assigneeUserIds: [userId], boardName: "Board X", assignedBy: "Bob" },
    });

    await processEvent(event);

    const [log] = await db.select().from(notificationLog).where(eq(notificationLog.eventId, event.id));
    expect(log).toBeDefined();
    expect(log?.recipientId).toBe(`user:${userId}`);
    expect(log?.title).toContain("New task");
  });

  it("uses German locale when user preference is de", async () => {
    const userId = await createTestUser(db, { name: "Anna", role: "admin" });
    await db.insert(userNotificationPreferences).values({ userId, locale: "de" });
    const event = await insertTestTaskEvent(db, {
      type: "task.assigned",
      payload: { assigneeUserIds: [userId], boardName: "Board X", assignedBy: "Bob" },
    });

    await processEvent(event);

    const [log] = await db.select().from(notificationLog).where(eq(notificationLog.eventId, event.id));
    expect(log?.title).toBe("Neue Aufgabe: Test Task");
  });

  it("skips dispatch when user has muted the event type", async () => {
    const userId = await createTestUser(db, { name: "Carl", role: "admin" });
    await db.insert(userNotificationPreferences).values({
      userId,
      mutedEventTypes: ["task.assigned"],
    });
    const event = await insertTestTaskEvent(db, {
      type: "task.assigned",
      payload: { assigneeUserIds: [userId], boardName: "Board X", assignedBy: "Bob" },
    });

    await processEvent(event);

    const logs = await db.select().from(notificationLog).where(eq(notificationLog.eventId, event.id));
    expect(logs).toHaveLength(0);
  });
});
```

Because `insertTestTaskEvent` is new, add it near the existing helpers at the top of the test file:

```ts
async function insertTestTaskEvent(
  db: PostgresJsDatabase,
  params: { type: string; payload: Record<string, unknown> },
) {
  const id = ulid();
  const [row] = await db
    .insert(domainEvents)
    .values({
      id,
      type: params.type,
      source: "manual",
      urgency: "routine",
      occurredAt: new Date(),
      entityType: "task",
      entityId: 1,
      entityName: "Test Task",
      deepLinkPath: "/admin/boards/1?task=1",
      payload: params.payload,
    })
    .returning();
  return row!;
}
```

Also add a `createTestUser` helper if none exists — check the test file's existing helpers first, likely `createAdminUser` or similar. Adapt if needed.

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm --filter @dragons/api test notification-pipeline`
Expected: new tests fail. Pipeline does not yet construct `user:<id>` recipientId for the `audience: "user"` default, `loadMutedEventTypes` does not include user recipients, and locale lookup does not use user preferences.

- [ ] **Step 3: Extend `loadMutedEventTypes`**

In `notification-pipeline.ts`, replace the current `loadMutedEventTypes` function body to also process `user:*` recipients:

```ts
export async function loadMutedEventTypes(
  recipientIds: string[],
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();

  const refereeRecipients = recipientIds.filter((r) => r.startsWith("referee:"));
  const userRecipients = recipientIds.filter((r) => r.startsWith("user:"));
  if (refereeRecipients.length === 0 && userRecipients.length === 0) return result;

  try {
    const prefs = await db
      .select({
        userId: userNotificationPreferences.userId,
        mutedEventTypes: userNotificationPreferences.mutedEventTypes,
      })
      .from(userNotificationPreferences);

    const userMutedMap = new Map<string, Set<string>>();
    for (const pref of prefs) {
      if (pref.mutedEventTypes.length > 0) {
        userMutedMap.set(pref.userId, new Set(pref.mutedEventTypes));
      }
    }

    for (const rid of refereeRecipients) {
      const muted = userMutedMap.get(rid);
      if (muted) result.set(rid, muted);
    }

    for (const rid of userRecipients) {
      const userId = rid.slice("user:".length);
      const muted = userMutedMap.get(userId);
      if (muted) result.set(rid, muted);
    }
  } catch {
    logger.debug("Could not load muted event types, skipping preference check");
  }

  return result;
}
```

- [ ] **Step 4: Extend `recipientId` construction for default matches**

Find the `evaluateDefaults` function. Replace the `recipientId` construction block with:

```ts
    const recipientId = defaultNotif.refereeId
      ? `referee:${defaultNotif.refereeId}`
      : defaultNotif.userId
        ? `user:${defaultNotif.userId}`
        : `audience:${defaultNotif.audience}`;
```

- [ ] **Step 5: Add locale lookup for user recipients**

Add a helper above `dispatchImmediate`:

```ts
async function resolveLocaleForRecipient(
  recipientId: string,
  configLocale: string | undefined,
): Promise<string> {
  if (recipientId.startsWith("user:")) {
    const userId = recipientId.slice("user:".length);
    const [pref] = await db
      .select({ locale: userNotificationPreferences.locale })
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, userId))
      .limit(1);
    return pref?.locale ?? configLocale ?? "de";
  }
  return configLocale ?? "de";
}
```

In `dispatchImmediate`, replace the `locale` derivation line:

```ts
  const configLocale = (config.config as Record<string, unknown>)?.locale as string | undefined;
  const locale = await resolveLocaleForRecipient(recipientId, configLocale);
```

- [ ] **Step 6: Run tests, verify they pass**

Run: `pnpm --filter @dragons/api test notification-pipeline`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/notifications/notification-pipeline.ts apps/api/src/services/notifications/notification-pipeline.test.ts
git commit -m "feat(api): support user:<id> recipients with per-user locale and mute"
```

---

## Task 7: Delete legacy notification.service helpers

**Files:**
- Modify: `apps/api/src/services/notifications/notification.service.ts`
- Modify: `apps/api/src/services/notifications/notification.service.test.ts`

- [ ] **Step 1: Confirm helpers are unused**

Run: `grep -rn "notifyTaskAssigned\|notifyTaskComment\|notifyBookingNeedsAction" apps/ --include="*.ts" --include="*.tsx" | grep -v ".test.ts" | grep -v "notification.service.ts"`
Expected: no output (zero external call sites).

- [ ] **Step 2: Reduce `notification.service.ts` to just `sendNotification`**

Replace the file contents with:

```ts
import { db } from "../../config/database";
import { logger } from "../../config/logger";
import { notifications } from "@dragons/db/schema";

const log = logger.child({ service: "notification" });

interface SendNotificationParams {
  recipientId: string;
  title: string;
  body: string;
}

export async function sendNotification(
  params: SendNotificationParams,
): Promise<void> {
  await db.insert(notifications).values({
    recipientId: params.recipientId,
    channel: "in_app",
    title: params.title,
    body: params.body,
    status: "sent",
    sentAt: new Date(),
  });

  log.info(
    { recipientId: params.recipientId, title: params.title },
    "In-app notification sent",
  );
}
```

- [ ] **Step 3: Prune `notification.service.test.ts`**

Open `notification.service.test.ts` and delete every `describe`/`it` block that references `notifyTaskAssigned`, `notifyTaskComment`, `notifyBookingNeedsAction`, or user-prefs bool columns. Keep only the tests covering `sendNotification`.

- [ ] **Step 4: Run tests, verify they pass**

Run: `pnpm --filter @dragons/api test notification.service`
Expected: remaining tests pass, no references to deleted functions.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/notifications/notification.service.ts apps/api/src/services/notifications/notification.service.test.ts
git commit -m "refactor(api): remove unused legacy notifyTask* helpers"
```

---

## Task 8: Task service — assignee-diff helper + emission from `addAssignee` / `removeAssignee`

**Files:**
- Modify: `apps/api/src/services/admin/task.service.ts`
- Modify: `apps/api/src/services/admin/task.service.test.ts`

- [ ] **Step 1: Write the failing tests**

In `task.service.test.ts`, add a describe block. Use the file's existing test harness for db + user creation — inspect the top of the file first to find the helpers.

```ts
describe("task event emission — assign / unassign", () => {
  async function getEventsForEntity(entityId: number) {
    return await db
      .select()
      .from(domainEvents)
      .where(and(eq(domainEvents.entityType, "task"), eq(domainEvents.entityId, entityId)))
      .orderBy(asc(domainEvents.createdAt));
  }

  it("emits task.assigned with the new userId when addAssignee is called", async () => {
    const { taskId, boardId, boardName, callerId, targetUserId, callerName } = await seedTaskAndUsers();
    await addAssignee(taskId, targetUserId, callerId);

    const events = await getEventsForEntity(taskId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "task.assigned",
      entityType: "task",
      entityId: taskId,
      deepLinkPath: `/admin/boards/${boardId}?task=${taskId}`,
    });
    const payload = events[0]!.payload as Record<string, unknown>;
    expect(payload.assigneeUserIds).toEqual([targetUserId]);
    expect(payload.assignedBy).toBe(callerName);
    expect(payload.boardName).toBe(boardName);
  });

  it("emits task.unassigned when removeAssignee is called", async () => {
    const { taskId, callerId, targetUserId } = await seedTaskAndUsers();
    await addAssignee(taskId, targetUserId, callerId);
    await removeAssignee(taskId, targetUserId, callerId);

    const events = await getEventsForEntity(taskId);
    expect(events).toHaveLength(2);
    expect(events[1]!.type).toBe("task.unassigned");
    const payload = events[1]!.payload as Record<string, unknown>;
    expect(payload.unassignedUserIds).toEqual([targetUserId]);
  });

  it("does not emit on addAssignee when user is already assigned (conflict)", async () => {
    const { taskId, callerId, targetUserId } = await seedTaskAndUsers();
    await addAssignee(taskId, targetUserId, callerId);
    await addAssignee(taskId, targetUserId, callerId);

    const events = await getEventsForEntity(taskId);
    expect(events).toHaveLength(1);
  });
});
```

`seedTaskAndUsers` is a new helper — add it next to the file's existing helpers:

```ts
async function seedTaskAndUsers() {
  const boardName = "Test Board";
  const [board] = await db.insert(boards).values({ name: boardName }).returning();
  const [column] = await db
    .insert(boardColumns)
    .values({ boardId: board!.id, name: "To Do", position: 0 })
    .returning();
  const [caller] = await db
    .insert(user)
    .values({ id: "caller-1", email: "caller@test.local", name: "Caller Name", emailVerified: true, role: "admin" })
    .returning();
  const [target] = await db
    .insert(user)
    .values({ id: "target-1", email: "target@test.local", name: "Target", emailVerified: true, role: "admin" })
    .returning();
  const [task] = await db
    .insert(tasks)
    .values({ boardId: board!.id, columnId: column!.id, title: "T", createdBy: caller!.id })
    .returning();
  return {
    taskId: task!.id,
    boardId: board!.id,
    boardName,
    callerId: caller!.id,
    callerName: caller!.name,
    targetUserId: target!.id,
  };
}
```

Add required imports to the test file:

```ts
import { and, asc, eq } from "drizzle-orm";
import { domainEvents } from "@dragons/db/schema";
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm --filter @dragons/api test task.service`
Expected: 3 new tests fail — no `domain_events` rows are inserted by the current service.

- [ ] **Step 3: Helper — `emitTaskEvent`**

At the top of `apps/api/src/services/admin/task.service.ts`, after the existing imports, add:

```ts
import { publishDomainEvent } from "../events/event-publisher";
import { boards } from "@dragons/db/schema";
import type { EventType } from "@dragons/shared";
import { logger } from "../../config/logger";

type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

const log = logger.child({ service: "task.service" });

async function loadBoardAndActor(
  tx: TxClient,
  boardId: number,
  actorId: string,
): Promise<{ boardName: string; actorName: string } | null> {
  const [b] = await tx.select({ name: boards.name }).from(boards).where(eq(boards.id, boardId)).limit(1);
  if (!b) return null;
  const [u] = await tx.select({ name: user.name }).from(user).where(eq(user.id, actorId)).limit(1);
  return { boardName: b.name, actorName: u?.name ?? actorId };
}

async function emitTaskEvent(params: {
  type: EventType;
  taskId: number;
  boardId: number;
  title: string;
  boardName: string;
  actor: string;
  payloadExtras: Record<string, unknown>;
  tx: TxClient;
}): Promise<void> {
  try {
    await publishDomainEvent(
      {
        type: params.type,
        source: "manual",
        entityType: "task",
        entityId: params.taskId,
        entityName: params.title,
        deepLinkPath: `/admin/boards/${params.boardId}?task=${params.taskId}`,
        actor: params.actor,
        payload: {
          taskId: params.taskId,
          boardId: params.boardId,
          boardName: params.boardName,
          title: params.title,
          ...params.payloadExtras,
        },
      },
      params.tx,
    );
  } catch (err) {
    log.warn({ err, taskId: params.taskId, type: params.type }, "Failed to emit task event");
  }
}
```

(Note: `publishDomainEvent` already handles transactional inserts correctly — when a `tx` client is provided, it only inserts the row and relies on the outbox poller to pick it up after commit. Never call `enqueueDomainEvent` yourself from within a transaction.)

- [ ] **Step 4: Emit from `addAssignee`**

Replace the current `addAssignee` function with:

```ts
export async function addAssignee(
  taskId: number,
  userId: string,
  callerId: string,
): Promise<TaskAssignee | null> {
  const result = await db.transaction(async (tx) => {
    const [task] = await tx
      .select({ id: tasks.id, boardId: tasks.boardId, title: tasks.title, dueDate: tasks.dueDate, priority: tasks.priority })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!task) return null;

    const [u] = await tx
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!u) return null;

    const insertResult = await tx
      .insert(taskAssignees)
      .values({ taskId, userId, assignedBy: callerId })
      .onConflictDoNothing()
      .returning({ userId: taskAssignees.userId });
    const created = insertResult.length > 0;

    const [row] = await tx
      .select({ userId: taskAssignees.userId, assignedAt: taskAssignees.assignedAt })
      .from(taskAssignees)
      .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)));

    if (created) {
      const ctx = await loadBoardAndActor(tx, task.boardId, callerId);
      if (ctx) {
        await emitTaskEvent({
          type: "task.assigned" as EventType,
          taskId: task.id,
          boardId: task.boardId,
          title: task.title,
          boardName: ctx.boardName,
          actor: callerId,
          payloadExtras: {
            assigneeUserIds: [userId],
            assignedBy: ctx.actorName,
            dueDate: task.dueDate,
            priority: task.priority ?? "normal",
          },
          tx,
        });
      }
    }

    return row ? { userId, name: u.name, assignedAt: row.assignedAt.toISOString() } : null;
  });

  return result;
}
```

- [ ] **Step 5: Expand `removeAssignee` signature to take `callerId`**

The current signature is `removeAssignee(taskId, userId)`. Expand it to accept the caller so the emitted `task.unassigned` event reports who triggered the removal.

New signature: `removeAssignee(taskId: number, userId: string, callerId: string): Promise<boolean>`.

Replace `removeAssignee`:

```ts
export async function removeAssignee(
  taskId: number,
  userId: string,
  callerId: string,
): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const [task] = await tx
      .select({ id: tasks.id, boardId: tasks.boardId, title: tasks.title, dueDate: tasks.dueDate, priority: tasks.priority })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!task) return false;

    const deleted = await tx
      .delete(taskAssignees)
      .where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId)))
      .returning({ taskId: taskAssignees.taskId });

    if (deleted.length === 0) return false;

    const ctx = await loadBoardAndActor(tx, task.boardId, callerId);
    if (ctx) {
      await emitTaskEvent({
        type: "task.unassigned" as EventType,
        taskId: task.id,
        boardId: task.boardId,
        title: task.title,
        boardName: ctx.boardName,
        actor: callerId,
        payloadExtras: { unassignedUserIds: [userId], unassignedBy: ctx.actorName },
        tx,
      });
    }
    return true;
  });
}
```

- [ ] **Step 5b: Update the route to pass `callerId`**

In `apps/api/src/routes/admin/task.routes.ts`, find the `removeAssignee` call site (near line 398 based on the earlier grep). Update the call to pass the session user's id:

```ts
const callerId = c.get("user")?.id;
if (!callerId) return c.json({ error: "Unauthorized" }, 401);
const ok = await removeAssignee(taskId, userId, callerId);
```

(Match the exact shape of the surrounding route handler — keep the existing 404-on-false behavior.)

- [ ] **Step 6: Run tests, verify they pass**

Run: `pnpm --filter @dragons/api test task.service`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/admin/task.service.ts apps/api/src/services/admin/task.service.test.ts
git commit -m "feat(api): emit task.assigned / task.unassigned events"
```

---

## Task 9: Task service — assignee-diff emission inside `updateTask` and `createTask`

**Files:**
- Modify: `apps/api/src/services/admin/task.service.ts`
- Modify: `apps/api/src/services/admin/task.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `task.service.test.ts` within the existing task-event describe block:

```ts
it("emits task.assigned for initial assignees when createTask includes assigneeIds", async () => {
  const { boardId, columnId, callerId, targetUserId } = await seedBoardColumn();
  const task = await createTask(
    boardId,
    { title: "X", assigneeIds: [targetUserId], columnId },
    callerId,
  );

  const events = await db
    .select()
    .from(domainEvents)
    .where(and(eq(domainEvents.entityType, "task"), eq(domainEvents.entityId, task!.id)));
  expect(events).toHaveLength(1);
  expect(events[0]!.type).toBe("task.assigned");
  const payload = events[0]!.payload as Record<string, unknown>;
  expect(payload.assigneeUserIds).toEqual([targetUserId]);
});

it("emits only for newly-added userIds when updateTask replaces assignees", async () => {
  const { taskId, callerId, targetUserId } = await seedTaskAndUsers();
  const [other] = await db
    .insert(user)
    .values({ id: "other-1", email: "other@test.local", name: "Other", emailVerified: true, role: "admin" })
    .returning();

  await addAssignee(taskId, targetUserId, callerId);
  await updateTask(taskId, { assigneeIds: [other!.id] }, callerId);

  const events = await db
    .select()
    .from(domainEvents)
    .where(and(eq(domainEvents.entityType, "task"), eq(domainEvents.entityId, taskId)))
    .orderBy(asc(domainEvents.createdAt));
  // 1: addAssignee target, 2: unassigned target in update, 3: assigned other in update
  expect(events).toHaveLength(3);
  expect(events[1]!.type).toBe("task.unassigned");
  expect((events[1]!.payload as Record<string, unknown>).unassignedUserIds).toEqual([targetUserId]);
  expect(events[2]!.type).toBe("task.assigned");
  expect((events[2]!.payload as Record<string, unknown>).assigneeUserIds).toEqual([other!.id]);
});

it("does not emit when updateTask leaves assigneeIds unchanged", async () => {
  const { taskId, callerId, targetUserId } = await seedTaskAndUsers();
  await addAssignee(taskId, targetUserId, callerId);
  const before = await db
    .select({ c: count() })
    .from(domainEvents)
    .where(and(eq(domainEvents.entityType, "task"), eq(domainEvents.entityId, taskId)));

  await updateTask(taskId, { assigneeIds: [targetUserId] }, callerId);

  const after = await db
    .select({ c: count() })
    .from(domainEvents)
    .where(and(eq(domainEvents.entityType, "task"), eq(domainEvents.entityId, taskId)));
  expect(after[0]!.c).toBe(before[0]!.c);
});
```

Add the `seedBoardColumn` helper:

```ts
async function seedBoardColumn() {
  const [board] = await db.insert(boards).values({ name: "B" }).returning();
  const [column] = await db
    .insert(boardColumns)
    .values({ boardId: board!.id, name: "To Do", position: 0 })
    .returning();
  const [caller] = await db
    .insert(user)
    .values({ id: "caller-2", email: "c2@test.local", name: "Caller", emailVerified: true, role: "admin" })
    .returning();
  const [target] = await db
    .insert(user)
    .values({ id: "target-2", email: "t2@test.local", name: "Target", emailVerified: true, role: "admin" })
    .returning();
  return {
    boardId: board!.id,
    columnId: column!.id,
    callerId: caller!.id,
    targetUserId: target!.id,
  };
}
```

Add `count` to the drizzle-orm import at the top of the test file.

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm --filter @dragons/api test task.service`
Expected: 3 new tests fail.

- [ ] **Step 3: Emit from `createTask`**

In `task.service.ts`, inside the `createTask` function, right before the `return task!;` line at the end of the transaction callback, add:

```ts
    if (data.assigneeIds && data.assigneeIds.length > 0) {
      const uniq = [...new Set(data.assigneeIds)];
      const ctx = await loadBoardAndActor(tx, boardId, callerId);
      if (ctx) {
        await emitTaskEvent({
          type: "task.assigned" as EventType,
          taskId: task!.id,
          boardId: task!.boardId,
          title: task!.title,
          boardName: ctx.boardName,
          actor: callerId,
          payloadExtras: {
            assigneeUserIds: uniq,
            assignedBy: ctx.actorName,
            dueDate: task!.dueDate,
            priority: task!.priority ?? "normal",
          },
          tx,
        });
      }
    }

    return task!;
```

(Position: after the `taskAssignees` insert, before `return task!`.) Remove duplicate assignee-insert logic if it was left over.

- [ ] **Step 4: Emit diff from `updateTask`**

Replace the current `updateTask` with:

```ts
export async function updateTask(
  id: number,
  data: {
    title?: string;
    description?: string | null;
    assigneeIds?: string[];
    priority?: string;
    dueDate?: string | null;
  },
  callerId: string,
): Promise<TaskDetail | null> {
  const setData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined) setData.title = data.title;
  if (data.description !== undefined) setData.description = data.description;
  if (data.priority !== undefined) setData.priority = data.priority;
  if (data.dueDate !== undefined) {
    setData.dueDate = data.dueDate;
    setData.leadReminderSentAt = null;
    setData.dueReminderSentAt = null;
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(tasks)
      .set(setData)
      .where(eq(tasks.id, id))
      .returning();

    if (!row) return null;

    if (data.assigneeIds !== undefined) {
      const nextIds = new Set([...new Set(data.assigneeIds)]);
      const existing = await tx
        .select({ userId: taskAssignees.userId })
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, id));
      const existingIds = new Set(existing.map((r) => r.userId));
      const added: string[] = [];
      const removed: string[] = [];
      for (const uid of nextIds) if (!existingIds.has(uid)) added.push(uid);
      for (const uid of existingIds) if (!nextIds.has(uid)) removed.push(uid);

      await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, id));
      if (nextIds.size > 0) {
        await tx.insert(taskAssignees).values(
          [...nextIds].map((uid) => ({ taskId: id, userId: uid, assignedBy: callerId })),
        );
      }

      if (added.length > 0 || removed.length > 0) {
        const ctx = await loadBoardAndActor(tx, row.boardId, callerId);
        if (ctx) {
          if (removed.length > 0) {
            await emitTaskEvent({
              type: "task.unassigned" as EventType,
              taskId: row.id,
              boardId: row.boardId,
              title: row.title,
              boardName: ctx.boardName,
              actor: callerId,
              payloadExtras: { unassignedUserIds: removed, unassignedBy: ctx.actorName },
              tx,
            });
          }
          if (added.length > 0) {
            await emitTaskEvent({
              type: "task.assigned" as EventType,
              taskId: row.id,
              boardId: row.boardId,
              title: row.title,
              boardName: ctx.boardName,
              actor: callerId,
              payloadExtras: {
                assigneeUserIds: added,
                assignedBy: ctx.actorName,
                dueDate: row.dueDate,
                priority: row.priority ?? "normal",
              },
              tx,
            });
          }
        }
      }
    }

    return row;
  });

  if (!updated) return null;
  return getTaskDetail(id);
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `pnpm --filter @dragons/api test task.service`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/admin/task.service.ts apps/api/src/services/admin/task.service.test.ts
git commit -m "feat(api): emit task.assigned/unassigned from createTask + updateTask diff"
```

---

## Task 10: Task service — emit `task.comment.added`

**Files:**
- Modify: `apps/api/src/services/admin/task.service.ts`
- Modify: `apps/api/src/services/admin/task.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `task.service.test.ts`:

```ts
describe("task event emission — comment", () => {
  it("emits task.comment.added with assignees minus author as recipients", async () => {
    const { taskId, callerId, targetUserId } = await seedTaskAndUsers();
    await addAssignee(taskId, targetUserId, callerId);
    await addAssignee(taskId, callerId, callerId);

    await addComment(taskId, { body: "Hello, this is a test comment." }, callerId);

    const events = await db
      .select()
      .from(domainEvents)
      .where(and(eq(domainEvents.entityType, "task"), eq(domainEvents.entityId, taskId)))
      .orderBy(asc(domainEvents.createdAt));
    const commentEvent = events.find((e) => e.type === "task.comment.added");
    expect(commentEvent).toBeDefined();
    const payload = commentEvent!.payload as Record<string, unknown>;
    expect(payload.recipientUserIds).toEqual([targetUserId]);
    expect(payload.authorId).toBe(callerId);
    expect(payload.bodyPreview).toBe("Hello, this is a test comment.");
  });

  it("truncates long comment bodies to 140 chars with ellipsis in preview", async () => {
    const { taskId, callerId, targetUserId } = await seedTaskAndUsers();
    await addAssignee(taskId, targetUserId, callerId);

    const longBody = "x".repeat(200);
    await addComment(taskId, { body: longBody }, callerId);

    const events = await db
      .select()
      .from(domainEvents)
      .where(and(eq(domainEvents.entityType, "task"), eq(domainEvents.entityId, taskId)));
    const commentEvent = events.find((e) => e.type === "task.comment.added");
    const payload = commentEvent!.payload as Record<string, unknown>;
    expect(payload.bodyPreview).toBe(`${"x".repeat(140)}…`);
  });

  it("does not emit when there are no assignees other than the author", async () => {
    const { taskId, callerId } = await seedTaskAndUsers();
    await addAssignee(taskId, callerId, callerId);

    await addComment(taskId, { body: "Solo" }, callerId);

    const events = await db
      .select()
      .from(domainEvents)
      .where(and(eq(domainEvents.entityType, "task"), eq(domainEvents.entityId, taskId)));
    const commentEvents = events.filter((e) => e.type === "task.comment.added");
    expect(commentEvents).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm --filter @dragons/api test task.service`
Expected: 3 new tests fail.

- [ ] **Step 3: Extend `addComment`**

Replace the current `addComment` with:

```ts
export async function addComment(
  taskId: number,
  data: { body: string },
  callerId: string,
): Promise<TaskComment | null> {
  return await db.transaction(async (tx) => {
    const [task] = await tx
      .select({ id: tasks.id, boardId: tasks.boardId, title: tasks.title })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!task) return null;

    const [comment] = await tx
      .insert(taskComments)
      .values({ taskId, authorId: callerId, body: data.body })
      .returning();

    const rows = await tx
      .select({ userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, taskId));
    const recipients = rows
      .map((r) => r.userId)
      .filter((u) => u !== callerId);

    if (recipients.length > 0) {
      const ctx = await loadBoardAndActor(tx, task.boardId, callerId);
      if (ctx) {
        const preview = data.body.length <= 140 ? data.body : `${data.body.slice(0, 140)}…`;
        await emitTaskEvent({
          type: "task.comment.added" as EventType,
          taskId: task.id,
          boardId: task.boardId,
          title: task.title,
          boardName: ctx.boardName,
          actor: callerId,
          payloadExtras: {
            commentId: comment!.id,
            authorId: callerId,
            authorName: ctx.actorName,
            bodyPreview: preview,
            recipientUserIds: recipients,
          },
          tx,
        });
      }
    }

    return {
      id: comment!.id,
      authorId: comment!.authorId,
      body: comment!.body,
      createdAt: comment!.createdAt.toISOString(),
      updatedAt: comment!.updatedAt.toISOString(),
    };
  });
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `pnpm --filter @dragons/api test task.service`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/admin/task.service.ts apps/api/src/services/admin/task.service.test.ts
git commit -m "feat(api): emit task.comment.added with 140-char body preview"
```

---

## Task 11: Task reminder queue + initializer

**Files:**
- Modify: `apps/api/src/workers/queues.ts`
- Modify: `apps/api/src/workers/queues.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `queues.test.ts`:

```ts
describe("initTaskReminders", () => {
  it("registers a repeatable sweep job every 15 minutes", async () => {
    await initTaskReminders();
    const jobs = await taskRemindersQueue.getRepeatableJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.id).toBe("task-reminder-sweep-cron");
    expect(jobs[0]!.every).toBe(15 * 60 * 1000);
  });

  it("replaces any existing repeatable sweep job", async () => {
    await initTaskReminders();
    await initTaskReminders();
    const jobs = await taskRemindersQueue.getRepeatableJobs();
    expect(jobs).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @dragons/api test queues`
Expected: fails on "`taskRemindersQueue` is not defined" / "`initTaskReminders` is not exported".

- [ ] **Step 3: Add queue + initializer**

In `apps/api/src/workers/queues.ts`, next to the other queue declarations, add:

```ts
export const taskRemindersQueue = new Queue("task-reminders", {
  prefix: "{bull}",
  connection: { url: env.REDIS_URL },
});
```

Below `initPushReceiptReconcile` (or the last `init*` function), add:

```ts
export async function initTaskReminders(): Promise<void> {
  const existing = await taskRemindersQueue.getRepeatableJobs();
  for (const job of existing) {
    await taskRemindersQueue.removeRepeatableByKey(job.key);
  }
  await taskRemindersQueue.add(
    "sweep",
    {},
    {
      jobId: "task-reminder-sweep-cron",
      repeat: { every: 15 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
  logger.info("Task reminder sweep scheduled (every 15m)");
}
```

Export both from the file — they must be importable from `workers/queues`.

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @dragons/api test queues`
Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/queues.ts apps/api/src/workers/queues.test.ts
git commit -m "feat(api): add task reminders queue + 15-min sweep initializer"
```

---

## Task 12: Task reminder sweep worker

**Files:**
- Create: `apps/api/src/workers/task-reminder.worker.ts`
- Create: `apps/api/src/workers/task-reminder.worker.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/workers/task-reminder.worker.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { db } from "../config/database";
import {
  boards,
  boardColumns,
  tasks,
  taskAssignees,
  domainEvents,
  user,
} from "@dragons/db/schema";
import { runTaskReminderSweep } from "./task-reminder.worker";

async function setup(options: { dueDate: Date; isDoneColumn?: boolean; hasAssignee?: boolean }) {
  const [board] = await db.insert(boards).values({ name: "B" }).returning();
  const [col] = await db
    .insert(boardColumns)
    .values({
      boardId: board!.id,
      name: "Col",
      position: 0,
      isDoneColumn: options.isDoneColumn ?? false,
    })
    .returning();
  const [u] = await db
    .insert(user)
    .values({ id: `u-${Date.now()}-${Math.random()}`, email: `x${Date.now()}@t.local`, name: "A", emailVerified: true, role: "admin" })
    .returning();
  const [task] = await db
    .insert(tasks)
    .values({
      boardId: board!.id,
      columnId: col!.id,
      title: "Due Soon",
      dueDate: options.dueDate.toISOString().slice(0, 10),
    })
    .returning();
  if (options.hasAssignee !== false) {
    await db.insert(taskAssignees).values({ taskId: task!.id, userId: u!.id, assignedBy: u!.id });
  }
  return { taskId: task!.id, userId: u!.id, boardId: board!.id };
}

describe("runTaskReminderSweep", () => {
  beforeEach(async () => {
    await db.delete(domainEvents);
    await db.delete(taskAssignees);
    await db.delete(tasks);
    await db.delete(boardColumns);
    await db.delete(boards);
    await db.delete(user);
  });

  it("emits task.due.reminder lead for tasks due within the next 24h", async () => {
    const dueIn20h = new Date(Date.now() + 20 * 60 * 60 * 1000);
    const { taskId, userId } = await setup({ dueDate: dueIn20h });

    await runTaskReminderSweep();

    const events = await db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.entityId, taskId));
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("task.due.reminder");
    const payload = events[0]!.payload as Record<string, unknown>;
    expect(payload.reminderKind).toBe("lead");
    expect(payload.assigneeUserIds).toEqual([userId]);
  });

  it("marks leadReminderSentAt so the sweep does not re-emit", async () => {
    const dueIn20h = new Date(Date.now() + 20 * 60 * 60 * 1000);
    const { taskId } = await setup({ dueDate: dueIn20h });

    await runTaskReminderSweep();
    await runTaskReminderSweep();

    const events = await db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.entityId, taskId));
    expect(events).toHaveLength(1);

    const [row] = await db.select({ at: tasks.leadReminderSentAt }).from(tasks).where(eq(tasks.id, taskId));
    expect(row!.at).not.toBeNull();
  });

  it("skips tasks whose column is flagged isDoneColumn", async () => {
    const dueIn20h = new Date(Date.now() + 20 * 60 * 60 * 1000);
    const { taskId } = await setup({ dueDate: dueIn20h, isDoneColumn: true });

    await runTaskReminderSweep();

    const events = await db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.entityId, taskId));
    expect(events).toHaveLength(0);
  });

  it("skips tasks with no assignees", async () => {
    const dueIn20h = new Date(Date.now() + 20 * 60 * 60 * 1000);
    const { taskId } = await setup({ dueDate: dueIn20h, hasAssignee: false });

    await runTaskReminderSweep();

    const events = await db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.entityId, taskId));
    expect(events).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm --filter @dragons/api test task-reminder.worker`
Expected: tests fail — `runTaskReminderSweep` does not exist.

- [ ] **Step 3: Implement the worker**

Create `apps/api/src/workers/task-reminder.worker.ts`:

```ts
import { Worker, type Job } from "bullmq";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../config/database";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  boardColumns,
  boards,
  tasks,
  taskAssignees,
} from "@dragons/db/schema";
import { publishDomainEvent } from "../services/events/event-publisher";
import type { EventType } from "@dragons/shared";

const log = logger.child({ service: "task-reminder-worker" });

interface TaskReminderRow {
  id: number;
  boardId: number;
  boardName: string;
  title: string;
  dueDate: string | null;
}

async function loadLeadCandidates(): Promise<TaskReminderRow[]> {
  const leadEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const now = new Date();
  return await db
    .select({
      id: tasks.id,
      boardId: tasks.boardId,
      boardName: boards.name,
      title: tasks.title,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .innerJoin(boardColumns, eq(tasks.columnId, boardColumns.id))
    .innerJoin(boards, eq(tasks.boardId, boards.id))
    .where(
      and(
        sql`${tasks.dueDate} IS NOT NULL`,
        sql`${tasks.dueDate}::timestamptz <= ${leadEnd}`,
        sql`${tasks.dueDate}::timestamptz >= ${now}`,
        isNull(tasks.leadReminderSentAt),
        eq(boardColumns.isDoneColumn, false),
      ),
    );
}

async function loadDayOfCandidates(): Promise<TaskReminderRow[]> {
  const now = new Date();
  if (now.getUTCHours() < 8) return [];
  const todayStr = now.toISOString().slice(0, 10);
  return await db
    .select({
      id: tasks.id,
      boardId: tasks.boardId,
      boardName: boards.name,
      title: tasks.title,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .innerJoin(boardColumns, eq(tasks.columnId, boardColumns.id))
    .innerJoin(boards, eq(tasks.boardId, boards.id))
    .where(
      and(
        eq(tasks.dueDate, todayStr),
        isNull(tasks.dueReminderSentAt),
        eq(boardColumns.isDoneColumn, false),
      ),
    );
}

async function loadAssigneeIds(taskId: number): Promise<string[]> {
  const rows = await db
    .select({ userId: taskAssignees.userId })
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, taskId));
  return rows.map((r) => r.userId);
}

async function emitAndMark(task: TaskReminderRow, kind: "lead" | "day_of"): Promise<void> {
  const assigneeUserIds = await loadAssigneeIds(task.id);
  if (assigneeUserIds.length === 0) return;

  await db.transaction(async (tx) => {
    // publishDomainEvent inserts inside the tx; the outbox poller picks
    // up the row after commit — do not call enqueueDomainEvent here.
    await publishDomainEvent(
      {
        type: "task.due.reminder" as EventType,
        source: "sync",
        entityType: "task",
        entityId: task.id,
        entityName: task.title,
        deepLinkPath: `/admin/boards/${task.boardId}?task=${task.id}`,
        payload: {
          taskId: task.id,
          boardId: task.boardId,
          boardName: task.boardName,
          title: task.title,
          dueDate: task.dueDate ?? "",
          reminderKind: kind,
          assigneeUserIds,
        },
      },
      tx,
    );

    const updates =
      kind === "lead"
        ? { leadReminderSentAt: new Date() }
        : { dueReminderSentAt: new Date() };
    await tx.update(tasks).set(updates).where(eq(tasks.id, task.id));
  });
}

export async function runTaskReminderSweep(): Promise<{ lead: number; dayOf: number }> {
  let lead = 0;
  let dayOf = 0;

  const leadRows = await loadLeadCandidates();
  for (const row of leadRows) {
    try {
      await emitAndMark(row, "lead");
      lead++;
    } catch (err) {
      log.warn({ err, taskId: row.id }, "Failed to emit task.due.reminder (lead)");
    }
  }

  const dayOfRows = await loadDayOfCandidates();
  for (const row of dayOfRows) {
    try {
      await emitAndMark(row, "day_of");
      dayOf++;
    } catch (err) {
      log.warn({ err, taskId: row.id }, "Failed to emit task.due.reminder (day_of)");
    }
  }

  if (lead > 0 || dayOf > 0) {
    log.info({ lead, dayOf }, "Task reminder sweep emitted events");
  }

  return { lead, dayOf };
}

export const taskReminderWorker = new Worker(
  "task-reminders",
  async (_job: Job) => runTaskReminderSweep(),
  {
    prefix: "{bull}",
    connection: { url: env.REDIS_URL },
    concurrency: 1,
  },
);

/* v8 ignore next 3 */
taskReminderWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Task reminder sweep failed");
});
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `pnpm --filter @dragons/api test task-reminder.worker`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/task-reminder.worker.ts apps/api/src/workers/task-reminder.worker.test.ts
git commit -m "feat(api): task reminder sweep worker with lead + day-of reminders"
```

---

## Task 13: Wire task reminder init into boot

**Files:**
- Modify: `apps/api/src/workers/index.ts`
- Modify: `apps/api/src/workers/index.test.ts`

- [ ] **Step 1: Write the failing test**

Open `apps/api/src/workers/index.test.ts`. Find the describe block that exercises `startWorkers` / boot initialization. Append a test like:

```ts
it("initializes task reminder repeatable job", async () => {
  await startWorkers();
  const jobs = await taskRemindersQueue.getRepeatableJobs();
  expect(jobs.some((j) => j.id === "task-reminder-sweep-cron")).toBe(true);
});
```

Adjust the helper setup/teardown to match the existing describe block patterns. Import `taskRemindersQueue` at the top of the test file.

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @dragons/api test workers/index`
Expected: new test fails — initialization is not wired.

- [ ] **Step 3: Wire init call into `workers/index.ts`**

Find the boot sequence (the function that calls `initScheduledJobs`, `initPushReceiptReconcile`, etc. — likely called `startWorkers` or similar). Add a call to `initTaskReminders()` alongside the others.

Example:

```ts
import {
  syncQueue,
  domainEventsQueue,
  pushReceiptQueue,
  taskRemindersQueue,
  initScheduledJobs,
  initPushReceiptReconcile,
  initTaskReminders,
} from "./queues";

// ... inside startWorkers (or equivalent):
await initScheduledJobs();
await initPushReceiptReconcile();
await initTaskReminders();
```

Also import the worker module so its `new Worker(...)` runs on boot:

```ts
import "./task-reminder.worker";
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @dragons/api test workers/index`
Expected: test passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/index.ts apps/api/src/workers/index.test.ts
git commit -m "feat(api): wire task reminder worker into boot sequence"
```

---

## Task 14: Shared user-toggleable event catalog

**Files:**
- Create: `packages/shared/src/notification-events.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the catalog**

Create `packages/shared/src/notification-events.ts`:

```ts
export const USER_TOGGLEABLE_EVENTS = [
  { type: "task.assigned", labelKey: "events.taskAssigned" },
  { type: "task.unassigned", labelKey: "events.taskUnassigned" },
  { type: "task.comment.added", labelKey: "events.taskComment" },
  { type: "task.due.reminder", labelKey: "events.taskDueReminder" },
] as const;

export type UserToggleableEventType = (typeof USER_TOGGLEABLE_EVENTS)[number]["type"];

export function isUserToggleableEventType(value: string): value is UserToggleableEventType {
  return USER_TOGGLEABLE_EVENTS.some((e) => e.type === value);
}
```

- [ ] **Step 2: Re-export from `packages/shared/src/index.ts`**

Add to the exports block:

```ts
export * from "./notification-events";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @dragons/shared typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/notification-events.ts packages/shared/src/index.ts
git commit -m "feat(shared): add user-toggleable notification event catalog"
```

---

## Task 15: User notification preferences service + routes

**Files:**
- Create: `apps/api/src/services/notifications/user-preferences.service.ts`
- Create: `apps/api/src/services/notifications/user-preferences.service.test.ts`
- Modify: `apps/api/src/routes/admin/notification.routes.ts`
- Modify: `apps/api/src/routes/admin/notification.routes.test.ts`
- Modify: `apps/api/src/routes/admin/notification.schemas.ts`

- [ ] **Step 1: Write the failing service tests**

Create `apps/api/src/services/notifications/user-preferences.service.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../config/database";
import { userNotificationPreferences, user } from "@dragons/db/schema";
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} from "./user-preferences.service";

async function makeUser(id: string) {
  await db.insert(user).values({
    id,
    email: `${id}@t.local`,
    name: id,
    emailVerified: true,
    role: "admin",
  });
}

describe("user-preferences.service", () => {
  beforeEach(async () => {
    await db.delete(userNotificationPreferences);
    await db.delete(user);
  });

  it("returns defaults when no preference row exists", async () => {
    await makeUser("u1");
    const result = await getUserNotificationPreferences("u1");
    expect(result).toEqual({ mutedEventTypes: [], locale: "de" });
  });

  it("returns stored preferences when row exists", async () => {
    await makeUser("u1");
    await db
      .insert(userNotificationPreferences)
      .values({ userId: "u1", locale: "en", mutedEventTypes: ["task.assigned"] });

    const result = await getUserNotificationPreferences("u1");
    expect(result).toEqual({ mutedEventTypes: ["task.assigned"], locale: "en" });
  });

  it("creates a row on first update", async () => {
    await makeUser("u1");
    await updateUserNotificationPreferences("u1", {
      mutedEventTypes: ["task.comment.added"],
      locale: "en",
    });
    const [row] = await db
      .select()
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, "u1"));
    expect(row?.mutedEventTypes).toEqual(["task.comment.added"]);
    expect(row?.locale).toBe("en");
  });

  it("preserves existing fields when PATCH omits them", async () => {
    await makeUser("u1");
    await updateUserNotificationPreferences("u1", { locale: "en", mutedEventTypes: [] });
    await updateUserNotificationPreferences("u1", { mutedEventTypes: ["task.assigned"] });

    const result = await getUserNotificationPreferences("u1");
    expect(result).toEqual({ mutedEventTypes: ["task.assigned"], locale: "en" });
  });

  it("rejects unknown event types in mutedEventTypes", async () => {
    await makeUser("u1");
    await expect(
      updateUserNotificationPreferences("u1", { mutedEventTypes: ["bogus.event"] }),
    ).rejects.toThrow(/unknown event type/i);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm --filter @dragons/api test user-preferences.service`
Expected: tests fail — module does not exist.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/services/notifications/user-preferences.service.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "../../config/database";
import { userNotificationPreferences } from "@dragons/db/schema";
import { isUserToggleableEventType } from "@dragons/shared";

export interface UserNotificationPreferences {
  mutedEventTypes: string[];
  locale: "de" | "en";
}

export interface UserNotificationPreferencesPatch {
  mutedEventTypes?: string[];
  locale?: "de" | "en";
}

export async function getUserNotificationPreferences(
  userId: string,
): Promise<UserNotificationPreferences> {
  const [row] = await db
    .select({
      mutedEventTypes: userNotificationPreferences.mutedEventTypes,
      locale: userNotificationPreferences.locale,
    })
    .from(userNotificationPreferences)
    .where(eq(userNotificationPreferences.userId, userId))
    .limit(1);
  if (!row) return { mutedEventTypes: [], locale: "de" };
  return {
    mutedEventTypes: row.mutedEventTypes,
    locale: row.locale === "en" ? "en" : "de",
  };
}

export async function updateUserNotificationPreferences(
  userId: string,
  patch: UserNotificationPreferencesPatch,
): Promise<UserNotificationPreferences> {
  if (patch.mutedEventTypes) {
    for (const ev of patch.mutedEventTypes) {
      if (!isUserToggleableEventType(ev)) {
        throw new Error(`Unknown event type: ${ev}`);
      }
    }
  }

  const setFields: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.mutedEventTypes !== undefined) setFields.mutedEventTypes = patch.mutedEventTypes;
  if (patch.locale !== undefined) setFields.locale = patch.locale;

  await db
    .insert(userNotificationPreferences)
    .values({
      userId,
      mutedEventTypes: patch.mutedEventTypes ?? [],
      locale: patch.locale ?? "de",
    })
    .onConflictDoUpdate({
      target: userNotificationPreferences.userId,
      set: setFields,
    });

  return getUserNotificationPreferences(userId);
}
```

- [ ] **Step 4: Run service tests, verify they pass**

Run: `pnpm --filter @dragons/api test user-preferences.service`
Expected: all 5 tests pass.

- [ ] **Step 5: Add Zod schema for the route body**

Append to `apps/api/src/routes/admin/notification.schemas.ts`:

```ts
export const notificationPreferencesBodySchema = z.object({
  mutedEventTypes: z.array(z.string()).optional(),
  locale: z.enum(["de", "en"]).optional(),
});
```

If the file does not yet import `z`, add `import { z } from "zod";`.

- [ ] **Step 6: Write the failing route tests**

Append to `apps/api/src/routes/admin/notification.routes.test.ts`:

```ts
describe("GET /admin/notifications/preferences", () => {
  it("returns defaults for a user with no row", async () => {
    const { authCookie } = await makeAuthedUser({ id: "prefs-1" });
    const res = await app.request("/admin/notifications/preferences", { headers: { Cookie: authCookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mutedEventTypes: [], locale: "de" });
  });
});

describe("PATCH /admin/notifications/preferences", () => {
  it("updates the caller's preferences", async () => {
    const { authCookie } = await makeAuthedUser({ id: "prefs-2" });
    const res = await app.request("/admin/notifications/preferences", {
      method: "PATCH",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ mutedEventTypes: ["task.assigned"], locale: "en" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mutedEventTypes: ["task.assigned"], locale: "en" });
  });

  it("returns 400 for unknown event type", async () => {
    const { authCookie } = await makeAuthedUser({ id: "prefs-3" });
    const res = await app.request("/admin/notifications/preferences", {
      method: "PATCH",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ mutedEventTypes: ["bogus.event"] }),
    });
    expect(res.status).toBe(400);
  });
});
```

If `makeAuthedUser` doesn't exist in the test file, find an equivalent helper (e.g., `createAuthedRequest`) in the existing test setup — every `*.routes.test.ts` file in `admin/` already uses one. Reuse it verbatim.

- [ ] **Step 7: Run route tests, verify they fail**

Run: `pnpm --filter @dragons/api test notification.routes`
Expected: 3 new tests fail — route does not exist.

- [ ] **Step 8: Add routes**

In `apps/api/src/routes/admin/notification.routes.ts`, add the two handlers after the existing routes, before `export { notificationRoutes };`:

```ts
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} from "../../services/notifications/user-preferences.service";
import { notificationPreferencesBodySchema } from "./notification.schemas";

// GET /admin/notifications/preferences - fetch caller's notification preferences
notificationRoutes.get(
  "/notifications/preferences",
  describeRoute({
    description: "Get the caller's notification preferences",
    tags: ["Notifications"],
    responses: { 200: { description: "Success" } },
  }),
  async (c) => {
    const userId = c.get("user").id;
    const prefs = await getUserNotificationPreferences(userId);
    return c.json(prefs);
  },
);

// PATCH /admin/notifications/preferences - update caller's notification preferences
notificationRoutes.patch(
  "/notifications/preferences",
  describeRoute({
    description: "Update the caller's notification preferences",
    tags: ["Notifications"],
    responses: {
      200: { description: "Updated" },
      400: { description: "Invalid body" },
    },
  }),
  async (c) => {
    const userId = c.get("user").id;
    const body = notificationPreferencesBodySchema.parse(await c.req.json());
    try {
      const prefs = await updateUserNotificationPreferences(userId, body);
      return c.json(prefs);
    } catch (err) {
      if (err instanceof Error && /unknown event type/i.test(err.message)) {
        return c.json({ error: err.message, code: "INVALID_EVENT_TYPE" }, 400);
      }
      throw err;
    }
  },
);
```

Note: these routes do NOT use `settingsUpdate` — any authenticated user can read/update their own preferences. Authentication is already required by the parent `/admin/*` middleware.

- [ ] **Step 9: Run route tests, verify they pass**

Run: `pnpm --filter @dragons/api test notification.routes`
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/services/notifications/user-preferences.service.ts apps/api/src/services/notifications/user-preferences.service.test.ts apps/api/src/routes/admin/notification.routes.ts apps/api/src/routes/admin/notification.routes.test.ts apps/api/src/routes/admin/notification.schemas.ts
git commit -m "feat(api): add user notification preferences routes and service"
```

---

## Task 16: i18n strings

**Files:**
- Modify: `apps/web/src/messages/en.json`
- Modify: `apps/web/src/messages/de.json`

- [ ] **Step 1: Add English strings**

In `apps/web/src/messages/en.json`, under the top-level `"settings"` key (create `"myNotifications"` as a sibling of existing settings keys), add:

```json
    "myNotifications": {
      "cardTitle": "Your notifications",
      "cardDescription": "Choose which events you want to be notified about.",
      "events": {
        "taskAssigned": "You're assigned to a task",
        "taskUnassigned": "You're removed from a task",
        "taskComment": "Someone comments on your task",
        "taskDueReminder": "A task is due soon"
      },
      "language": "Language",
      "localeDe": "Deutsch",
      "localeEn": "English",
      "refereeNote": "Referee-slot notifications are managed separately on the Referee settings page.",
      "saveSuccess": "Notification preferences saved",
      "saveError": "Could not save notification preferences"
    }
```

- [ ] **Step 2: Add German strings**

In `apps/web/src/messages/de.json`, mirror the structure:

```json
    "myNotifications": {
      "cardTitle": "Deine Benachrichtigungen",
      "cardDescription": "Wähle, über welche Ereignisse du benachrichtigt werden möchtest.",
      "events": {
        "taskAssigned": "Du wurdest einer Aufgabe zugewiesen",
        "taskUnassigned": "Du wurdest von einer Aufgabe entfernt",
        "taskComment": "Jemand kommentiert deine Aufgabe",
        "taskDueReminder": "Eine Aufgabe ist bald fällig"
      },
      "language": "Sprache",
      "localeDe": "Deutsch",
      "localeEn": "English",
      "refereeNote": "Schiri-Einsatzbenachrichtigungen werden auf der Schiri-Einstellungsseite verwaltet.",
      "saveSuccess": "Benachrichtigungseinstellungen gespeichert",
      "saveError": "Einstellungen konnten nicht gespeichert werden"
    }
```

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/web/src/messages/en.json', 'utf8')); JSON.parse(require('fs').readFileSync('apps/web/src/messages/de.json', 'utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/messages/en.json apps/web/src/messages/de.json
git commit -m "feat(web): i18n strings for user notification preferences"
```

---

## Task 17: "My Notifications" settings card component

**Files:**
- Create: `apps/web/src/components/admin/my-notifications-card.tsx`
- Create: `apps/web/src/components/admin/my-notifications-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/admin/my-notifications-card.test.tsx`:

```tsx
// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { MyNotificationsCard } from "./my-notifications-card";

const messages = {
  settings: {
    myNotifications: {
      cardTitle: "Your notifications",
      cardDescription: "Choose which events…",
      events: {
        taskAssigned: "Assigned",
        taskUnassigned: "Unassigned",
        taskComment: "Comment",
        taskDueReminder: "Due",
      },
      language: "Language",
      localeDe: "Deutsch",
      localeEn: "English",
      refereeNote: "Referee note",
      saveSuccess: "Saved",
      saveError: "Error",
    },
  },
};

const mocks = vi.hoisted(() => ({
  fetchAPI: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchAPI: mocks.fetchAPI,
  APIError: class APIError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("MyNotificationsCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders one checkbox per toggleable event", async () => {
    mocks.fetchAPI.mockResolvedValue({ mutedEventTypes: [], locale: "en" });
    render(wrap(<MyNotificationsCard />));
    await waitFor(() => expect(screen.getByText("Assigned")).toBeInTheDocument());
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText("Comment")).toBeInTheDocument();
    expect(screen.getByText("Due")).toBeInTheDocument();
  });

  it("shows checkboxes as checked for events NOT in mutedEventTypes", async () => {
    mocks.fetchAPI.mockResolvedValue({
      mutedEventTypes: ["task.assigned"],
      locale: "en",
    });
    render(wrap(<MyNotificationsCard />));
    await waitFor(() => expect(screen.getByLabelText("Assigned")).not.toBeChecked());
    expect(screen.getByLabelText("Unassigned")).toBeChecked();
  });

  it("sends PATCH when toggling a checkbox", async () => {
    mocks.fetchAPI.mockResolvedValueOnce({ mutedEventTypes: [], locale: "en" });
    mocks.fetchAPI.mockResolvedValueOnce({
      mutedEventTypes: ["task.assigned"],
      locale: "en",
    });
    render(wrap(<MyNotificationsCard />));
    await waitFor(() => expect(screen.getByLabelText("Assigned")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Assigned"));

    await waitFor(() => {
      expect(mocks.fetchAPI).toHaveBeenLastCalledWith("/admin/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify({ mutedEventTypes: ["task.assigned"], locale: "en" }),
      });
    });
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @dragons/web test my-notifications-card`
Expected: fails — component doesn't exist.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/admin/my-notifications-card.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { fetchAPI } from "@/lib/api";
import { USER_TOGGLEABLE_EVENTS } from "@dragons/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dragons/ui/components/card";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Label } from "@dragons/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";

interface Prefs {
  mutedEventTypes: string[];
  locale: "de" | "en";
}

export function MyNotificationsCard() {
  const t = useTranslations("settings.myNotifications");
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    fetchAPI<Prefs>("/admin/notifications/preferences").then(setPrefs).catch(() => {
      toast.error(t("saveError"));
    });
  }, [t]);

  async function patch(next: Prefs) {
    const previous = prefs;
    setPrefs(next);
    try {
      const saved = await fetchAPI<Prefs>("/admin/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify(next),
      });
      setPrefs(saved);
      toast.success(t("saveSuccess"));
    } catch {
      setPrefs(previous);
      toast.error(t("saveError"));
    }
  }

  function toggleEvent(eventType: string, nextEnabled: boolean) {
    if (!prefs) return;
    const muted = new Set(prefs.mutedEventTypes);
    if (nextEnabled) muted.delete(eventType);
    else muted.add(eventType);
    void patch({ ...prefs, mutedEventTypes: [...muted] });
  }

  function changeLocale(locale: "de" | "en") {
    if (!prefs) return;
    void patch({ ...prefs, locale });
  }

  if (!prefs) return null;

  const muted = new Set(prefs.mutedEventTypes);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cardTitle")}</CardTitle>
        <CardDescription>{t("cardDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {USER_TOGGLEABLE_EVENTS.map((ev) => {
            const checked = !muted.has(ev.type);
            const label = t(ev.labelKey);
            return (
              <div key={ev.type} className="flex items-center gap-2">
                <Checkbox
                  id={`evt-${ev.type}`}
                  checked={checked}
                  onCheckedChange={(v) => toggleEvent(ev.type, Boolean(v))}
                />
                <Label htmlFor={`evt-${ev.type}`}>{label}</Label>
              </div>
            );
          })}
        </div>

        <div className="space-y-1">
          <Label>{t("language")}</Label>
          <Select value={prefs.locale} onValueChange={(v) => changeLocale(v as "de" | "en")}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="de">{t("localeDe")}</SelectItem>
              <SelectItem value="en">{t("localeEn")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-muted-foreground text-sm">{t("refereeNote")}</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @dragons/web test my-notifications-card`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/admin/my-notifications-card.tsx apps/web/src/components/admin/my-notifications-card.test.tsx
git commit -m "feat(web): my notifications settings card"
```

---

## Task 18: Mount the card on the settings page

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/settings/notifications/page.tsx`

- [ ] **Step 1: Read the current page**

Read the file. Current contents:

```tsx
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { PushTestCard } from "@/components/admin/push-test-card";

export default async function NotificationsSettingsPage() {
  const session = await getServerSession();
  if (!can(session?.user ?? null, "settings", "update")) notFound();

  const t = await getTranslations("settings.pushTest");

  return (
    <div className="space-y-6">
      <PageHeader title={t("pageTitle")} subtitle={t("pageDescription")} />
      <PushTestCard />
    </div>
  );
}
```

- [ ] **Step 2: Render the card above the admin section**

Replace the file with:

```tsx
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { can } from "@dragons/shared";
import { getServerSession } from "@/lib/auth-server";
import { PageHeader } from "@/components/admin/shared/page-header";
import { PushTestCard } from "@/components/admin/push-test-card";
import { MyNotificationsCard } from "@/components/admin/my-notifications-card";

export default async function NotificationsSettingsPage() {
  const session = await getServerSession();
  if (!session?.user) notFound();

  const t = await getTranslations("settings.pushTest");
  const isAdmin = can(session.user, "settings", "update");

  return (
    <div className="space-y-6">
      <PageHeader title={t("pageTitle")} subtitle={t("pageDescription")} />
      <MyNotificationsCard />
      {isAdmin ? <PushTestCard /> : null}
    </div>
  );
}
```

The page now renders for every authenticated user (not only admin) — the "my notifications" card works for anyone, and the admin-only `PushTestCard` is hidden for non-admins.

- [ ] **Step 3: Run typecheck + lint**

Run: `pnpm --filter @dragons/web typecheck`
Expected: no errors.

Run: `pnpm --filter @dragons/web lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/admin/settings/notifications/page.tsx
git commit -m "feat(web): mount my-notifications card on notifications settings page"
```

---

## Task 19: Documentation updates

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add new event types to the domain-events section**

Find the existing event type documentation (`AGENTS.md` — the notification pipeline / domain events section). Add to the event type list:

```markdown
- `task.assigned` — emitted when a user is added to a task's assignees
- `task.unassigned` — emitted when a user is removed from a task's assignees
- `task.comment.added` — emitted when a comment is posted on a task
- `task.due.reminder` — emitted 24h before and on the morning of a task's due date (by the task reminder worker)
```

- [ ] **Step 2: Add the task reminder worker to the workers section**

In the workers/queues section, add an entry:

```markdown
- `task-reminders` queue — repeatable sweep every 15 minutes. The `task-reminder.worker.ts` loads tasks whose due date is within 24h (or is today past 08:00 UTC), whose column is not flagged `isDoneColumn`, and whose corresponding reminder has not yet fired. Marks the timestamp and emits a `task.due.reminder` domain event per eligible task.
```

- [ ] **Step 3: Add the two preferences endpoints**

In the Admin – Notifications endpoint table, replace any stale rows for preferences with:

```markdown
| GET | `/admin/notifications/preferences` | Get the calling user's own notification preferences (locale + muted event types). Any authenticated user may call this. |
| PATCH | `/admin/notifications/preferences` | Update the calling user's own notification preferences. Body: `{ mutedEventTypes?: string[], locale?: "de" \| "en" }`. Rejects event types not in the shared catalog. |
```

- [ ] **Step 4: Note the deprecated columns in the data model section**

In the data model table for `userNotificationPreferences`, remove mentions of `notifyOnTaskAssigned`, `notifyOnTaskComment`, `notifyOnBookingNeedsAction` and note:

```markdown
Per-event opt-outs live in the `mutedEventTypes: text[]` column. The user-toggleable event catalog is in `packages/shared/src/notification-events.ts`.
```

- [ ] **Step 5: Run anti-slop check**

Run: `pnpm check:ai-slop`
Expected: `AI slop check passed.`

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md for task events, reminder worker, prefs endpoints"
```

---

## Task 20: Final verification

**Files:** none — verification only.

- [ ] **Step 1: Full typecheck across workspace**

Run: `pnpm typecheck`
Expected: all packages pass.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Full test run for API**

Run: `pnpm --filter @dragons/api test`
Expected: all tests pass. Compare the passing count against the baseline (was 2420) — the new count should be strictly larger with no regressions.

- [ ] **Step 4: Full test run for web**

Run: `pnpm --filter @dragons/web test`
Expected: all tests pass.

- [ ] **Step 5: Coverage check for API**

Run: `pnpm --filter @dragons/api coverage`
Expected: thresholds met (90% branches, 95% functions/lines/statements).

- [ ] **Step 6: AI slop check**

Run: `pnpm check:ai-slop`
Expected: passes.

- [ ] **Step 7: No commit — this task is verification only.**

---

## Remember

- **TDD**: every task writes the failing test before the implementation, except for pure schema/shared-type changes where the tsc pass is the verification.
- **DRY**: reuse existing helpers (`buildDomainEvent`, `insertDomainEvent`, `enqueueDomainEvent`, `loadMutedEventTypes`) rather than duplicating logic.
- **YAGNI**: no watchers, no mentions, no digest — those are deferred per spec.
- **Frequent commits**: one commit per task, clear messages, no trailers that credit AI.
- **Tests co-located** with source, matching the repo convention.
- **No `any`** — strict types everywhere.
- **Anti-slop**: no banned phrases in docs; direct specific prose.

---

## Checklist against the spec

- [x] New event types (`task.assigned`, `task.unassigned`, `task.comment.added`, `task.due.reminder`) → Task 1 + Task 2
- [x] Payload interfaces → Task 1
- [x] Deep link path `/admin/boards/<boardId>?task=<taskId>` → Tasks 8, 9, 10, 12
- [x] Urgency classification (task.assigned date-dependent, rest as specified) → Task 2
- [x] Emission sites (createTask, updateTask diff, addAssignee, removeAssignee, addComment, reminder worker) → Tasks 8, 9, 10, 12
- [x] `user:<id>` recipient convention → Task 5 (already in recipient-resolver, so only role-defaults extension needed)
- [x] `DefaultNotification` `audience: "user"` variant → Task 5
- [x] Push-eligibility → Task 5
- [x] `loadMutedEventTypes` supports `user:*` recipients → Task 6
- [x] Locale lookup for user recipients → Task 6
- [x] Reminder timestamps reset on dueDate change → Task 9
- [x] `is_done_column` skip in reminder worker → Task 12
- [x] 15-min cron sweep queue + init → Task 11
- [x] Reminder sweep worker (lead + day-of, timestamp dedupe, no-assignee skip) → Task 12
- [x] Boot wiring → Task 13
- [x] Template renderer (all 5 variants × 2 locales) → Task 4
- [x] Legacy `notifyTask*` helpers deleted → Task 7
- [x] User-toggleable event catalog in shared → Task 14
- [x] GET / PATCH `/admin/notifications/preferences` → Task 15
- [x] Preferences UI card + i18n → Tasks 16, 17, 18
- [x] Docs updates → Task 19
- [x] Final verification → Task 20

No gaps.
