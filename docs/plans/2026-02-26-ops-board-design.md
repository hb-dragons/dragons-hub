# Club Operations Board — Design

## Goal

Add a Kanban-based task management system for the club ops team (3-10 people) that tracks venue bookings, communication tasks, and general club operations. Venue bookings are automatically created and updated when the sync pipeline or local edits change match schedules.

## Core Concepts

### Venue Booking Blocks

Venue bookings are **per game-day**, not per match. All home games on the same date at the same venue are grouped into one booking with a calculated time window.

**Example:** Saturday March 15 — 4 home games from 10:00 to 16:00 at the main gym → one booking: "9:00–19:00" (with configurable buffers and per-team game durations).

Bookings track the status of an **external** process (phone call, email to the venue owner). The app doesn't send booking requests — it tracks whether the booking has been done.

### Kanban Board

A drag-and-drop board with user-defined columns. Tasks can be linked to matches and/or venue bookings, or stand alone as general ops tasks. Moving a booking task to a "done" column confirms the booking.

### Automation

The sync pipeline and local match edit endpoints trigger automatic booking and task creation/updates. Both remote and local changes are treated equally — if a game moves, the booking needs updating regardless of who changed it.

## Data Model

### `venue_bookings`

| Column | Type | Description |
|---|---|---|
| id | serial PK | |
| venueId | FK → venues | Which gym |
| date | date | Game day |
| calculatedStartTime | time | Auto-computed: earliest kickoff - buffer_before |
| calculatedEndTime | time | Auto-computed: latest kickoff + game_duration + buffer_after |
| overrideStartTime | time, nullable | Manual override, null = use calculated |
| overrideEndTime | time, nullable | Manual override, null = use calculated |
| overrideReason | text, nullable | Why it was overridden |
| status | enum | pending, requested, confirmed, cancelled |
| needsReconfirmation | boolean | True when matches changed after confirmation |
| notes | text, nullable | Booking reference numbers, contact info, etc. |
| confirmedBy | FK → user, nullable | |
| confirmedAt | timestamp, nullable | |
| createdAt, updatedAt | timestamp | |
| **UNIQUE** | (venueId, date) | One booking per venue per day |

Effective time = `override ?? calculated`. The UI shows both values so the user can see what the system computed vs what they chose.

### `venue_booking_matches`

| Column | Type | Description |
|---|---|---|
| id | serial PK | |
| venueBookingId | FK → venue_bookings, cascade | |
| matchId | FK → matches | |
| **UNIQUE** | (venueBookingId, matchId) | |

Links which matches are covered by each booking.

### `boards`

| Column | Type | Description |
|---|---|---|
| id | serial PK | |
| name | varchar | e.g., "Club Operations" |
| description | text, nullable | |
| createdBy | FK → user | |
| createdAt, updatedAt | timestamp | |

### `board_columns`

| Column | Type | Description |
|---|---|---|
| id | serial PK | |
| boardId | FK → boards, cascade | |
| name | varchar | e.g., "To Do", "In Progress", "Waiting", "Done" |
| position | integer | Ordering within the board |
| color | varchar, nullable | Hex color for column header |
| isDoneColumn | boolean | Marks columns that represent "completed" |
| createdAt, updatedAt | timestamp | |

`isDoneColumn` drives automation: moving a venue booking task here sets the booking status to `confirmed`.

### `tasks`

| Column | Type | Description |
|---|---|---|
| id | serial PK | |
| boardId | FK → boards, cascade | |
| columnId | FK → board_columns | |
| title | varchar | |
| description | text, nullable | |
| assigneeId | FK → user, nullable | |
| priority | enum | low, normal, high, urgent |
| dueDate | date, nullable | |
| position | integer | Ordering within column |
| matchId | FK → matches, nullable | Optional match link |
| venueBookingId | FK → venue_bookings, nullable | Optional booking link |
| sourceType | enum | manual, sync_auto, system |
| sourceDetail | text, nullable | e.g., "Match #42 date changed from Mar 15 to Mar 22" |
| createdBy | FK → user, nullable | Null for auto-generated tasks |
| createdAt, updatedAt | timestamp | |

### `task_checklist_items`

| Column | Type | Description |
|---|---|---|
| id | serial PK | |
| taskId | FK → tasks, cascade | |
| label | varchar | e.g., "Request sent", "Confirmation received" |
| isChecked | boolean | |
| checkedBy | FK → user, nullable | |
| checkedAt | timestamp, nullable | |
| position | integer | |
| createdAt | timestamp | |

### `task_comments`

| Column | Type | Description |
|---|---|---|
| id | serial PK | |
| taskId | FK → tasks, cascade | |
| authorId | FK → user | |
| body | text | |
| createdAt, updatedAt | timestamp | |

### `notifications`

| Column | Type | Description |
|---|---|---|
| id | serial PK | |
| recipientId | FK → user | |
| channel | enum | in_app, whatsapp |
| title | varchar | |
| body | text | |
| relatedTaskId | FK → tasks, nullable | |
| relatedBookingId | FK → venue_bookings, nullable | |
| status | enum | pending, sent, failed |
| sentAt | timestamp, nullable | |
| errorMessage | text, nullable | |
| createdAt | timestamp | |

### `user_notification_preferences`

| Column | Type | Description |
|---|---|---|
| id | serial PK | |
| userId | FK → user, unique | |
| whatsappEnabled | boolean, default false | |
| whatsappNumber | varchar, nullable | E.164 format |
| notifyOnTaskAssigned | boolean, default true | |
| notifyOnBookingNeedsAction | boolean, default true | |
| notifyOnTaskComment | boolean, default true | |
| createdAt, updatedAt | timestamp | |

### Modifications to existing tables

**`teams`** — add column:

| Column | Type | Description |
|---|---|---|
| estimatedGameDuration | integer, nullable | Minutes. Null = use global default. |

Editable on `/admin/teams` next to the custom name field.

### App settings (new keys)

| Key | Default | Description |
|---|---|---|
| venue_booking_buffer_before | 60 | Minutes before first kickoff |
| venue_booking_buffer_after | 60 | Minutes after last game ends |
| venue_booking_game_duration | 90 | Default game duration in minutes (fallback when team has no override) |
| venue_booking_due_days_before | 7 | Auto-created tasks are due this many days before game day |

## Venue Booking Automation

### Time window calculation

For a game-day block (all home matches on a given date at a given venue):

```
For each match in the block:
  duration = match.homeTeam.estimatedGameDuration ?? global game_duration setting
  matchEnd = match.kickoffTime + duration

calculatedStartTime = MIN(all kickoffTimes) - buffer_before
calculatedEndTime   = MAX(all matchEnds) + buffer_after
effectiveStartTime  = overrideStartTime ?? calculatedStartTime
effectiveEndTime    = overrideEndTime ?? calculatedEndTime
```

### Trigger events

| Event | Booking action | Task action |
|---|---|---|
| New home match synced | Add to existing booking or create new (status: pending) | Create "Book venue" task if booking is new |
| Match date changed (remote sync) | Move match between bookings, recalculate both windows | Reset confirmed booking's task to first column, reset checklist |
| Match date changed (local override) | Same as remote | Same as remote |
| Match venue changed | Move match between venue bookings | Reset/create tasks as needed |
| Match time changed | Recalculate booking window | Flag task if override window is now too narrow |
| Match cancelled | Remove from booking, recalculate or cancel if empty | Update task, cancel if booking empty |

### Reconfirmation logic

When a booking in `confirmed` status is affected by a match change:

1. Set `needsReconfirmation = true`
2. Move the linked task back to the board's first column
3. Reset checklist items to unchecked
4. Send WhatsApp notification to the task assignee

If the recalculated window exceeds a manual override, the task description notes the conflict so the user can review.

### Integration points

- **Post-sync hook**: `SyncOrchestrator.fullSync()` gains a final step that calls `VenueBookingService.reconcileAfterSync(syncRunId)` to evaluate all changed matches
- **Post-local-edit hook**: The match override API endpoint calls `VenueBookingService.reconcileMatch(matchId)` after saving the override

## Auto-created Task Template (Venue Booking)

- **Title**: "Book venue: [Venue Name] — [formatted date]"
- **Description**: Lists matches covered, time window needed
- **Due date**: game day minus `venue_booking_due_days_before`
- **Priority**: high
- **Source type**: sync_auto
- **Checklist items**: "Request sent", "Confirmation received", "Booking reference saved"

## WhatsApp Notifications

### Provider architecture

```
NotificationService.send(notification)
├── InAppProvider   → writes to notifications table (always)
└── WhatsAppProvider → queues BullMQ job → calls WhatsApp API
```

Uses a new BullMQ queue (`notifications`) alongside the existing `sync` queue. Failed deliveries are retried with exponential backoff.

WhatsApp delivery via the WhatsApp Business API (Meta Cloud API) or a third-party wrapper (Twilio). Specific provider chosen at implementation time.

### Notification triggers

| Event | Recipients |
|---|---|
| Task auto-created and assigned | Task assignee |
| Booking needs reconfirmation | Assignee of linked task |
| Task comment added | Task assignee (if not the commenter) |
| Task due date approaching | Task assignee (configurable: N days before) |

### User preferences

Each user controls their own notification settings via a preferences page:
- Enable/disable WhatsApp
- Phone number (E.164)
- Per-event-type toggles

## Admin UI Pages

### `/admin/board` — Kanban Board

- Drag-and-drop columns and cards (using @dnd-kit or similar)
- Column management: add, rename, reorder, set color, mark as "done" column
- Task cards show: title, assignee avatar, priority badge, due date, checklist progress, match/booking link
- Click card → slide-over or modal with full task detail, checklist, comments
- Toolbar: filter by assignee, priority, match link; search; "Add task" button

### `/admin/bookings` — Venue Bookings Overview

- Calendar or table view of all venue bookings
- Status badges (pending, requested, confirmed, cancelled, needs reconfirmation)
- Shows effective time window, linked matches, linked task status
- Quick actions: change status, edit override times, open linked task

### Modifications to existing pages

- `/admin/teams` — add "Game Duration" column/edit field
- `/admin/settings` — add "Venue Booking" section with buffer/duration/due-date settings
- Admin header nav — add "Board" and "Bookings" links

## Roles

The existing `admin` and `user` roles from Better Auth are sufficient:

- **admin**: full access to board management (create boards, manage columns), all tasks, all bookings, user notification settings
- **user**: view board, create/edit/move own tasks, update assigned booking tasks, manage own notification preferences

No new roles needed for the initial implementation.

## What's NOT In Scope

- Email, Slack, or Telegram notifications (future — provider architecture supports adding them)
- Multiple boards (start with one default board, expand later if needed)
- Task labels/tags (can be added later)
- Task due date recurring/repeat patterns
- File attachments on tasks
- Activity log / audit trail on tasks (comments serve this purpose for now)
- Automated communication sending (e.g., auto-emailing venue owners)
- Mobile app / PWA (responsive web only)
