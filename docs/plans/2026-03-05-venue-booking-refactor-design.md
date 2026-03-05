# Venue Booking Refactor Design

## Goal

Replace the task-board-based venue booking workflow with a dedicated booking management page. Decouple bookings from the generic board/task system. The board stays as a standalone tool.

## Schema Changes

### Modify `tasks` table
- Remove columns: `venueBookingId`, `matchId`, `sourceType`, `sourceDetail`
- Remove indexes on `venueBookingId` and `matchId`

### Modify `notifications` table
- Remove columns: `relatedTaskId`, `relatedBookingId`

### Keep unchanged
- `venues`, `venue_bookings`, `venue_booking_matches` — no changes
- `boards`, `board_columns`, `task_checklist_items`, `task_comments` — no changes

## API Changes

### Booking routes (`/admin/bookings`)
- `GET /admin/bookings` — keep (list with filters)
- `GET /admin/bookings/:id` — keep, remove `task` from response
- `PATCH /admin/bookings/:id` — keep (time overrides, notes, status)
- `PATCH /admin/bookings/:id/status` — keep, update reconfirmation logic
- **`POST /admin/bookings`** — new: manual creation (venue, date, start/end, optional matchIds, notes)
- **`DELETE /admin/bookings/:id`** — new: delete booking with cascade

### Match routes
- `GET /admin/matches/:id` — include linked booking info
- `GET /admin/matches` — include optional booking status in response

### Reconciliation
- Keep auto-creation/update of bookings from synced home matches
- Reconfirmation: set `needsReconfirmation = true` AND revert status to `pending`, clear `confirmedAt`/`confirmedBy`
- Remove all calls to `task-automation.service.ts`

### Delete
- `task-automation.service.ts` — entirely

### Decouple
- Remove booking-related fields from task routes/schemas
- Remove booking info from task detail response

## Frontend Changes

### New/Reworked: Booking Management Page (`/admin/bookings`)
- Status filter (all / pending / requested / confirmed / cancelled)
- Date range filter
- Table: venue, date, effective times, status badge, match count, needsReconfirmation indicator
- Inline status change per row
- Row click opens detail panel:
  - Time details (calculated vs override)
  - Override editing (start/end time, reason)
  - Linked matches list
  - Notes field
  - Status controls
- "New Booking" button: dialog with venue selector, date, start/end time, optional match picker, notes

### Match list
- Add optional "Booking" column (hidden by default, toggleable)
- Shows booking status badge + link

### Match detail
- Show linked booking badge/card if exists

### Remove from board/tasks
- `venueBookingId`/`matchId` from CreateTaskDialog
- Booking info section from TaskDetailSheet
- Source type display from task cards

### Keep
- Kanban board and all task components (cleaned of booking refs)
- Booking config in settings (buffer times, game duration)

## Reconciliation & Reconfirmation Flow

### Auto-reconciliation (after match sync)
1. Group home matches by (venue, date)
2. Create/update `venue_bookings` with calculated time windows
3. Sync `venue_booking_matches` junction entries
4. Clean up stale bookings
5. No task creation

### Reconfirmation
1. Detected when calculated times change on confirmed booking
2. Set `needsReconfirmation = true`
3. Revert `status` to `pending`
4. Clear `confirmedAt` and `confirmedBy`

### Manual bookings
- Same schema, no distinction from auto-created
- Manual ones without matches have null calculated times, only override times
- Linking matches later populates calculated times on next reconciliation
