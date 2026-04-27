# Venue Booking System Overhaul

**Date:** 2026-04-27
**Status:** Design

## Context

The current venue booking system has structural gaps that prevent it from supporting the real workflow:

1. **City lead-time deadline is dead config.** `venue_booking_due_days_before` is declared as a setting key in `apps/api/src/services/venue-booking/venue-booking.service.ts:34` with default `7`, but `getBookingConfig()` does not load it (`venue-booking.service.ts:49-54` only fetches three keys), and nothing downstream consumes it. The Dragons need 28 days lead time; the system has no representation of urgency.

2. **No batch concept.** The Dragons send multi-month venue requests to the city in a single email, then occasionally send supplemental emails when games move. The current data model has no entity for a submission batch, no tracking of which bookings went out together, no audit trail of when something was sent. Status `requested` is ambiguous (was it sent? when? to whom? in what email?).

3. **No deadline awareness in UI.** Bookings list, dashboard, sidebar, watch rules — none of them surface "this booking needs to be submitted by date X". Admin has to scan the list and remember the policy.

4. **Buffer model incomplete.** Calculator handles before/after buffers but does not detect overlapping or insufficiently-spaced games at the same venue. Scheduling conflicts go unnoticed.

5. **Watch rules don't cover bookings.** Notification pipeline exists but cannot subscribe to booking events.

6. **No kanban integration.** Existing kanban system has due-date reminders that booking deadlines could plug into.

Existing booking data is unused, so this overhaul can use a destructive migration (drop the tables and start fresh) instead of a complex backfill.

## Goals

- Wire the dead `dueDaysBefore` setting end-to-end with a default of 28 days.
- Model city email batches as first-class entities with full submission history.
- Decouple "have we submitted this?" from "what did the city say?" by splitting submission tracking from status.
- Detect and surface scheduling conflicts (overlapping games at the same venue) as warnings.
- Make booking deadlines visible across list, dashboard, watch rules, and a dedicated kanban board.
- Reuse existing infrastructure (kanban tasks, watch rules, domain events, RBAC) rather than building parallel systems.

## Non-Goals

- Email body rendering for batches. Deferred to a later phase.
- SMTP / notification-pipeline-driven email send to the city. Deferred.
- Backwards-compatible migration of existing booking data. Tables are dropped and recreated.
- Conflict resolution (the system warns, the admin decides).
- Per-venue scoped RBAC. Booking permissions remain global for now.

## Architecture

### Phasing

The work is structured as one design with three implementation phases. Each phase is an independent PR that ships a coherent slice.

- **Phase A** — Calculation correctness and deadline plumbing. Includes the destructive migration that establishes the new schema shape.
- **Phase B** — Batch model. Adds `venue_booking_batches` and `venue_booking_submissions`, batch service, batch UI.
- **Phase C** — Awareness and integration. Hallen kanban board, dashboard widget, watch-rule event types, booking↔task lifecycle wiring.

Phase B depends on A's enum changes. Phase C depends on A's deadline plumbing and B's batch service.

### Data model

**`venue_bookings`** (recreated from scratch):

```ts
{
  id: serial,
  venueId: integer (FK venues),
  date: date,
  calculatedStartTime: time,
  calculatedEndTime: time,
  overrideStartTime: time | null,
  overrideEndTime: time | null,
  overrideReason: text | null,
  status: "unconfirmed" | "confirmed" | "rejected" | "cancelled" (default "unconfirmed"),
  needsReconfirmation: boolean (default false),
  hasPolicyWarning: boolean (default false),
  policyWarnings: jsonb | null,
  notes: text | null,
  confirmedBy: text | null,
  confirmedAt: timestamptz | null,
  createdAt: timestamptz,
  updatedAt: timestamptz,
}
// unique (venueId, date)
// indexes: date, status, hasPolicyWarning
```

Status enum is decoupled from submission state. "Has this been sent to the city?" is answered by querying `venue_booking_submissions`, not by reading `status`. `status` represents the city's response (or absence thereof).

**`venue_booking_matches`** (recreated, same shape):

```ts
{
  venueBookingId: integer (FK venue_bookings, cascade),
  matchId: integer (FK matches),
}
// unique (venueBookingId, matchId)
```

**`venue_booking_batches`** (new):

```ts
{
  id: serial,
  label: varchar(100),                   // "Sept-Nov 2026", admin-chosen
  notes: text | null,
  submittedAt: timestamptz | null,       // null = draft, set = submitted (immutable thereafter)
  submittedBy: text | null,
  createdBy: text | null,
  createdAt: timestamptz,
  updatedAt: timestamptz,
}
```

A batch is a draft until `submittedAt` is set. Drafts are mutable. Submitted batches are read-only — their `label`, `notes`, and contents are frozen.

**`venue_booking_submissions`** (new — junction with history):

```ts
{
  id: serial,
  bookingId: integer (FK venue_bookings, cascade),
  batchId: integer (FK venue_booking_batches, cascade),
  reason: "initial" | "resubmit",
  createdAt: timestamptz,
}
// unique (bookingId, batchId)
```

A submission row is written when a batch is submitted (not when a booking is added to a draft). A booking can have many submission rows over time — one per batch it has been part of. The "current" batch is the most recent submission.

**`venue_booking_tasks`** (new — junction to kanban):

```ts
{
  bookingId: integer (FK venue_bookings, cascade) PK,
  taskId: integer (FK tasks, cascade) PK,
}
```

One booking ↔ one Hallen-board task. Junction (rather than adding `bookingId` to `tasks`) keeps the generic `tasks` table clean.

### Settings

Existing keys retained:
- `venue_booking_buffer_before` — default 60 (minutes before earliest kickoff)
- `venue_booking_buffer_after` — default 60 (minutes after latest game end)
- `venue_booking_game_duration` — default 90 (fallback play+changeover duration when team-level value is null)
- `venue_booking_due_days_before` — already declared but currently dead. Wire into `getBookingConfig()`. Default raised to **28**.

New keys:
- `venue_booking_hallen_board_id` — populated by migration when seeding the Hallen board.

### Hallen board

Auto-seeded by migration. Five columns:

| Position | Name | isDoneColumn |
|---|---|---|
| 0 | To submit | false |
| 1 | In batch | false |
| 2 | Confirmed | true |
| 3 | Rejected | false |
| 4 | Cancelled | false |

Admin can rename the board; the FK in `app_settings.venue_booking_hallen_board_id` keeps the link stable.

### Service layer

**`booking-calculator.ts`** (extend existing pure function):

```ts
calculateTimeWindow(matches, config) → {
  window: { calculatedStartTime, calculatedEndTime } | null,
  warnings: PolicyWarning[]
}

type PolicyWarning =
  | { kind: "overlap", priorMatchId: number, nextMatchId: number, overlapMinutes: number }
  | { kind: "end_clamped", originalEndTime: string, clampedToTime: string }
```

Policy check (no new setting; uses per-match `duration` already in calc):
- Sort games by kickoff.
- For each adjacent pair `(a, b)`: if `kickoff[b] < kickoff[a] + duration[a]`, emit `overlap` warning with `overlapMinutes = (kickoff[a] + duration[a]) - kickoff[b]`.
- If end calc would exceed midnight and was clamped to 23:59:59, emit `end_clamped`.

**`venue-booking.service.ts`** (extend):

- `getBookingConfig()` loads `dueDaysBefore` and includes it in `BookingConfig`.
- `previewReconciliation()` and `reconcileBookingsForMatches()` call the calculator's new signature, populate `policyWarnings` JSON and `hasPolicyWarning` boolean on each booking row.
- New rule: `needsReconfirmation` flips to `true` when calc window changes AND the booking has at least one row in `venue_booking_submissions`. (Replaces the current "was confirmed" check.) Cleared when the booking enters a new batch that gets submitted.
- Emit `BOOKING_POLICY_WARNING` only on transition false→true (not on every reconciliation re-run).

**`batch.service.ts`** (new):

```ts
createDraftBatch({ label, notes, createdBy }) → Batch
updateDraftBatch(id, { label?, notes? })
deleteDraftBatch(id)
addBookingsToBatch(batchId, bookingIds[])
removeBookingsFromBatch(batchId, bookingIds[])
submitBatch(batchId, submittedBy)
listBatches({ status: "draft" | "submitted" | "all" })
getBatchDetail(batchId) → { batch, bookings: BookingListItem[] }
```

Constraints:
- Mutations rejected on submitted batches.
- A booking can only be in one *draft* batch at a time. Allowed across multiple submitted batches (history).
- `submitBatch` is idempotent on already-submitted batches: returns 409 with current state.
- On submit:
  - For each booking in the batch, write `venue_booking_submissions` row. `reason="initial"` if no prior submission rows for this booking; `reason="resubmit"` otherwise.
  - Clear `needsReconfirmation = false` on each.
  - Emit one `BOOKING_BATCH_SUBMITTED` event with `{ batchId, label, bookingCount }`.
  - Trigger booking-task service to move each booking's task to "In batch".

**`booking-task.service.ts`** (new):

Owns the Hallen board task lifecycle. Single funnel for task mutations driven by booking state.

| Booking event | Task action |
|---|---|
| Booking created | Create task in "To submit", `dueDate = bookingDate − dueDaysBefore`, title built from venue name + date + match count |
| Calc window / date / match-count changes | Update task title; recompute `dueDate` if booking date changed |
| Batch submitted with this booking | Move task to "In batch", append batch label to task description |
| Status → confirmed | Move task to "Confirmed" (done column) |
| Status → rejected | Move task to "Rejected" |
| Status → cancelled | Move task to "Cancelled" |
| `needsReconfirmation` flips true | Move task back to "To submit", set priority `high` |
| Booking deleted | Delete task |

Service is invoked from:
- `reconcileBookingsForMatches()` after each create/update/delete
- `batch.service.ts.submitBatch()`
- `PATCH /admin/bookings/:id/status` handler
- `DELETE /admin/bookings/:id` handler

Admins may manually edit or delete cards on the Hallen board; the next reconciliation or status change will reconcile the task back into shape if the underlying booking still exists.

### Domain events

Existing events retained: `BOOKING_CREATED`, `BOOKING_STATUS_CHANGED`, `BOOKING_NEEDS_RECONFIRMATION`.

New events:
- `BOOKING_POLICY_WARNING` — emitted when `hasPolicyWarning` flips false→true. Payload: `{ venueName, date, warnings: PolicyWarning[] }`.
- `BOOKING_BATCH_SUBMITTED` — emitted on `submitBatch()`. Payload: `{ batchId, label, bookingCount, submittedBy }`.
- `BOOKING_CONFIRMED` — emitted on transition to `confirmed`. Separate from generic `STATUS_CHANGED` so watch rules can subscribe specifically.
- `BOOKING_REJECTED` — emitted on transition to `rejected`.

`watch_rules` filter schema extended to allow these event types as filter targets. Existing venue/team filters compose naturally ("notify on policy warnings at Sporthalle X").

### API

**Existing booking endpoints** (unchanged paths, extended responses/filters):

```
GET    /admin/bookings
       ?status=unconfirmed|confirmed|rejected|cancelled
       &dateFrom &dateTo
       &hasBatch=true|false
       &dueWithinDays=7|14|30
       &hasPolicyWarning=true
       Default sort: dueDate asc
GET    /admin/bookings/:id              → adds submissionHistory[], policyWarnings[], dueDate, currentBatchId
PATCH  /admin/bookings/:id              (overrides, notes — unchanged)
PATCH  /admin/bookings/:id/status       (new enum)
POST   /admin/bookings                  (manual create, new enum)
DELETE /admin/bookings/:id
GET    /admin/bookings/reconcile/preview → preview rows include policyWarnings[]
POST   /admin/bookings/reconcile
```

**New batch endpoints**:

```
GET    /admin/booking-batches?status=draft|submitted|all
POST   /admin/booking-batches                            { label, notes }
GET    /admin/booking-batches/:id
PATCH  /admin/booking-batches/:id                        { label?, notes? }       (drafts only)
DELETE /admin/booking-batches/:id                                                (drafts only)
POST   /admin/booking-batches/:id/bookings               { bookingIds: number[] } (drafts only)
DELETE /admin/booking-batches/:id/bookings/:bookingId                            (drafts only)
POST   /admin/booking-batches/:id/submit
```

### RBAC

Existing: `booking:view | create | update | delete` (unchanged).

New: `booking_batch:view | create | update | submit | delete`. `submit` is its own permission so admins can edit drafts without being able to send them out.

### UI

**Bookings list** (`/admin/bookings`) — extend existing:
- New columns: **Due** (color-coded), **Batch** (label or em-dash), **⚠** policy-warning icon.
- New filters: due-within select (7/14/30/all), policy-warnings toggle, has-batch toggle.
- Default sort: due date asc.
- Bulk-select checkboxes → "Add to batch" action (dialog: pick draft batch or create new).

**Booking detail sheet** — extend existing:
- Section: **Submission history** with `(batchLabel, submittedAt, reason)` rows.
- Section: **Policy warnings** with human-readable text.
- Due date displayed prominently.
- Status select uses new enum with localized labels.

**Reconcile dialog** — extend existing: warning chips per row.

**Batches list** (`/admin/bookings/batches`) — new page:
- Tabs: Drafts | Submitted.
- Draft cards: label, booking count, "Edit" + "Submit" buttons.
- Submitted cards: label, booking count, submitted date, "View" button.
- "Create draft batch" button.

**Batch detail** (`/admin/bookings/batches/:id`) — new page:
- Header: label, status, submitted-by/at if submitted.
- Bookings table with venue, date, time window, due, current status, remove button (drafts) or submission reason badge (submitted).
- Draft actions: "Add bookings" (modal lists eligible unconfirmed bookings not in any draft), "Submit batch" (confirmation dialog), "Delete draft".

**Dashboard widget** (`/admin`):
- Card: "Venue bookings".
- Body: bold counts for overdue, due ≤7d, due ≤30d.
- Each count click-throughs to bookings list with that filter applied.

**Sidebar nav**:
- Bookings (existing) — link to `/admin/bookings`.
- Batches (new, indented) — link to `/admin/bookings/batches`. Gated on `booking_batch:view`.

**Settings** (extend `apps/web/src/components/admin/settings/booking-config.tsx`):
- Add `dueDaysBefore` numeric input. Label: "City needs booking N days in advance". Default 28.

**Match detail** (extend existing booking card on `match-detail-page.tsx`):
- Add due date and policy warning indicator if present.

**Watch rules form** — add new event types to the event-type selector: `BOOKING_BATCH_SUBMITTED`, `BOOKING_POLICY_WARNING`, `BOOKING_CONFIRMED`, `BOOKING_REJECTED`, `BOOKING_NEEDS_RECONFIRMATION`.

### Shared types (`packages/shared/src/bookings.ts`)

```ts
type BookingStatus = "unconfirmed" | "confirmed" | "rejected" | "cancelled"
type SubmissionReason = "initial" | "resubmit"

type PolicyWarning =
  | { kind: "overlap", priorMatchId: number, nextMatchId: number, overlapMinutes: number }
  | { kind: "end_clamped", originalEndTime: string, clampedToTime: string }

interface BookingListItem {
  // ...existing fields
  dueDate: string
  daysUntilDue: number
  hasPolicyWarning: boolean
  currentBatchId: number | null
  currentBatchLabel: string | null
}

interface BookingDetail extends BookingListItem {
  // ...existing fields
  submissionHistory: { batchId: number, batchLabel: string, submittedAt: string, reason: SubmissionReason }[]
  policyWarnings: PolicyWarning[]
}

interface BatchListItem {
  id: number
  label: string
  status: "draft" | "submitted"
  bookingCount: number
  submittedAt?: string
  submittedBy?: string
}

interface BatchDetail extends BatchListItem {
  notes: string | null
  bookings: BookingListItem[]
  createdBy: string | null
  createdAt: string
}
```

## Migration

Single destructive migration since existing booking data is unused.

**Drizzle SQL migration** (`packages/db/migrations/<n>_venue_booking_overhaul.sql`):

1. `DROP TABLE venue_booking_matches`
2. `DROP TABLE venue_bookings`
3. Recreate `venue_bookings` with new shape (status enum string, `has_policy_warning`, `policy_warnings jsonb`).
4. Recreate `venue_booking_matches`.
5. Create `venue_booking_batches`.
6. Create `venue_booking_submissions`.
7. Create `venue_booking_tasks`.
8. `INSERT INTO app_settings (key, value) VALUES ('venue_booking_due_days_before', '28') ON CONFLICT (key) DO UPDATE SET value = '28'`.

**Post-migration TS seed** (`packages/db/scripts/seed-hallen-board.ts`, idempotent):

- Read `app_settings.venue_booking_hallen_board_id`. If present, exit.
- Insert "Hallen" board with description "Auto-managed venue booking tasks".
- Insert 5 columns: To submit (0), In batch (1), Confirmed (2, isDoneColumn=true), Rejected (3), Cancelled (4).
- Insert `app_settings.venue_booking_hallen_board_id` with new board ID.
- Wired into `pnpm --filter @dragons/db db:migrate` so it runs automatically.

Re-runnable safely on prod (idempotent check on board ID).

## Testing

Per project thresholds (90% branches, 95% functions/lines/statements). Co-located `*.test.ts`.

**Calculator** (`booking-calculator.test.ts` — extend):
- Existing window cases retained.
- Single match: no warnings.
- Two non-overlapping matches: no warnings.
- Two overlapping matches: overlap warning with correct minutes.
- Three matches with one overlap pair.
- End-of-day clamp triggers `end_clamped` warning.

**Booking service** (`venue-booking.service.test.ts` — new file):
- `getBookingConfig()` loads `dueDaysBefore`, defaults to 28 when missing.
- `previewReconciliation()` populates `policyWarnings` array on `toCreate` and `toUpdate`.
- `reconcileBookingsForMatches()` sets `hasPolicyWarning` and emits `BOOKING_POLICY_WARNING` only on flip false→true.
- `needsReconfirmation` flips when window changes AND ≥1 submission row exists.
- `needsReconfirmation` does not flip on first creation.

**Batch service** (`batch.service.test.ts` — new):
- Create draft, edit draft, delete draft.
- Mutations rejected on submitted.
- `addBookingsToBatch` rejects bookings already in another draft.
- `submitBatch` writes submission rows with correct `reason`.
- Idempotent submit returns conflict.
- Emits `BOOKING_BATCH_SUBMITTED`.

**Booking-task service** (`booking-task.service.test.ts` — new):
- Booking creation creates task in "To submit" with correct due date.
- Window/date change updates title and dueDate.
- Submitted batch moves task to "In batch".
- Status changes move tasks to corresponding columns.
- `needsReconfirmation` true moves task back to "To submit" with high priority.
- Booking deletion deletes task.

**API route tests** (extend existing booking route tests + new batch route tests):
- All new batch endpoints (happy + error cases).
- New filters on `GET /admin/bookings` return correct subsets.
- RBAC denial for missing permissions on each endpoint.
- Submit idempotency.

**UI smoke tests**:
- Bookings list with new columns and filters.
- Batches list and detail pages.
- Dashboard widget renders counts and links.

## Risks & Trade-offs

**Destructive migration risk** — Mitigated by user confirmation that existing data is unused. Migration runs once and cannot be reversed; the design accepts this.

**Booking-task coupling** — The booking-task service couples booking lifecycle to kanban infrastructure. If kanban is removed or restructured, this service breaks. Mitigated by keeping the integration in a single file with a clear interface; admins can also live without the Hallen board (it's an awareness layer, not authoritative).

**Submission junction growth** — `venue_booking_submissions` grows unboundedly over seasons. At realistic Dragons scale (low hundreds of bookings per season, occasional resubmits), this is negligible — but worth noting.

**Status enum migration** — The string-based status enum (no Postgres ENUM type) is consistent with the rest of the schema and makes future status additions cheap. No risk worth flagging.

**Policy warning false positives** — If federation publishes a tight back-to-back schedule that the Dragons accept in practice, every reconciliation will keep flagging it. Mitigated by `hasPolicyWarning` being persistent rather than recomputed on each render — admin can dismiss/note in `notes`. Future enhancement (out of scope): a per-booking `policyWarningSilencedAt` timestamp.

**`needsReconfirmation` semantic shift** — Currently flips only for `confirmed` bookings. New rule flips for any booking with a submission history. This is a behavior change but matches the intent ("anything we already told the city about needs to go back to them when it changes"). Test coverage will lock the new semantics.

## Phasing Summary

| Phase | Includes | Depends on |
|---|---|---|
| **A** — Calc & deadlines | Destructive migration, new schema for `venue_bookings` (status enum, policy warnings), calculator warnings, `dueDaysBefore` wiring, due column/sort/filter on list, due display in detail/match card, `BOOKING_POLICY_WARNING`/`CONFIRMED`/`REJECTED` events, settings UI for `dueDaysBefore` | nothing |
| **B** — Batch model | `venue_booking_batches`, `venue_booking_submissions`, batch service + endpoints, batches list/detail UI, bulk-select on bookings list, submission history in detail, `BOOKING_BATCH_SUBMITTED`, `needsReconfirmation` rule update, `booking_batch:*` permissions, sidebar entry | A |
| **C** — Awareness | `venue_booking_tasks`, Hallen board seed, booking-task service wired into A+B, dashboard widget, watch-rules schema + UI for booking events | A, B |

Each phase ships as one PR with its own tests and is deployable independently.
