# Venue Booking Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decouple venue bookings from the task/board system and create a dedicated booking management page with manual creation, status workflow, and match backlinking.

**Architecture:** Remove all booking-related columns from `tasks` and `notifications` tables. Delete `task-automation.service.ts` and strip booking references from task routes/services/UI. Add `POST /admin/bookings` and `DELETE /admin/bookings/:id` endpoints. Update reconciliation to flag+revert on reconfirmation. Add booking info to match list/detail responses. Build enhanced booking management UI.

**Tech Stack:** Drizzle ORM (schema + migrations), Hono (API routes), Zod (validation), Next.js 16 (App Router), TanStack Table, shadcn/Radix UI, Vitest (100% coverage)

---

### Task 1: Schema — Remove booking-related columns from tasks table

**Files:**
- Modify: `packages/db/src/schema/tasks.ts:16-58`

**Step 1: Write the failing test**

No test needed for schema changes — Drizzle schema is declarative. Verify via typecheck after changes.

**Step 2: Remove booking-related columns from tasks schema**

In `packages/db/src/schema/tasks.ts`:
- Remove `import { matches } from "./matches";` (line 13)
- Remove `import { venueBookings } from "./venue-bookings";` (line 14)
- Remove `matchId` column (line 32)
- Remove `venueBookingId` column (lines 33-35)
- Remove `sourceType` column (lines 36-38)
- Remove `sourceDetail` column (line 39)
- Remove `matchIdIdx` index (line 52)
- Remove `venueBookingIdx` index (lines 53-55)

The remaining `tasks` table should have: `id`, `boardId`, `columnId`, `title`, `description`, `assigneeId`, `priority`, `dueDate`, `position`, `createdBy`, `createdAt`, `updatedAt`.

**Step 3: Run typecheck to find all compilation errors**

Run: `pnpm typecheck 2>&1 | head -80`
Expected: Multiple TS errors in files referencing `tasks.matchId`, `tasks.venueBookingId`, `tasks.sourceType`, `tasks.sourceDetail`.

**Step 4: Commit**

```bash
git add packages/db/src/schema/tasks.ts
git commit -m "refactor(db): remove booking-related columns from tasks schema"
```

---

### Task 2: Schema — Remove booking-related columns from notifications table

**Files:**
- Modify: `packages/db/src/schema/notifications.ts:14-37`

**Step 1: Remove booking-related columns from notifications schema**

In `packages/db/src/schema/notifications.ts`:
- Remove `import { tasks } from "./tasks";` (line 11)
- Remove `import { venueBookings } from "./venue-bookings";` (line 12)
- Remove `relatedTaskId` column (line 22)
- Remove `relatedBookingId` column (lines 23-25)

**Step 2: Run typecheck to see remaining errors**

Run: `pnpm typecheck 2>&1 | head -80`
Expected: Errors in notification service/routes referencing removed columns.

**Step 3: Commit**

```bash
git add packages/db/src/schema/notifications.ts
git commit -m "refactor(db): remove task/booking references from notifications schema"
```

---

### Task 3: Shared types — Remove booking fields from task types

**Files:**
- Modify: `packages/shared/src/tasks.ts:1-46`
- Modify: `packages/shared/src/bookings.ts:1-71`
- Modify: `packages/shared/src/index.ts:45-58`

**Step 1: Clean up TaskCardData**

In `packages/shared/src/tasks.ts`:
- Remove `import type { BookingInfo } from "./bookings";` (line 2)
- Remove `matchId: number | null;` from `TaskCardData` (line 14)
- Remove `venueBookingId: number | null;` from `TaskCardData` (line 15)
- Remove `sourceType: string;` from `TaskCardData` (line 16)
- Remove `sourceDetail: string | null;` from `TaskDetail` (line 39)
- Remove `booking: BookingInfo | null;` from `TaskDetail` (line 45)

**Step 2: Clean up BookingListItem and BookingDetail**

In `packages/shared/src/bookings.ts`:
- Remove `task: { id: number; title: string } | null;` from `BookingListItem` (line 27)
- Remove `BookingDetailTask` interface entirely (lines 30-35)
- Remove `task: BookingDetailTask | null;` from `BookingDetail` (line 57)
- Remove `BookingInfo` interface entirely (lines 60-70) — no longer needed since tasks don't reference bookings

**Step 3: Clean up shared index exports**

In `packages/shared/src/index.ts`:
- Remove `BookingDetailTask` and `BookingInfo` from bookings exports (lines 48, 50)

**Step 4: Run typecheck**

Run: `pnpm typecheck 2>&1 | head -80`
Expected: More errors cascading through service/route layers.

**Step 5: Commit**

```bash
git add packages/shared/src/tasks.ts packages/shared/src/bookings.ts packages/shared/src/index.ts
git commit -m "refactor(shared): remove booking-task coupling from shared types"
```

---

### Task 4: Delete task-automation.service.ts and its tests

**Files:**
- Delete: `apps/api/src/services/venue-booking/task-automation.service.ts`
- Delete: `apps/api/src/services/venue-booking/task-automation.service.test.ts`

**Step 1: Delete the files**

```bash
rm apps/api/src/services/venue-booking/task-automation.service.ts
rm apps/api/src/services/venue-booking/task-automation.service.test.ts
```

**Step 2: Commit**

```bash
git add -u
git commit -m "refactor(api): delete task-automation service"
```

---

### Task 5: Update venue-booking.service.ts — Remove task automation calls

**Files:**
- Modify: `apps/api/src/services/venue-booking/venue-booking.service.ts:1-389`

**Step 1: Remove task automation import and calls**

In `apps/api/src/services/venue-booking/venue-booking.service.ts`:
- Remove `import { reconcileTasksAfterBookingUpdate } from "./task-automation.service";` (line 12)
- Remove the task reconfirmation block at lines 173-180 (the `try/catch` calling `reconcileTasksAfterBookingUpdate`)
- Remove the auto-create task block at lines 213-218 (the `try/catch` calling `reconcileTasksAfterBookingUpdate`)

**Step 2: Update reconfirmation logic — flag AND revert status to pending**

In the `windowChanged` block (around lines 157-170), update the logic:

When a confirmed booking's time window changes:
- Set `needsReconfirmation = true`
- Set `status = "pending"`
- Clear `confirmedAt = null`
- Clear `confirmedBy = null`

Replace the existing update (lines 161-169) with:

```typescript
const updateData: Record<string, unknown> = {
  calculatedStartTime: window.calculatedStartTime,
  calculatedEndTime: window.calculatedEndTime,
  needsReconfirmation:
    existing.status === "confirmed" ? true : existing.needsReconfirmation,
  updatedAt: new Date(),
};

// If booking was confirmed and times changed, revert to pending
if (existing.status === "confirmed") {
  updateData.status = "pending";
  updateData.confirmedAt = null;
  updateData.confirmedBy = null;
}

await db
  .update(venueBookings)
  .set(updateData)
  .where(eq(venueBookings.id, existing.id));
```

**Step 3: Run typecheck**

Run: `pnpm typecheck 2>&1 | head -40`

**Step 4: Commit**

```bash
git add apps/api/src/services/venue-booking/venue-booking.service.ts
git commit -m "refactor(api): remove task automation from reconciliation, update reconfirmation logic"
```

---

### Task 6: Update venue-booking.service.test.ts

**Files:**
- Modify: `apps/api/src/services/venue-booking/venue-booking.service.test.ts`

**Step 1: Read existing test file**

Read the file to understand current test structure and mocking.

**Step 2: Remove all task-automation mocks and assertions**

- Remove any `vi.mock("./task-automation.service")` or similar
- Remove assertions that check `reconcileTasksAfterBookingUpdate` was called
- Update reconfirmation tests to verify the new behavior: status reverts to "pending", `confirmedAt`/`confirmedBy` cleared
- Add test case: "reverts confirmed booking to pending when calculated times change"

**Step 3: Run tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/services/venue-booking/venue-booking.service.test.ts`
Expected: All pass.

**Step 4: Commit**

```bash
git add apps/api/src/services/venue-booking/venue-booking.service.test.ts
git commit -m "test(api): update venue-booking service tests for decoupled reconciliation"
```

---

### Task 7: Update task.service.ts — Remove booking coupling

**Files:**
- Modify: `apps/api/src/services/admin/task.service.ts:1-569`

**Step 1: Remove booking-related imports**

Remove these imports (lines 8-12): `venueBookings`, `venueBookingMatches`, `venues`, `matches`, `teams`
Remove `BookingInfo` from shared import (line 21)

**Step 2: Clean up listTasks()**

In `listTasks()` (lines 46-93):
- Remove `matchId`, `venueBookingId`, `sourceType` from the select (lines 57-59)

**Step 3: Clean up createTask()**

In `createTask()` (lines 96-177):
- Remove `matchId` and `venueBookingId` from input type (lines 105-106)
- Remove `matchId` and `venueBookingId` from insert values (lines 149-150)
- Remove `matchId`, `venueBookingId`, `sourceType`, `sourceDetail` from return object (lines 164-166, 169)
- Remove `booking: null` from return (line 175)

**Step 4: Clean up getTaskDetail()**

In `getTaskDetail()` (lines 179-307):
- Remove entire booking fetch block (lines 213-275) — the `let booking: BookingInfo | null = null;` through the end of the `if (task.venueBookingId)` block
- Remove `matchId`, `venueBookingId`, `sourceType`, `sourceDetail` from return object (lines 287-289, 292)
- Remove `booking` from return (line 305)

**Step 5: Clean up moveTask()**

In `moveTask()` (lines 330-377):
- Remove the auto-confirm booking block (lines 363-374) — the `if (task.venueBookingId && column.isDoneColumn)` block
- The `isDoneColumn` select field can stay since it's still part of the board schema, but we no longer need to query it for booking logic. Simplify: remove `isDoneColumn` from the column select and the entire auto-confirm block.

**Step 6: Run typecheck**

Run: `pnpm typecheck 2>&1 | head -40`

**Step 7: Commit**

```bash
git add apps/api/src/services/admin/task.service.ts
git commit -m "refactor(api): remove booking coupling from task service"
```

---

### Task 8: Update task.service.test.ts

**Files:**
- Modify: `apps/api/src/services/admin/task.service.test.ts`

**Step 1: Read existing test file**

Read to understand current test structure.

**Step 2: Remove all booking-related test cases and assertions**

- Remove tests for booking auto-confirmation on moveTask
- Remove tests for booking info in getTaskDetail
- Remove `matchId`/`venueBookingId`/`sourceType` assertions from createTask/listTasks tests
- Remove any mocks/fixtures related to venue bookings

**Step 3: Run tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/services/admin/task.service.test.ts`
Expected: All pass.

**Step 4: Commit**

```bash
git add apps/api/src/services/admin/task.service.test.ts
git commit -m "test(api): update task service tests for booking decoupling"
```

---

### Task 9: Update task routes and schemas — Remove booking fields

**Files:**
- Modify: `apps/api/src/routes/admin/task.schemas.ts:28-37`
- Modify: `apps/api/src/routes/admin/task.routes.ts`

**Step 1: Clean up task schemas**

In `apps/api/src/routes/admin/task.schemas.ts`:
- Remove `matchId` from `taskCreateBodySchema` (line 35)
- Remove `venueBookingId` from `taskCreateBodySchema` (line 36)

**Step 2: Clean up task routes**

In `apps/api/src/routes/admin/task.routes.ts`:
- The routes just pass validated data to services, so they should work once schemas and services are updated.
- Verify no direct references to removed fields.

**Step 3: Update task route tests**

In `apps/api/src/routes/admin/task.routes.test.ts`:
- Remove `matchId`/`venueBookingId` from test request bodies
- Remove booking-related assertions from responses

In `apps/api/src/routes/admin/task.schemas.test.ts`:
- Remove test cases for `matchId`/`venueBookingId` validation

**Step 4: Run tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/routes/admin/task.routes.test.ts apps/api/src/routes/admin/task.schemas.test.ts`
Expected: All pass.

**Step 5: Commit**

```bash
git add apps/api/src/routes/admin/task.schemas.ts apps/api/src/routes/admin/task.routes.ts apps/api/src/routes/admin/task.routes.test.ts apps/api/src/routes/admin/task.schemas.test.ts
git commit -m "refactor(api): remove booking fields from task routes and schemas"
```

---

### Task 10: Update booking-admin.service.ts — Remove task references, add create/delete

**Files:**
- Modify: `apps/api/src/services/admin/booking-admin.service.ts:1-343`

**Step 1: Remove task imports and references**

- Remove `tasks` and `boardColumns` from imports (lines 8-9)
- Remove `BookingDetailTask` from shared imports (line 16)

**Step 2: Clean up listBookings()**

In `listBookings()` (lines 26-94):
- Remove the `leftJoin(tasks, ...)` (line 73)
- Remove `taskId` and `taskTitle` from select (lines 67-68)
- Remove `task` from the returned objects (line 92)

**Step 3: Clean up getBookingDetail()**

In `getBookingDetail()` (lines 96-192):
- Remove the linked task fetch block (lines 156-167)
- Remove `task` from return object (line 190)

**Step 4: Clean up updateBooking()**

In `updateBooking()` (lines 202-272):
- Remove the linked task fetch (lines 248-252)
- Remove `task` from returned object (line 270)

**Step 5: Clean up updateBookingStatus()**

In `updateBookingStatus()` (lines 274-342):
- Remove the linked task fetch (lines 318-322)
- Remove `task` from returned object (line 340)

**Step 6: Add createBooking() function**

Add after `updateBookingStatus()`:

```typescript
export interface BookingCreateData {
  venueId: number;
  date: string;
  overrideStartTime: string;
  overrideEndTime: string;
  overrideReason?: string | null;
  notes?: string | null;
  matchIds?: number[];
}

export async function createBooking(
  data: BookingCreateData,
): Promise<BookingDetail | null> {
  // Verify venue exists
  const [venue] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.id, data.venueId))
    .limit(1);

  if (!venue) return null;

  // Check for duplicate (same venue + date)
  const [existing] = await db
    .select({ id: venueBookings.id })
    .from(venueBookings)
    .where(
      and(
        eq(venueBookings.venueId, data.venueId),
        eq(venueBookings.date, data.date),
      ),
    )
    .limit(1);

  if (existing) return null; // Conflict — booking already exists for this venue+date

  const [created] = await db
    .insert(venueBookings)
    .values({
      venueId: data.venueId,
      date: data.date,
      overrideStartTime: data.overrideStartTime,
      overrideEndTime: data.overrideEndTime,
      overrideReason: data.overrideReason ?? null,
      notes: data.notes ?? null,
      status: "pending",
      needsReconfirmation: false,
    })
    .returning({ id: venueBookings.id });

  if (!created) return null;

  // Link matches if provided
  if (data.matchIds && data.matchIds.length > 0) {
    for (const matchId of data.matchIds) {
      await db.insert(venueBookingMatches).values({
        venueBookingId: created.id,
        matchId,
      });
    }
  }

  return getBookingDetail(created.id);
}
```

**Step 7: Add deleteBooking() function**

```typescript
export async function deleteBooking(id: number): Promise<boolean> {
  // Junction entries cascade via FK, so just delete the booking
  const [deleted] = await db
    .delete(venueBookings)
    .where(eq(venueBookings.id, id))
    .returning({ id: venueBookings.id });

  return !!deleted;
}
```

**Step 8: Run typecheck**

Run: `pnpm typecheck 2>&1 | head -40`

**Step 9: Commit**

```bash
git add apps/api/src/services/admin/booking-admin.service.ts
git commit -m "refactor(api): decouple booking service from tasks, add create/delete"
```

---

### Task 11: Update booking-admin.service.test.ts

**Files:**
- Modify: `apps/api/src/services/admin/booking-admin.service.test.ts`

**Step 1: Read existing test file**

**Step 2: Remove task-related test assertions**

- Remove assertions checking `task` field in list/detail/update responses
- Remove any task mocks

**Step 3: Add tests for createBooking()**

- Test: creates booking with venue, date, times
- Test: creates booking with optional match links
- Test: returns null for non-existent venue
- Test: returns null for duplicate venue+date

**Step 4: Add tests for deleteBooking()**

- Test: deletes existing booking, returns true
- Test: returns false for non-existent booking
- Test: cascade-deletes junction entries

**Step 5: Run tests with coverage**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/services/admin/booking-admin.service.test.ts`
Expected: All pass.

**Step 6: Commit**

```bash
git add apps/api/src/services/admin/booking-admin.service.test.ts
git commit -m "test(api): update booking admin service tests, add create/delete tests"
```

---

### Task 12: Update booking routes — Add POST and DELETE endpoints

**Files:**
- Modify: `apps/api/src/routes/admin/booking.routes.ts:1-105`
- Modify: `apps/api/src/routes/admin/booking.schemas.ts:1-28`

**Step 1: Add create and delete schemas**

In `apps/api/src/routes/admin/booking.schemas.ts`, add:

```typescript
export const bookingCreateBodySchema = z.object({
  venueId: z.number().int().positive(),
  date: dateSchema,
  overrideStartTime: timeSchema,
  overrideEndTime: timeSchema,
  overrideReason: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  matchIds: z.array(z.number().int().positive()).optional(),
});

export type BookingCreateBody = z.infer<typeof bookingCreateBodySchema>;
```

**Step 2: Add POST and DELETE routes**

In `apps/api/src/routes/admin/booking.routes.ts`:
- Import `createBooking` and `deleteBooking` from service
- Import `bookingCreateBodySchema` from schemas

Add after existing routes:

```typescript
// POST /admin/bookings - Create booking manually
bookingRoutes.post(
  "/bookings",
  describeRoute({
    description: "Create a booking manually",
    tags: ["Bookings"],
    responses: {
      201: { description: "Created" },
      404: { description: "Venue not found" },
      409: { description: "Booking already exists for this venue and date" },
    },
  }),
  async (c) => {
    const body = bookingCreateBodySchema.parse(await c.req.json());
    const result = await createBooking(body);

    if (!result) {
      return c.json(
        { error: "Venue not found or booking already exists", code: "CONFLICT" },
        409,
      );
    }

    return c.json(result, 201);
  },
);

// DELETE /admin/bookings/:id - Delete booking
bookingRoutes.delete(
  "/bookings/:id",
  describeRoute({
    description: "Delete a booking",
    tags: ["Bookings"],
    responses: {
      200: { description: "Deleted" },
      404: { description: "Booking not found" },
    },
  }),
  async (c) => {
    const { id } = bookingIdParamSchema.parse({ id: c.req.param("id") });
    const deleted = await deleteBooking(id);

    if (!deleted) {
      return c.json({ error: "Booking not found", code: "NOT_FOUND" }, 404);
    }

    return c.json({ success: true });
  },
);
```

**Step 3: Commit**

```bash
git add apps/api/src/routes/admin/booking.routes.ts apps/api/src/routes/admin/booking.schemas.ts
git commit -m "feat(api): add POST and DELETE booking endpoints"
```

---

### Task 13: Update booking route and schema tests

**Files:**
- Modify: `apps/api/src/routes/admin/booking.routes.test.ts`
- Modify: `apps/api/src/routes/admin/booking.schemas.test.ts`

**Step 1: Read existing test files**

**Step 2: Remove task-related assertions from existing tests**

- Remove `task` field from expected response shapes

**Step 3: Add tests for POST /admin/bookings**

- Test: creates booking with valid data, returns 201
- Test: creates booking with matchIds linked
- Test: returns 409 for duplicate venue+date
- Test: validates required fields (venueId, date, times)

**Step 4: Add tests for DELETE /admin/bookings/:id**

- Test: deletes existing booking, returns 200
- Test: returns 404 for non-existent booking

**Step 5: Add schema tests for bookingCreateBodySchema**

- Test: valid create body passes
- Test: missing required fields rejected
- Test: invalid matchIds rejected

**Step 6: Run tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/routes/admin/booking.routes.test.ts apps/api/src/routes/admin/booking.schemas.test.ts`
Expected: All pass.

**Step 7: Commit**

```bash
git add apps/api/src/routes/admin/booking.routes.test.ts apps/api/src/routes/admin/booking.schemas.test.ts
git commit -m "test(api): update booking route/schema tests, add create/delete tests"
```

---

### Task 14: Update notification service — Remove task/booking references

**Files:**
- Modify: `apps/api/src/routes/admin/notification.routes.ts`
- Modify: `apps/api/src/routes/admin/notification.routes.test.ts`
- Modify: `apps/api/src/routes/admin/notification.schemas.test.ts`
- Modify: `apps/api/src/services/notifications/notification.service.ts` (if it references removed columns)
- Modify: `apps/api/src/services/notifications/notification.service.test.ts`
- Modify: `apps/api/src/services/admin/notification-admin.service.ts` (if it references removed columns)
- Modify: `apps/api/src/services/admin/notification-admin.service.test.ts`

**Step 1: Read notification-related files**

Read all notification service/route files to find references to `relatedTaskId` and `relatedBookingId`.

**Step 2: Remove all references to removed columns**

- Remove `relatedTaskId` and `relatedBookingId` from any queries, inserts, selects, response mappings
- Update tests accordingly

**Step 3: Run tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/routes/admin/notification.routes.test.ts apps/api/src/services/notifications/notification.service.test.ts apps/api/src/services/admin/notification-admin.service.test.ts`
Expected: All pass.

**Step 4: Commit**

```bash
git add -u
git commit -m "refactor(api): remove task/booking references from notification system"
```

---

### Task 15: Update match.routes.ts — Keep reconciliation call

**Files:**
- Modify: `apps/api/src/routes/admin/match.routes.ts:84-87`

**Step 1: Verify reconciliation import still works**

The dynamic import at line 85 imports from `venue-booking.service` which still exists. The `reconcileMatch` function is unchanged. No changes needed — just verify it compiles.

**Step 2: Run typecheck**

Run: `pnpm typecheck 2>&1 | head -20`
Expected: Clean (no errors remaining from schema changes).

**Step 3: Run match route tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/routes/admin/match.routes.test.ts`
Expected: All pass.

**Step 4: Commit (if any fixes needed)**

---

### Task 16: Add booking info to match list/detail responses (backlinking)

**Files:**
- Modify: `packages/shared/src/matches.ts:18-53`
- Modify: `apps/api/src/services/admin/match-query.service.ts:282-352`

**Step 1: Add booking info to shared match types**

In `packages/shared/src/matches.ts`, add to `MatchListItem` (after `overriddenFields`):

```typescript
booking: {
  id: number;
  status: string;
  needsReconfirmation: boolean;
} | null;
```

Add to `MatchDetail` (or it will inherit from `MatchListItem`).

**Step 2: Update getOwnClubMatches() to include booking info**

In `apps/api/src/services/admin/match-query.service.ts`, after loading overrides (around line 330-343):

Add a query to batch-load booking info for all match IDs:

```typescript
const bookingLinks = matchIds.length > 0
  ? await db
      .select({
        matchId: venueBookingMatches.matchId,
        bookingId: venueBookings.id,
        bookingStatus: venueBookings.status,
        needsReconfirmation: venueBookings.needsReconfirmation,
      })
      .from(venueBookingMatches)
      .innerJoin(venueBookings, eq(venueBookings.id, venueBookingMatches.venueBookingId))
      .where(inArray(venueBookingMatches.matchId, matchIds))
  : [];

const bookingByMatch = new Map(
  bookingLinks.map((b) => [b.matchId, {
    id: b.bookingId,
    status: b.bookingStatus,
    needsReconfirmation: b.needsReconfirmation,
  }]),
);
```

Update the `items` mapping to include `booking: bookingByMatch.get(row.id) ?? null`.

Import `venueBookingMatches` and `venueBookings` from `@dragons/db/schema`.

**Step 3: Update getMatchDetail() / buildDetailResponse() to include booking info**

The detail view should also include booking info. Add a similar lookup after the existing queries.

**Step 4: Run typecheck**

Run: `pnpm typecheck 2>&1 | head -40`

**Step 5: Commit**

```bash
git add packages/shared/src/matches.ts apps/api/src/services/admin/match-query.service.ts
git commit -m "feat(api): add booking info to match list and detail responses"
```

---

### Task 17: Update match service tests for booking backlinking

**Files:**
- Modify: `apps/api/src/services/admin/match-admin.service.test.ts`
- Modify: `apps/api/src/routes/admin/match.routes.test.ts`

**Step 1: Read existing test files**

**Step 2: Add/update tests**

- Update existing match list response assertions to include `booking: null` (or actual booking data if test data includes bookings)
- Add test: match linked to a booking returns booking info in list response
- Add test: match detail includes booking info

**Step 3: Run tests**

Run: `pnpm --filter @dragons/api test -- --run apps/api/src/services/admin/match-admin.service.test.ts apps/api/src/routes/admin/match.routes.test.ts`
Expected: All pass.

**Step 4: Commit**

```bash
git add apps/api/src/services/admin/match-admin.service.test.ts apps/api/src/routes/admin/match.routes.test.ts
git commit -m "test(api): add booking backlinking tests to match service/routes"
```

---

### Task 18: Generate and run Drizzle migration

**Files:**
- Create: `packages/db/drizzle/XXXX_*.sql` (auto-generated)

**Step 1: Generate migration**

Run: `pnpm --filter @dragons/db db:generate`
Expected: Migration file created removing columns from `tasks` and `notifications` tables.

**Step 2: Review the generated SQL**

Read the generated migration file. Verify it:
- Drops `match_id`, `venue_booking_id`, `source_type`, `source_detail` from `tasks`
- Drops `tasks_match_id_idx`, `tasks_venue_booking_idx` indexes
- Drops `related_task_id`, `related_booking_id` from `notifications`

**Step 3: Run migration against dev database**

Run: `pnpm --filter @dragons/db db:migrate`
Expected: Migration applied successfully.

**Step 4: Commit**

```bash
git add packages/db/drizzle/
git commit -m "chore(db): add migration for booking-task decoupling"
```

---

### Task 19: Run full test suite and coverage

**Step 1: Run all tests**

Run: `pnpm --filter @dragons/api test`
Expected: All tests pass.

**Step 2: Run coverage**

Run: `pnpm --filter @dragons/api coverage`
Expected: 100% on branches, functions, lines, statements.

**Step 3: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: Clean.

**Step 4: Fix any remaining issues**

Address any test failures or coverage gaps.

**Step 5: Commit fixes if needed**

---

### Task 20: Frontend — Clean up board/task components (remove booking refs)

**Files:**
- Modify: `apps/web/src/components/admin/board/create-task-dialog.tsx`
- Modify: `apps/web/src/components/admin/board/task-detail-sheet.tsx`
- Modify: `apps/web/src/components/admin/board/task-card.tsx`
- Modify: `apps/web/src/components/admin/board/kanban-board.tsx`

**Step 1: Clean up create-task-dialog.tsx**

Remove any `matchId` or `venueBookingId` fields from the create form and submission.

**Step 2: Clean up task-detail-sheet.tsx**

Remove the linked booking info section (the section displaying venue name, date, time window, matches, status badge, reconfirmation alert — approximately lines 194-250).

**Step 3: Clean up task-card.tsx**

Remove any booking-related indicators or source type display.

**Step 4: Clean up kanban-board.tsx**

Remove any booking auto-confirm logic triggered on drag to done column (this is handled server-side in moveTask, which we already cleaned up).

**Step 5: Commit**

```bash
git add apps/web/src/components/admin/board/
git commit -m "refactor(ui): remove booking references from board/task components"
```

---

### Task 21: Frontend — Update match list table with optional booking column

**Files:**
- Modify: `apps/web/src/components/admin/matches/match-list-table.tsx`
- Modify: `apps/web/src/components/admin/matches/types.ts`

**Step 1: Update MatchListItem type**

In `apps/web/src/components/admin/matches/types.ts`, add to the frontend `MatchListItem` type:

```typescript
booking: {
  id: number;
  status: string;
  needsReconfirmation: boolean;
} | null;
```

**Step 2: Add booking column to match list table**

In `apps/web/src/components/admin/matches/match-list-table.tsx`, add a new column in `getColumns()`:

```typescript
{
  id: "booking",
  accessorFn: (row) => row.booking?.status ?? null,
  header: ({ column }) => (
    <DataTableColumnHeader column={column} title={t("columns.booking")} />
  ),
  cell: ({ row }) => {
    const booking = row.original.booking;
    if (!booking) return null;
    return (
      <Badge
        variant={
          booking.status === "confirmed"
            ? "success"
            : booking.status === "cancelled"
              ? "destructive"
              : "secondary"
        }
      >
        {booking.needsReconfirmation && "⚠ "}
        {booking.status}
      </Badge>
    );
  },
  meta: { label: t("columns.booking") },
},
```

**Step 3: Set column hidden by default**

In the `initialColumnVisibility` prop of `DataTable` (line 323), add `booking: false`:

```typescript
initialColumnVisibility={{ score: false, publicComment: false, status: false, booking: false }}
```

**Step 4: Add translation key**

Add `"booking": "Booking"` to the matches translations (check the i18n files).

**Step 5: Commit**

```bash
git add apps/web/src/components/admin/matches/
git commit -m "feat(ui): add optional booking column to match list table"
```

---

### Task 22: Frontend — Add booking info to match detail view

**Files:**
- Modify: `apps/web/src/components/admin/matches/match-detail-view.tsx`
- Modify: `apps/web/src/components/admin/matches/types.ts`

**Step 1: Update MatchDetail type (if needed)**

Ensure `MatchDetail` includes the `booking` field (inherited from `MatchListItem` if it extends it).

**Step 2: Add booking card to match detail view**

In `apps/web/src/components/admin/matches/match-detail-view.tsx`, add a booking info card in the left column (after the status card, around line 338):

```tsx
{match.booking && (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">{t("matchDetail.booking.title")}</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="flex items-center gap-2">
        <Badge
          variant={
            match.booking.status === "confirmed"
              ? "success"
              : match.booking.status === "cancelled"
                ? "destructive"
                : "secondary"
          }
        >
          {match.booking.status}
        </Badge>
        {match.booking.needsReconfirmation && (
          <Badge variant="outline" className="border-amber-500 text-amber-600">
            {t("matchDetail.booking.needsReconfirmation")}
          </Badge>
        )}
        <Link href={`/admin/bookings`}>
          <Button variant="link" size="sm" className="h-auto p-0">
            {t("matchDetail.booking.viewBooking")}
          </Button>
        </Link>
      </div>
    </CardContent>
  </Card>
)}
```

**Step 3: Add translation keys**

Add booking-related translation keys to the match detail translations.

**Step 4: Commit**

```bash
git add apps/web/src/components/admin/matches/
git commit -m "feat(ui): show booking info in match detail view"
```

---

### Task 23: Frontend — Enhance booking list page with management features

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/bookings/page.tsx`
- Modify: `apps/web/src/components/admin/bookings/booking-list-table.tsx`

**Step 1: Enhance booking list table**

Upgrade `booking-list-table.tsx` to use TanStack Table (like the match list) for:
- Status filter tabs/dropdown (all / pending / requested / confirmed / cancelled)
- Date range filter
- Column visibility toggle
- Sortable columns

The existing implementation already has basic status filtering and a table. Enhance it with:
- Inline status change dropdown per row (already exists)
- `needsReconfirmation` warning indicator
- Click row to open detail panel

**Step 2: Add row click handler**

On row click, either navigate to a detail route or open a sheet/dialog with booking details.

**Step 3: Commit**

```bash
git add apps/web/src/app/[locale]/admin/bookings/ apps/web/src/components/admin/bookings/
git commit -m "feat(ui): enhance booking list with management features"
```

---

### Task 24: Frontend — Create booking detail sheet/panel

**Files:**
- Create: `apps/web/src/components/admin/bookings/booking-detail-sheet.tsx`

**Step 1: Create booking detail sheet component**

A Sheet (side panel) that shows when a booking row is clicked:
- Booking info: venue name, date, status badge
- Time details: calculated times vs override times
- Override editing: start/end time inputs, reason textarea
- Linked matches list (with match details)
- Notes field
- Status controls (button group to change status)
- `needsReconfirmation` warning if flagged

The component should:
- Fetch detail from `GET /admin/bookings/:id`
- PATCH to `/admin/bookings/:id` on save
- PATCH to `/admin/bookings/:id/status` on status change
- Revalidate SWR on changes

**Step 2: Wire into booking list table**

Import `BookingDetailSheet` in the booking list table and show it when a row is clicked (similar to how `MatchEditSheet` works in the match list).

**Step 3: Commit**

```bash
git add apps/web/src/components/admin/bookings/
git commit -m "feat(ui): add booking detail sheet with time overrides and status controls"
```

---

### Task 25: Frontend — Create manual booking dialog

**Files:**
- Create: `apps/web/src/components/admin/bookings/create-booking-dialog.tsx`

**Step 1: Create the dialog component**

A Dialog for manual booking creation with fields:
- Venue selector (combobox, fetches from `GET /admin/venues`)
- Date picker
- Start time / End time inputs
- Notes textarea (optional)
- Match picker (optional, multi-select from unbooked home matches)

On submit: `POST /admin/bookings` with the form data.

**Step 2: Add "New Booking" button to the booking page**

In `booking-list-table.tsx` or the page component, add a button that opens the dialog.

**Step 3: Add SWR key for bookings and revalidate on create**

**Step 4: Commit**

```bash
git add apps/web/src/components/admin/bookings/ apps/web/src/app/[locale]/admin/bookings/
git commit -m "feat(ui): add manual booking creation dialog"
```

---

### Task 26: Frontend — Add delete booking functionality

**Files:**
- Modify: `apps/web/src/components/admin/bookings/booking-detail-sheet.tsx`

**Step 1: Add delete button to booking detail sheet**

Add a destructive "Delete Booking" button (with confirmation dialog) that calls `DELETE /admin/bookings/:id`.

**Step 2: Revalidate list on delete**

After successful delete, close the sheet and revalidate the booking list.

**Step 3: Commit**

```bash
git add apps/web/src/components/admin/bookings/
git commit -m "feat(ui): add delete booking functionality"
```

---

### Task 27: Add i18n translation keys

**Files:**
- Modify: `apps/web/messages/en.json` (or equivalent i18n files)
- Modify: `apps/web/messages/de.json`

**Step 1: Identify i18n file location and pattern**

Check existing i18n setup to understand key structure.

**Step 2: Add translation keys**

Add keys for:
- Booking management page: filters, table headers, status labels, empty states
- Booking detail sheet: time fields, override fields, status controls, delete confirmation
- Create booking dialog: field labels, placeholders, validation messages
- Match list booking column: "Booking"
- Match detail booking card: title, status, reconfirmation warning, view link

**Step 3: Commit**

```bash
git add apps/web/messages/
git commit -m "feat(i18n): add translation keys for booking management"
```

---

### Task 28: Update AGENTS.md documentation

**Files:**
- Modify: `AGENTS.md`

**Step 1: Update data model section**

- Update `tasks` table: remove `matchId`, `venueBookingId`, `sourceType`, `sourceDetail` columns
- Update `notifications` table: remove `relatedTaskId`, `relatedBookingId` columns
- Update entity relationship diagram if boards/tasks are shown linked to bookings

**Step 2: Update API endpoints section**

- Add `POST /admin/bookings` and `DELETE /admin/bookings/:id`
- Remove `task` from booking response descriptions
- Note booking info in match list/detail responses

**Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md for booking refactor"
```

---

### Task 29: Final verification

**Step 1: Run full test suite**

Run: `pnpm test`
Expected: All pass.

**Step 2: Run coverage**

Run: `pnpm coverage`
Expected: 100% thresholds met.

**Step 3: Run lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: Clean.

**Step 4: Run AI slop check**

Run: `pnpm check:ai-slop`
Expected: Clean.

**Step 5: Build**

Run: `pnpm build`
Expected: Clean build.

**Step 6: Manual smoke test (optional)**

Start dev servers and verify:
- Booking page loads with list
- Can create a manual booking
- Can change booking status inline
- Can view booking detail
- Can delete a booking
- Match list shows booking column (when enabled)
- Match detail shows booking badge
- Board/kanban works independently (no booking references)
