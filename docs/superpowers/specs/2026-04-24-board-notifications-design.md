# Board Notifications Design

**Date:** 2026-04-24
**Status:** Approved for planning
**Goal:** Notify users when tasks they care about are assigned, unassigned, commented on, or due soon — using the existing domain-event notification pipeline. Each user controls which event types they receive.

## Context

The kanban board shipped in April 2026 has no notifications. Users miss assignments and comments unless they actively check the board. The federation-sync notification pipeline (domain events → outbox → BullMQ → channel adapters → in-app + push) is already in production for match, referee, booking, and override events. This design extends that pipeline with a fourth entity type, `task`, reusing every existing layer.

Non-goals for this plan: task watchers (subscribing to a task you're not on), @mentions in comments, digest rollups of task activity, archive events, WIP-limit alerts. Those were deferred in the kanban spec and remain deferred here.

## Scope

Four new event types, user-controlled mutes, both channels (in-app + push) by default:

| Event | Emitted when | Recipients |
|---|---|---|
| `task.assigned` | A user is added to a task's assignees (create, update, or dedicated add endpoint) | The newly-added assignee(s) |
| `task.unassigned` | A user is removed from a task's assignees | The removed assignee(s) |
| `task.comment.added` | Someone comments on a task | Current assignees minus the commenter |
| `task.due.reminder` | 24h before due date (lead) and on the due date morning (day-of) | Current assignees |

## Architecture

```
task mutation (assign / unassign / comment)          cron sweep (every 15 min)
          │                                                   │
          │  inside the same db.transaction                   │ emits task.due.reminder
          ▼                                                   ▼
   insertDomainEvent(tx) ──────────┬───────────────────────────
                                   ▼
                    domain_events table (outbox)
                                   │
                    outbox poller enqueues to BullMQ
                                   ▼
                           event.worker → processEvent()
                                   │
                          ┌────────┴────────┐
                          ▼                 ▼
                   role-defaults     watch rules (unchanged)
                          │
                          ▼
               recipient = user:<id>
                          │
                    mute-array check
                          │
                   ┌──────┴──────┐
                   ▼             ▼
               in_app log    push (Expo)
```

**Reused unchanged:** outbox poller, event worker, template index, in-app adapter, push adapter, Expo client, digest buffer, watch-rule engine, recipient resolver (`user:<id>` branch already exists).

**New surface area:** 4 event types, 1 template file, 1 role-defaults branch, 1 scheduled worker, 2 task columns, 1 board-column flag, 1 user-prefs API, 1 settings-page card.

## Event vocabulary

Additions to `packages/shared/src/domain-events.ts`:

```ts
export type EventEntityType = "match" | "booking" | "referee" | "task";

// inside EVENT_TYPES
TASK_ASSIGNED: "task.assigned",
TASK_UNASSIGNED: "task.unassigned",
TASK_COMMENT_ADDED: "task.comment.added",
TASK_DUE_REMINDER: "task.due.reminder",
```

Payload interfaces:

```ts
interface TaskAssignedPayload {
  taskId: number;
  boardId: number;
  boardName: string;
  title: string;
  assigneeUserIds: string[];   // recipients for this emission
  assignedBy: string;          // userId of caller
  dueDate: string | null;
  priority: "low" | "normal" | "high";
}

interface TaskUnassignedPayload {
  taskId: number;
  boardId: number;
  boardName: string;
  title: string;
  unassignedUserIds: string[];
  unassignedBy: string;
}

interface TaskCommentAddedPayload {
  taskId: number;
  boardId: number;
  boardName: string;
  title: string;
  commentId: number;
  authorId: string;
  authorName: string;
  bodyPreview: string;           // first 140 chars
  recipientUserIds: string[];    // current assignees minus author
}

interface TaskDueReminderPayload {
  taskId: number;
  boardId: number;
  boardName: string;
  title: string;
  dueDate: string;
  reminderKind: "lead" | "day_of";
  assigneeUserIds: string[];
}
```

Common event fields:

- `entityType = "task"`, `entityId = taskId`, `entityName = title`
- `deepLinkPath = "/admin/boards/${boardId}?task=${taskId}"`
- `source = "manual"` for service-triggered events, `"sync"` for the reminder worker (matches the existing convention)

Urgency classification (`apps/api/src/services/events/event-types.ts`):

- `task.assigned` — immediate if `dueDate` is within 7 days, else routine
- `task.unassigned` — routine
- `task.comment.added` — routine
- `task.due.reminder` — immediate (both lead and day-of)

## Emission sites

All emissions go through `buildDomainEvent` → `insertDomainEvent(tx)` inside the existing service transactions. Failures are caught and logged, never propagated to the HTTP response.

| Service method | Event | Condition |
|---|---|---|
| `createTask` | `task.assigned` | Emitted once if initial `assigneeIds` non-empty, with all IDs as recipients |
| `updateTask` | `task.assigned` | Only for userIds that are in the new set but not the old set |
| `updateTask` | `task.unassigned` | Only for userIds that are in the old set but not the new set |
| `addAssignee` | `task.assigned` | Recipient = the one added userId |
| `removeAssignee` | `task.unassigned` | Recipient = the one removed userId |
| `addComment` | `task.comment.added` | Recipients = current assignees minus `authorId` |
| Reminder worker | `task.due.reminder` | See Scheduled reminders below |

`updateTask` computes the diff between old and new assignee sets inside the existing transaction. It emits zero, one, or two events depending on which direction changed.

## Recipient routing

`role-defaults.ts` adds a new branch for task events. Task events carry their recipient userIds directly in the payload, so routing is a direct lookup rather than an audience resolution:

```ts
const TASK_EVENTS = new Set([
  "task.assigned",
  "task.unassigned",
  "task.comment.added",
  "task.due.reminder",
]);

const TASK_RECIPIENT_FIELDS: Record<string, string> = {
  "task.assigned":      "assigneeUserIds",
  "task.unassigned":    "unassignedUserIds",
  "task.comment.added": "recipientUserIds",
  "task.due.reminder":  "assigneeUserIds",
};

if (TASK_EVENTS.has(eventType)) {
  const userIds = (payload[TASK_RECIPIENT_FIELDS[eventType]] as string[] | undefined) ?? [];
  for (const userId of userIds) {
    emit({ audience: "user", channel: "in_app", userId });
  }
}
```

`DefaultNotification` gets a new audience variant:

```ts
export interface DefaultNotification {
  audience: "admin" | "referee" | "user";
  channel: Channel;
  refereeId?: number;
  userId?: string;   // present when audience === "user"
}
```

`recipientId` construction in `notification-pipeline.ts`:

```ts
const recipientId = defaultNotif.refereeId
  ? `referee:${defaultNotif.refereeId}`
  : defaultNotif.userId
    ? `user:${defaultNotif.userId}`
    : `audience:${defaultNotif.audience}`;
```

`recipient-resolver.ts` already handles `user:<id>`; no change needed there.

All four task events are added to `PUSH_ELIGIBLE_EVENTS`. The existing `emit()` helper duplicates each in-app default into a parallel push default for eligible events, so each user receives both channels by default.

## Muting

`loadMutedEventTypes` in `notification-pipeline.ts` currently only loads preferences for `referee:*` recipients. It is extended to also handle `user:*` recipients: same table, same `mutedEventTypes` column, keyed by `userId`.

The existing generic `userNotificationPreferences.mutedEventTypes: text[]` column is the single source of truth. The three legacy boolean columns (`notifyOnTaskAssigned`, `notifyOnTaskComment`, `notifyOnBookingNeedsAction`) and their three helper functions in `notification.service.ts` are unused and removed in the same migration.

Default for every user is "all event types enabled". Opting out appends the event type to the array; opting back in removes it.

## Scheduled reminders

**Schema additions:**

```ts
// packages/db/src/schema/boards.ts — board_columns
isDoneColumn: boolean("is_done_column").notNull().default(false),

// packages/db/src/schema/tasks.ts — tasks
leadReminderSentAt: timestamp("lead_reminder_sent_at", { withTimezone: true }),
dueReminderSentAt: timestamp("due_reminder_sent_at", { withTimezone: true }),
```

**Queue:** new `task-reminders` queue in `apps/api/src/workers/queues.ts`, with `initTaskReminders()` registering a repeatable job `{ every: 15 * 60 * 1000 }` and `jobId: "task-reminder-sweep-cron"`. Wired into `workers/index.ts` boot sequence alongside `initScheduledJobs`, `initReferenceReminders`, `initPushReceiptReconcile`.

**Worker** (`apps/api/src/workers/task-reminder.worker.ts`): on each sweep, two queries.

*Lead query* — tasks due within the next 24 hours that haven't yet received their lead reminder, excluding tasks whose column is flagged `isDoneColumn`:

```sql
SELECT ... FROM tasks
INNER JOIN board_columns ON tasks.column_id = board_columns.id
WHERE tasks.due_date IS NOT NULL
  AND tasks.due_date <= now() + interval '24 hours'
  AND tasks.due_date >= now()
  AND tasks.lead_reminder_sent_at IS NULL
  AND board_columns.is_done_column = false
```

*Day-of query* — tasks due today where it's past 08:00 UTC (≈ 09:00–10:00 CET / 10:00–11:00 CEST; German-morning window without a timezone-per-user feature) and the day-of reminder hasn't fired:

```sql
SELECT ... FROM tasks
INNER JOIN board_columns ON tasks.column_id = board_columns.id
WHERE tasks.due_date IS NOT NULL
  AND date(tasks.due_date) = current_date
  AND extract(hour from now()) >= 8
  AND tasks.due_reminder_sent_at IS NULL
  AND board_columns.is_done_column = false
```

For each result row, `emitAndMark` runs inside a transaction:

1. Load assignee userIds (if empty, skip — nobody to notify).
2. Build and insert the `task.due.reminder` domain event with the appropriate `reminderKind`.
3. Set the matching timestamp column to `now()`.

**Reset logic:** when `updateTask` sets a new `dueDate` (including clearing it), both `leadReminderSentAt` and `dueReminderSentAt` are set to `NULL` in the same update, so reminders re-fire for the new date.

**Moving to done column:** when a task moves into a column with `isDoneColumn = true`, no cancellation is needed — the next sweep's query filters it out. No event fires.

Latency tradeoff: up to 15 minutes between the reminder threshold and the actual notification. Acceptable for this use case.

## Templates

New file `apps/api/src/services/notifications/templates/task.ts`, same shape as `match.ts` / `referee.ts`: single exported renderer dispatching on event type, returning `{ title, body }` or `null`.

Registered in `templates/index.ts`:

```ts
const result =
  renderMatchMessage(...) ??
  renderRefereeMessage(...) ??
  renderBookingMessage(...) ??
  renderOverrideMessage(...) ??
  renderTaskMessage(eventType, payload, entityName, locale);
```

Strings (de + en):

| Event | German title | German body | English title | English body |
|---|---|---|---|---|
| `task.assigned` | Neue Aufgabe: {title} | {assignedBy} hat dich einer Aufgabe auf {boardName} zugewiesen. | New task: {title} | {assignedBy} assigned you a task on {boardName}. |
| `task.unassigned` | Aufgabe entfernt: {title} | {unassignedBy} hat dich von einer Aufgabe auf {boardName} entfernt. | Removed from task: {title} | {unassignedBy} removed you from a task on {boardName}. |
| `task.comment.added` | Neuer Kommentar: {title} | {authorName}: {bodyPreview} | New comment: {title} | {authorName}: {bodyPreview} |
| `task.due.reminder` / lead | Morgen fällig: {title} | Deine Aufgabe auf {boardName} ist morgen fällig. | Due tomorrow: {title} | Your task on {boardName} is due tomorrow. |
| `task.due.reminder` / day-of | Heute fällig: {title} | Deine Aufgabe auf {boardName} ist heute fällig. | Due today: {title} | Your task on {boardName} is due today. |

`bodyPreview` for comments is produced server-side by slicing the comment body to 140 characters and adding `…` if truncated. Comments are plain text today; no markdown stripping required.

**Locale source:** for `user:*` recipients, the pipeline's `dispatchImmediate` looks up `userNotificationPreferences.locale` for the recipient's userId. If no preference row exists, it falls back to `"de"`. This is a one-line extension to the existing locale resolution; other recipient types (admin audience, referee) keep their existing behavior.

## Preferences UI

**Page:** extends `/admin/settings/notifications` with a new "Your notifications" card above the existing admin push-test card. The app has admin-only signup, so every logged-in user is a team member and this route already requires a session.

**New card content:**

- One checkbox per user-toggleable event type (initially: the four task events).
- One locale selector (German / English), bound to `userNotificationPreferences.locale`.
- A short note directing referees to the existing referee-slot settings for their match-slot notifications (those live in a separate watch rule and are not part of this catalog).

Each checkbox controls whether its event type appears in the user's `mutedEventTypes` array (checked = not muted). Changes are saved via PATCH immediately, with optimistic UI and a rollback-on-error pattern matching the rest of the admin.

**Event catalog** (`packages/shared/src/notification-events.ts`) — single source of truth:

```ts
export const USER_TOGGLEABLE_EVENTS = [
  { type: "task.assigned",      labelKey: "events.taskAssigned" },
  { type: "task.unassigned",    labelKey: "events.taskUnassigned" },
  { type: "task.comment.added", labelKey: "events.taskComment" },
  { type: "task.due.reminder",  labelKey: "events.taskDueReminder" },
] as const;

export type UserToggleableEventType = (typeof USER_TOGGLEABLE_EVENTS)[number]["type"];
```

Frontend iterates to render; backend validates PATCH payloads against this list.

**API** (`apps/api/src/routes/user/preferences.routes.ts`, session-gated — no specific permission required, a logged-in user can read/update their own prefs):

- `GET /user/preferences/notifications` → `{ mutedEventTypes: string[], locale: "de" | "en" }`. Returns defaults (empty array, `"de"`) if the user has no row yet.
- `PATCH /user/preferences/notifications` → body `{ mutedEventTypes?: string[], locale?: "de" | "en" }`. Validates that every string in `mutedEventTypes` is in `USER_TOGGLEABLE_EVENTS`. Upserts the preference row.

## Data model changes

Summary of all schema changes in one migration:

```sql
-- board_columns
ALTER TABLE board_columns
  ADD COLUMN is_done_column boolean NOT NULL DEFAULT false;

-- tasks
ALTER TABLE tasks
  ADD COLUMN lead_reminder_sent_at timestamptz,
  ADD COLUMN due_reminder_sent_at timestamptz;

-- user_notification_preferences: drop unused legacy columns
ALTER TABLE user_notification_preferences
  DROP COLUMN notify_on_task_assigned,
  DROP COLUMN notify_on_booking_needs_action,
  DROP COLUMN notify_on_task_comment;
```

No data migration needed — the three dropped columns were never wired into user-facing UI or the pipeline.

## Legacy cleanup

In the same pass:

- Delete `notifyTaskAssigned`, `notifyTaskComment`, `notifyBookingNeedsAction` from `notification.service.ts`. These are direct-send helpers that bypass the pipeline; a grep confirms they have no call sites outside the service file and its tests.
- Delete their tests.

The remaining `sendNotification` helper and the notification-listing queries stay.

## Error handling

- Task-service emissions: `try { await insertDomainEvent(...); } catch (err) { log.warn({ err, taskId }, "Failed to emit task event"); }`. The user mutation must not fail because the notification layer hiccupped. Matches the existing pattern in `booking-admin.service.ts` and `referees.sync.ts`.
- Reminder worker: per-task try/catch. A failure on one task logs and continues; the next sweep retries (the timestamp is only written on success, inside the transaction).
- Template renderer: unknown payload shapes return `null`; the pipeline's generic fallback produces a minimal `Ereignis: <type>` message rather than failing delivery.
- Preferences API: validates locale against `"de" | "en"` and `mutedEventTypes` entries against the catalog. Invalid payloads return 400 with field-specific error messages.

## Idempotency

- **Domain event insert:** ULID primary key; retry-safe.
- **Outbox poller:** uses `FOR UPDATE SKIP LOCKED`; concurrent API instances don't double-enqueue.
- **In-app adapter:** `onConflictDoNothing()` on the dedupe key.
- **Push adapter:** already deduplicates per device in the existing implementation.
- **Reminder dedupe:** `leadReminderSentAt` / `dueReminderSentAt` timestamp set inside the same transaction as the event insert. If two sweeps race on the same task, the second one sees the timestamp and skips. A `SELECT ... FOR UPDATE` on the task row before the check closes the race window fully.
- **Preferences PATCH:** idempotent by construction (replaces the array and locale atomically).

## Testing

| Unit | Test file | Key cases |
|---|---|---|
| `task.ts` template | `apps/api/src/services/notifications/templates/task.test.ts` | All 5 variants (assigned, unassigned, comment, due-lead, due-day-of) × 2 locales; unknown event returns null |
| `role-defaults.ts` additions | extend `role-defaults.test.ts` | Each task event emits one DefaultNotification per userId; push-eligible fans out; unknown task payload shape returns zero defaults |
| `task.service.ts` emissions | extend `task.service.test.ts` | `addAssignee` → task.assigned; `removeAssignee` → task.unassigned; `updateTask` diff emits correct subset; `addComment` emits with assignees-minus-author recipients; empty recipient set emits no event |
| `task-reminder.worker.ts` | new `task-reminder.worker.test.ts` | Lead fires once for due-within-24h; day-of fires once for due-today after 08:00 UTC; done-column tasks skipped; no-assignee tasks skipped; re-fires after `dueDate` change resets timestamps; idempotent under concurrent sweeps |
| Pipeline integration | extend `notification-pipeline.test.ts` | Full round-trip from insert → processEvent → assert `notification_log` row exists for correct user; muted user receives nothing; push fan-out produces parallel row |
| `recipient-resolver.ts` | existing tests cover `user:*` | No change |
| Preferences API | new `preferences.routes.test.ts` | GET returns defaults for new user; GET returns saved state; PATCH validates catalog; PATCH rejects unknown event types; session-gated (401 without session); user can only read/write their own row |
| Migration | inspection of generated SQL | Drops three columns, adds three columns |

Coverage expectation: the additions sit in already-tested modules and must keep the 90/95/95/95 thresholds. The reminder worker is the single new isolated unit; its test file mirrors `referee-reminder.worker.test.ts`.

## Out of scope for this plan

Carried forward from the kanban UI design; tracked as future work:

- Watchers (non-assignees subscribing to a task)
- @mentions in comments
- Digest rollups of task activity
- Archive and restore events
- WIP-limit alerts
- Labels, attachments, activity timeline, domain-record links
- Bulk operations with batched notifications
- Per-channel preference granularity (user can currently mute an event type entirely, but not "in-app only, no push")

Each of these is additive: a new event type plus a template plus a role-defaults branch, with no changes to the pipeline core.
